from django.contrib import admin

from .models import Component, Match, Mission, PlayerStats, QueueEntry, RoverScore


@admin.register(Component)
class ComponentAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "cost", "mass", "power_draw", "reliability", "stock"]
    list_filter = ["category"]
    list_editable = ["cost", "mass", "power_draw", "reliability", "stock"]


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ["name", "destination", "budget", "days", "science_target"]


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ["id", "mission", "player1", "player2", "status", "winner", "created_at"]
    list_filter = ["status"]


admin.site.register(PlayerStats)
admin.site.register(QueueEntry)
admin.site.register(RoverScore)
