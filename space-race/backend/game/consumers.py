"""
WebSocket consumers.

/ws/lobby/            presence list + matchmaking
/ws/match/<uuid>/     live drafting board + launch results

Message protocol (JSON) -- see README.md for the full table.
"""
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from . import presence, services
from .models import Match


def user_group(user_id):
    return f"user_{user_id}"


class LobbyConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close(code=4401)
            return
        await self.channel_layer.group_add("lobby", self.channel_name)
        await self.channel_layer.group_add(user_group(self.user.id), self.channel_name)
        await self.accept()
        await self.send_presence()

    async def disconnect(self, code):
        if getattr(self, "user", None) and self.user.is_authenticated:
            await database_sync_to_async(services.leave_queue)(self.user)
            await self.channel_layer.group_discard("lobby", self.channel_name)
            await self.channel_layer.group_discard(user_group(self.user.id), self.channel_name)

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "find_match":
            match = await database_sync_to_async(services.join_queue)(self.user)
            if match is None:
                await self.send_json({"type": "queued"})
            else:
                for uid in (match.player1_id, match.player2_id):
                    await self.channel_layer.group_send(
                        user_group(uid), {"type": "match.found", "match_id": str(match.id)})
        elif kind == "play_ai":
            match = await database_sync_to_async(services.create_bot_match)(self.user)
            await self.send_json({"type": "match_found", "match_id": str(match.id)})
        elif kind == "cancel":
            await database_sync_to_async(services.leave_queue)(self.user)
            await self.send_json({"type": "cancelled"})

    # ---- group event handlers ----
    async def presence_changed(self, event):
        await self.send_presence()

    async def match_found(self, event):
        await self.send_json({"type": "match_found", "match_id": event["match_id"]})

    async def send_presence(self):
        await self.send_json({"type": "presence", "users": await presence.online_users()})


class MatchConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        self.match_id = self.scope["url_route"]["kwargs"]["match_id"]
        self.group = f"match_{self.match_id}"
        if not self.user.is_authenticated or not await self._is_player():
            await self.close(code=4403)
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        payload = await self._snapshot()
        await self.send_json(payload)
        await self.channel_layer.group_send(self.group, {"type": "opponent.status",
                                                         "user_id": self.user.id, "online": True})

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_send(self.group, {"type": "opponent.status",
                                                             "user_id": self.user.id, "online": False})
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        try:
            match, launched = await database_sync_to_async(services.apply_action)(
                self.match_id, self.user, content)
        except services.DraftError as e:
            await self.send_json({"type": "error", "message": str(e)})
            return
        if content.get("type") == "tick" and not launched:
            return  # nothing changed, don't spam the group
        payload = await database_sync_to_async(self._payload)(match)
        # Redis fan-out: both players' sockets get the new state instantly
        await self.channel_layer.group_send(self.group, {"type": "broadcast", "payload": payload})

    # ---- group event handlers ----
    async def broadcast(self, event):
        await self.send_json(event["payload"])

    async def opponent_status(self, event):
        if event["user_id"] != self.user.id:
            await self.send_json({"type": "opponent_status", "online": event["online"]})

    # ---- helpers ----
    @database_sync_to_async
    def _is_player(self):
        try:
            return Match.objects.get(pk=self.match_id).has_player(self.user)
        except (Match.DoesNotExist, ValueError):
            return False

    @database_sync_to_async
    def _snapshot(self):
        return self._payload(Match.objects.select_related("mission").get(pk=self.match_id))

    @staticmethod
    def _payload(match):
        payload = {"type": "state", "state": services.public_state(match)}
        if match.status != Match.DRAFTING:
            payload = {"type": "result", "state": services.public_state(match),
                       "results": match.results,
                       "winner_id": match.winner_id}
        return payload
