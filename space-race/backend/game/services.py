"""
Draft + match logic. All functions are synchronous and transactional;
consumers call them via database_sync_to_async.

The Postgres row lock (select_for_update) on the Match is what makes the
shared pool safe: if both players click the last GaAs array in the same
millisecond, one transaction waits for the other and sees stock = 0.
"""
import random
import time

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import bot, nasa
from .models import Component, Match, Mission, PlayerStats, QueueEntry
from .sim import analyze, default_env, simulate

MAX_PER_CATEGORY = {"launch": 1, "power": 3, "battery": 3, "instrument": 4, "storage": 2,
                    "comms": 2, "propulsion": 2, "thermal": 3}
MAX_PARTS = 14


class DraftError(Exception):
    pass


# --------------------------------------------------------------------------
# Matchmaking
# --------------------------------------------------------------------------
def join_queue(user):
    """Add user to the queue; if someone else is waiting, pair them and return the Match."""
    with transaction.atomic():
        opponent_entry = (QueueEntry.objects.select_for_update(skip_locked=True)
                          .exclude(user=user).order_by("joined_at").first())
        if opponent_entry is None:
            QueueEntry.objects.get_or_create(user=user)
            return None
        opponent = opponent_entry.user
        opponent_entry.delete()
        QueueEntry.objects.filter(user=user).delete()
        return create_match(opponent, user)


def leave_queue(user):
    QueueEntry.objects.filter(user=user).delete()


def launch_catalog():
    return [c.as_sim_dict() for c in Component.objects.filter(category="launch")]


def live_env(mission_dict):
    """(env, nasa summary) from today's NASA data. Never blocks on the network, never raises."""
    try:
        cond = nasa.get_conditions(block=False)
        return nasa.mission_env(mission_dict, cond), nasa.public_summary(cond)
    except Exception:
        return default_env(mission_dict), None


def bot_user():
    from django.contrib.auth.models import User
    u, created = User.objects.get_or_create(username=bot.BOT_USERNAME)
    if created:
        u.set_unusable_password()
        u.save()
    return u


def create_bot_match(user, mission=None):
    return create_match(user, bot_user(), mission)


def _bot_uid(match):
    for uid, p in match.state["players"].items():
        if p["username"] == bot.BOT_USERNAME:
            return uid
    return None


def _bot_turn(match, st, finish=False):
    """The AI picks one part per human action; on `finish` it completes its build and readies."""
    uid = _bot_uid(match)
    if uid is None:
        return
    me = st["players"][uid]
    if me["ready"]:
        return
    mission = match.mission.as_sim_dict()
    env = st.get("env") or default_env(mission)
    comps = {c.id: c for c in Component.objects.all()}
    rng = random.Random(f"{match.seed}:{len(me['picks'])}")
    for _ in range(MAX_PARTS if finish else 1):
        mine = [comps[i].as_sim_dict() for i in me["picks"] if i in comps]
        pool = [dict(comps[int(cid)].as_sim_dict(), id=int(cid), left=left)
                for cid, left in st["pool"].items() if int(cid) in comps]
        choice = bot.choose_pick(mine, pool, mission, env, MAX_PER_CATEGORY, MAX_PARTS, rng)
        if choice is None:
            break
        st["pool"][str(choice["id"])] -= 1
        me["picks"].append(choice["id"])
    if finish:
        me["ready"] = True


def create_match(p1, p2, mission=None):
    mission = mission or random.choice(list(Mission.objects.all()))
    pool = {str(c.id): c.stock for c in Component.objects.all()}
    # Snapshot today's NASA data into the match: both players (and the launch) use identical numbers.
    env, nasa_summary = live_env(mission.as_sim_dict())
    state = dict(
        env=env,
        nasa=nasa_summary,
        phase="drafting",
        deadline=time.time() + settings.DRAFT_SECONDS,
        pool=pool,
        players={
            str(p1.id): dict(username=p1.username, picks=[], ready=False),
            str(p2.id): dict(username=p2.username, picks=[], ready=False),
        },
    )
    return Match.objects.create(mission=mission, player1=p1, player2=p2, state=state)


# --------------------------------------------------------------------------
# Draft actions
# --------------------------------------------------------------------------
def _components_by_id(ids):
    comps = Component.objects.in_bulk(set(int(i) for i in ids))
    return [comps[int(i)] for i in ids if int(i) in comps]


