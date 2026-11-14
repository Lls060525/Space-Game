import uuid

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import ListAPIView
from rest_framework.response import Response

from .models import Component, Match, Mission, PlayerStats
from .serializers import (ComponentSerializer, LeaderboardSerializer, MatchHistorySerializer,
                          MissionSerializer)
from .sim import analyze, simulate


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
        return PlayerStats.objects.select_related("user").filter(games__gt=0).order_by("-rating")[:50]


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
    """Solo practice: {"mission": slug, "component_ids": [..], "launch": bool}."""
    try:
        mission = Mission.objects.get(slug=request.data.get("mission"))
    except Mission.DoesNotExist:
        return Response({"detail": "Unknown mission."}, status=404)
    ids = [int(i) for i in request.data.get("component_ids", [])]
    comps = Component.objects.in_bulk(set(ids))
    parts = [comps[i].as_sim_dict() for i in ids if i in comps]
    m = mission.as_sim_dict()
    if request.data.get("launch"):
        return Response(simulate(parts, m, seed=uuid.uuid4().hex))
    return Response(analyze(parts, m))
