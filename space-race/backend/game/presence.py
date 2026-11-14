"""
Who is online. Backed by a Redis set when REDIS_URL is set, otherwise an
in-process dict (fine for local dev with a single server process).

A user can have several sockets open (lobby + match, two tabs), so we keep a
per-user connection counter and only SADD/SREM on the 0 <-> 1 transitions.
"""
from django.conf import settings

ONLINE_SET = "presence:online"
COUNTS = "presence:counts"
NAMES = "presence:names"

_redis = None
_local_counts: dict[int, int] = {}
_local_names: dict[int, str] = {}


def _client():
    global _redis
    if _redis is None and settings.REDIS_URL:
        import redis.asyncio as redis
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def add(user_id: int, username: str) -> bool:
    """Returns True if the user just came online."""
    r = _client()
    if r is None:
        _local_counts[user_id] = _local_counts.get(user_id, 0) + 1
        _local_names[user_id] = username
        return _local_counts[user_id] == 1
    n = await r.hincrby(COUNTS, user_id, 1)
    await r.hset(NAMES, user_id, username)
    if n == 1:
        await r.sadd(ONLINE_SET, user_id)
        return True
    return False


async def remove(user_id: int) -> bool:
    """Returns True if the user just went offline."""
    r = _client()
    if r is None:
        _local_counts[user_id] = max(0, _local_counts.get(user_id, 0) - 1)
        if _local_counts[user_id] == 0:
            _local_counts.pop(user_id, None)
            return True
        return False
    n = await r.hincrby(COUNTS, user_id, -1)
    if n <= 0:
        await r.hdel(COUNTS, user_id)
        await r.srem(ONLINE_SET, user_id)
        return True
    return False


async def online_users() -> list[dict]:
    r = _client()
    if r is None:
        return [dict(id=uid, username=_local_names.get(uid, "?")) for uid in _local_counts]
    ids = await r.smembers(ONLINE_SET)
    if not ids:
        return []
    names = await r.hmget(NAMES, *ids)
    return [dict(id=int(i), username=n or "?") for i, n in zip(ids, names)]


async def reset():
    """Called on server start: stale counters from a crashed process would keep ghosts online."""
    r = _client()
    if r is not None:
        await r.delete(ONLINE_SET, COUNTS)
