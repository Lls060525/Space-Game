"""
Channels middleware.

TokenAuthMiddleware  - reads ?token=<DRF token> from the WebSocket URL
                       (browsers can't set headers on WebSockets) and sets scope["user"].
PresenceMiddleware   - watches websocket.connect / websocket.disconnect and
                       keeps the Redis "online" set up to date, then tells the
                       lobby group so every Lobby screen refreshes instantly.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from django.contrib.auth.models import AnonymousUser

from . import presence


@database_sync_to_async
def _user_for_token(key):
    from rest_framework.authtoken.models import Token
    try:
        return Token.objects.select_related("user").get(key=key).user
    except Token.DoesNotExist:
        return AnonymousUser()


class TokenAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        qs = parse_qs(scope.get("query_string", b"").decode())
        token = (qs.get("token") or [None])[0]
        scope = dict(scope, user=await _user_for_token(token) if token else AnonymousUser())
        return await self.inner(scope, receive, send)


async def _broadcast_presence():
    layer = get_channel_layer()
    if layer is not None:
        await layer.group_send("lobby", {"type": "presence.changed"})


class PresenceMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        user = scope.get("user")
        if user is None or not user.is_authenticated:
            return await self.inner(scope, receive, send)

        state = {"connected": False}

        async def wrapped_receive():
            message = await receive()
            if message["type"] == "websocket.connect" and not state["connected"]:
                state["connected"] = True
                if await presence.add(user.id, user.username):
                    await _broadcast_presence()
            elif message["type"] == "websocket.disconnect" and state["connected"]:
                state["connected"] = False
                if await presence.remove(user.id):
                    await _broadcast_presence()
            return message

        try:
            return await self.inner(scope, wrapped_receive, send)
        finally:
            # consumer crashed / closed without us seeing websocket.disconnect
            if state["connected"]:
                state["connected"] = False
                if await presence.remove(user.id):
                    await _broadcast_presence()
