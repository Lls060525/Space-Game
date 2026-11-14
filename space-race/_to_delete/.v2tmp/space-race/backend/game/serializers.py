from rest_framework import serializers

from .models import Component, Match, Mission, PlayerStats


class ComponentSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = Component
        fields = ["id", "slug", "name", "category", "category_label", "description", "cost", "mass",
                  "power_draw", "reliability", "stock", "specs"]


class MissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mission
        fields = "__all__"


class LeaderboardSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username")

    class Meta:
        model = PlayerStats
        fields = ["username", "rating", "games", "wins", "losses", "draws", "best_score"]


class MatchHistorySerializer(serializers.ModelSerializer):
    mission = serializers.CharField(source="mission.name")
    player1 = serializers.CharField(source="player1.username")
    player2 = serializers.CharField(source="player2.username")
    winner = serializers.CharField(source="winner.username", default=None)

    class Meta:
        model = Match
        fields = ["id", "mission", "player1", "player2", "winner", "status", "created_at"]