def apply_action(match_id, user, action: dict):
    """
    Returns (match, launched: bool). Raises DraftError for illegal moves.
    action = {"type": "pick"|"release"|"ready"|"unready"|"tick"|"forfeit", "component_id": int}
    """
    with transaction.atomic():
        match = Match.objects.select_for_update().select_related("mission").get(pk=match_id)
        if not match.has_player(user):
            raise DraftError("You are not in this match.")
        if match.status != Match.DRAFTING:
            return match, False

        st = match.state
        me = st["players"][str(user.id)]
        kind = action.get("type")

        if kind == "pick":
            if me["ready"]:
                raise DraftError("Un-ready to change your build.")
            cid = str(action.get("component_id"))
            if st["pool"].get(cid, 0) <= 0:
                raise DraftError("Sold out! Your rival grabbed the last one.")
            comp = Component.objects.get(pk=int(cid))
            picks = _components_by_id(me["picks"])
            if sum(1 for p in picks if p.category == comp.category) >= MAX_PER_CATEGORY[comp.category]:
                raise DraftError(f"Max {MAX_PER_CATEGORY[comp.category]} {comp.get_category_display()} parts.")
            if len(picks) >= MAX_PARTS:
                raise DraftError("Spacecraft bus is full.")
            mission_d = match.mission.as_sim_dict()
            env = st.get("env") or default_env(mission_d)
            after = analyze([p.as_sim_dict() for p in picks] + [comp.as_sim_dict()], mission_d, env)
            if after["budget_left"] < 0:
                raise DraftError(f"That would put the full mission cost (${after['cost']:.0f}M incl. bus, "
                                 f"reserves, ops) over the ${match.mission.budget}M cap.")
            st["pool"][cid] -= 1
            me["picks"].append(int(cid))

        elif kind == "release":
            if me["ready"]:
                raise DraftError("Un-ready to change your build.")
            cid = int(action.get("component_id"))
            if cid not in me["picks"]:
                raise DraftError("You don't own that part.")
            me["picks"].remove(cid)
            st["pool"][str(cid)] += 1

        elif kind == "ready":
            me["ready"] = True
        elif kind == "unready":
            me["ready"] = False
        elif kind == "forfeit":
            _finish_forfeit(match, user)
            return match, True
        elif kind == "tick":
            pass  # just lets the server check the deadline
        else:
            raise DraftError(f"Unknown action {kind!r}")

        # AI rival: one pick per human move; completes its build when you ready up or time runs out
        if _bot_uid(match) and str(user.id) != _bot_uid(match):
            if kind in ("pick", "release"):
                _bot_turn(match, st)
            elif kind == "ready" or time.time() >= st["deadline"]:
                _bot_turn(match, st, finish=True)

        all_ready = all(p["ready"] for p in st["players"].values())
        if all_ready or time.time() >= st["deadline"]:
            _launch(match)
            return match, True

        match.state = st
        match.save(update_fields=["state"])
        return match, False


def public_state(match):
    """Everything the clients need to render the board (both builds are visible: it's a draft)."""
    mission = match.mission.as_sim_dict()
    env = match.state.get("env") or default_env(mission)
    lvs = launch_catalog()
    players = {}
    for uid, p in match.state["players"].items():
        parts = [c.as_sim_dict() for c in _components_by_id(p["picks"])]
        players[uid] = dict(p, stats=analyze(parts, mission, env, lvs))
    return dict(
        env=nasa.env_summary(env),
        nasa=match.state.get("nasa"),
        match_id=str(match.id),
        status=match.status,
        phase=match.state.get("phase"),
        deadline=match.state.get("deadline"),
        server_time=time.time(),
        mission=mission,
        pool=match.state["pool"],
        players=players,
    )


# --------------------------------------------------------------------------
# Launch + scoring
# --------------------------------------------------------------------------
def _launch(match):
    mission = match.mission.as_sim_dict()
    env = match.state.get("env") or default_env(mission)
    results = {}
    for uid, p in match.state["players"].items():
        parts = [c.as_sim_dict() for c in _components_by_id(p["picks"])]
        # same seed for both players: identical dice, only engineering differs
        results[uid] = simulate(parts, mission, seed=f"{match.seed}", env=env)
        results[uid]["username"] = p["username"]

    u1, u2 = str(match.player1_id), str(match.player2_id)
    s1, s2 = results[u1]["score"], results[u2]["score"]
    match.winner_id = match.player1_id if s1 > s2 else match.player2_id if s2 > s1 else None
    match.results = results
    match.state["phase"] = "finished"
    match.status = Match.FINISHED
    match.finished_at = timezone.now()
    match.save()
    _update_stats(match, s1, s2)


def _finish_forfeit(match, user):
    match.winner_id = match.player2_id if user.id == match.player1_id else match.player1_id
    match.status = Match.ABANDONED
    match.state["phase"] = "finished"
    match.results = {"forfeit_by": str(user.id)}
    match.finished_at = timezone.now()
    match.save()
    s1, s2 = (0, 1) if user.id == match.player1_id else (1, 0)
    _update_stats(match, s1, s2, record_scores=False)


def _update_stats(match, s1, s2, record_scores=True, k=32):
    a, _ = PlayerStats.objects.select_for_update().get_or_create(user_id=match.player1_id)
    b, _ = PlayerStats.objects.select_for_update().get_or_create(user_id=match.player2_id)
    expected_a = 1 / (1 + 10 ** ((b.rating - a.rating) / 400))
    actual_a = 1.0 if s1 > s2 else 0.0 if s2 > s1 else 0.5
    delta = round(k * (actual_a - expected_a))
    a.rating += delta
    b.rating -= delta
    for stats, mine, theirs in ((a, s1, s2), (b, s2, s1)):
        stats.games += 1
        if mine > theirs:
            stats.wins += 1
        elif mine < theirs:
            stats.losses += 1
        else:
            stats.draws += 1
        if record_scores:
            stats.total_score += mine
            stats.best_score = max(stats.best_score, mine)
        stats.save()
