import uuid

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import ListAPIView
from rest_framework.response import Response

import random as _random

from .models import ClassChallenge, ClassEntry, Component, Match, Mission, PlayerStats, RoverScore
from .serializers import (ComponentSerializer, LeaderboardSerializer, MatchHistorySerializer,
                          MissionSerializer)
from . import nasa
from .services import launch_catalog, live_env
from .quiz import QUESTIONS, QUIZ_BONUS, QUIZ_PER_MATCH
from .sim import analyze, launch_options, launch_price_range, simulate


def _auth_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    PlayerStats.objects.get_or_create(user=user)
    return {"token": token.key, "user": {"id": user.id, "username": user.username}}


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not (3 <= len(username) <= 24) or len(password) < 6:
        return Response({"detail": "Username 3-24 chars, password 6+ chars."}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return Response({"detail": "Username taken."}, status=400)
    user = User.objects.create_user(username=username, password=password)
    return Response(_auth_payload(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login(request):
    user = authenticate(username=request.data.get("username"), password=request.data.get("password"))
    if user is None:
        return Response({"detail": "Wrong username or password."}, status=400)
    return Response(_auth_payload(user))


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def guest(request):
    """One-click play for demos / judges: creates a throwaway account."""
    name = (request.data.get("username") or "").strip()[:16] or "Cadet"
    user = User.objects.create_user(username=f"{name}-{uuid.uuid4().hex[:4]}")
    user.set_unusable_password()
    user.save()
    return Response(_auth_payload(user), status=status.HTTP_201_CREATED)


@api_view(["GET"])
def me(request):
    return Response({"id": request.user.id, "username": request.user.username})


class ComponentList(ListAPIView):
    permission_classes = [permissions.AllowAny]
    queryset = Component.objects.all()
    serializer_class = ComponentSerializer
    pagination_class = None


class MissionList(ListAPIView):
    permission_classes = [permissions.AllowAny]
    queryset = Mission.objects.all()
    serializer_class = MissionSerializer
    pagination_class = None


class Leaderboard(ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = LeaderboardSerializer
    pagination_class = None

    def get_queryset(self):
        from .bot import BOT_USERNAME
        return (PlayerStats.objects.select_related("user").filter(games__gt=0)
                .exclude(user__username=BOT_USERNAME).order_by("-rating")[:50])


class MyMatches(ListAPIView):
    serializer_class = MatchHistorySerializer
    pagination_class = None

    def get_queryset(self):
        u = self.request.user
        return (Match.objects.filter(Q(player1=u) | Q(player2=u))
                .select_related("mission", "player1", "player2", "winner").order_by("-created_at")[:20])


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def practice(request):
    """Solo practice: {"mission": slug, "component_ids": [..], "launch": bool, "class_code": optional}."""
    challenge = None
    code = (request.data.get("class_code") or "").strip().upper()
    if code:
        challenge = ClassChallenge.objects.select_related("mission").filter(code=code).first()
        if challenge is None:
            return Response({"detail": "Unknown class code."}, status=404)
        mission = challenge.mission
    else:
        try:
            mission = Mission.objects.get(slug=request.data.get("mission"))
        except Mission.DoesNotExist:
            return Response({"detail": "Unknown mission."}, status=404)
    ids = [int(i) for i in request.data.get("component_ids", [])]
    comps = Component.objects.in_bulk(set(ids))
    parts = [comps[i].as_sim_dict() for i in ids if i in comps]
    m = mission.as_sim_dict()
    if not challenge:   # quiz bonus in solo practice (class challenges stay identical for everyone)
        try:
            m["budget"] += max(0, min(int(request.data.get("bonus_budget") or 0), QUIZ_BONUS * QUIZ_PER_MATCH))
        except (TypeError, ValueError):
            pass
    env = challenge.env if challenge and challenge.env else live_env(m)[0]
    if request.data.get("launch"):
        # class mode: everyone gets the same dice, so the leaderboard measures engineering only
        result = simulate(parts, m, seed=challenge.seed if challenge else uuid.uuid4().hex, env=env)
        if challenge and request.user.is_authenticated:
            ClassEntry.objects.create(challenge=challenge, user=request.user, score=result["score"],
                                      success=result["success"], science_pct=result["science_pct"],
                                      cost=result["stats"]["cost"], build=[p["slug"] for p in parts])
        return Response(result)
    return Response(analyze(parts, m, env, launch_catalog()))


CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # no 0/O/1/I confusion


@api_view(["POST"])
def class_create(request):
    """Teacher: {"mission": slug, "title": str} -> {"code"}."""
    try:
        mission = Mission.objects.get(slug=request.data.get("mission"))
    except Mission.DoesNotExist:
        return Response({"detail": "Unknown mission."}, status=404)
    env, _ = live_env(mission.as_sim_dict())
    for _ in range(20):
        code = "".join(_random.choice(CODE_CHARS) for _ in range(6))
        if not ClassChallenge.objects.filter(code=code).exists():
            break
    ch = ClassChallenge.objects.create(code=code, mission=mission, env=env, created_by=request.user,
                                       title=(request.data.get("title") or "")[:80])
    return Response(_class_payload(ch), status=201)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def class_detail(request, code):
    ch = ClassChallenge.objects.select_related("mission", "created_by").filter(code=code.upper()).first()
    if ch is None:
        return Response({"detail": "Unknown class code."}, status=404)
    return Response(_class_payload(ch))


def _class_payload(ch):
    best, attempts = {}, {}
    for e in ch.entries.select_related("user").order_by("-score", "cost"):
        attempts[e.user_id] = attempts.get(e.user_id, 0) + 1
        best.setdefault(e.user_id, dict(username=e.user.username, score=e.score, success=e.success,
                                         science_pct=e.science_pct, cost=e.cost))
    board = [dict(b, attempts=attempts[uid]) for uid, b in best.items()]
    return dict(code=ch.code, title=ch.title, mission=ch.mission.slug, mission_name=ch.mission.name,
                destination=ch.mission.destination, created_by=ch.created_by.username if ch.created_by else None,
                launch_date=(ch.env or {}).get("launch_date"), leaderboard=board[:50])


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def validation(request):
    """Simulator equations vs published NASA / launch-provider numbers."""
    from .validation import SOURCES, checks
    rows = checks()
    return Response(dict(checks=rows, passed=sum(r["passed"] for r in rows), total=len(rows), sources=SOURCES))


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def nasa_conditions(request):
    """Live NASA data: JPL Horizons geometry + DONKI space weather, and what it means for every mission."""
    try:
        cond = nasa.get_conditions(block=True)
    except Exception as e:  # pragma: no cover - get_conditions already falls back
        return Response({"detail": f"NASA data unavailable: {e}"}, status=503)
    out = nasa.public_summary(cond)
    out["sites"] = nasa.surface_sites(cond)
    lvs = launch_catalog()
    out["missions"] = {}
    for m in Mission.objects.all():
        env = nasa.env_summary(nasa.mission_env(m.as_sim_dict(), cond))
        opts = launch_options(lvs, env["c3"])
        # estimated rocket price range for a small / medium / large probe on today's trajectory
        env["launch_options"] = opts
        env["launch_ranges"] = [dict(r, label=label) for label, kg in
                                (("Small probe", 600), ("Medium orbiter", 1500), ("Large orbiter", 4000))
                                for r in [launch_price_range(opts, kg) or dict(mass_kg=kg, low=None, high=None,
                                                                               cheapest=None, count=0)]]
        out["missions"][m.slug] = env
    return Response(out)


ROVER_PLANETS = {"Mars", "Moon", "Venus"}


@api_view(["GET", "POST"])
@permission_classes([permissions.AllowAny])
def rover_scores(request):
    """GET ?planet=Mars -> top 10 (best run per pilot). POST {planet, score, samples, build} (logged in)."""
    if request.method == "POST":
        if not request.user.is_authenticated:
            return Response({"detail": "Log in to submit."}, status=401)
        planet = request.data.get("planet")
        try:
            score = int(request.data.get("score", 0))
        except (TypeError, ValueError):
            return Response({"detail": "Bad score."}, status=400)
        if planet not in ROVER_PLANETS or not (0 <= score <= 20000):
            return Response({"detail": "Bad planet or score."}, status=400)
        RoverScore.objects.create(user=request.user, planet=planet, score=score,
                                  samples=int(request.data.get("samples", 0) or 0),
                                  build=request.data.get("build") or [])
        return Response({"ok": True}, status=201)

    planet = request.query_params.get("planet", "Mars")
    best = {}
    for row in RoverScore.objects.filter(planet=planet).select_related("user").order_by("-score")[:200]:
        best.setdefault(row.user_id, {"username": row.user.username, "score": row.score, "samples": row.samples})
    return Response(list(best.values())[:10])


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def quiz_practice(request):
    """Solo practice: random questions WITH answers (graded in the browser; no stakes)."""
    import random
    n = max(1, min(int(request.query_params.get("n", QUIZ_PER_MATCH)), len(QUESTIONS)))
    return Response({"bonus": QUIZ_BONUS, "questions": random.sample(QUESTIONS, n)})
