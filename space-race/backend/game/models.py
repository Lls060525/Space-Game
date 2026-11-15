import uuid

from django.conf import settings
from django.db import models


class Component(models.Model):
    CATEGORY_CHOICES = [
        ("launch", "Launch Vehicle"),
        ("power", "Power"),
        ("battery", "Battery"),
        ("instrument", "Science Instrument"),
        ("storage", "Data Storage"),
        ("comms", "Communications"),
        ("propulsion", "Propulsion"),
        ("thermal", "Thermal Control"),
    ]

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    description = models.TextField(blank=True)
    cost = models.FloatField(help_text="$M (flight-unit price; launch vehicles: launch service price)")
    mass = models.FloatField(help_text="kg")
    power_draw = models.FloatField(default=0, help_text="W while operating")
    reliability = models.FloatField(default=0.98)
    stock = models.PositiveSmallIntegerField(default=1, help_text="copies in the shared draft pool")
    specs = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["category", "cost"]

    def __str__(self):
        return self.name

    def as_sim_dict(self):
        return dict(slug=self.slug, name=self.name, category=self.category, cost=self.cost,
                    mass=self.mass, power_draw=self.power_draw, reliability=self.reliability,
                    specs=self.specs)


class Mission(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    destination = models.CharField(max_length=40)
    objective = models.TextField()
    budget = models.PositiveIntegerField(help_text="$M")
    sun_au = models.FloatField()
    comm_au = models.FloatField()
    insertion_dv = models.FloatField(help_text="m/s")
    lv_factor = models.FloatField(help_text="fraction of LEO payload a rocket can send here")
    eclipse_frac = models.FloatField()
    orbit_hours = models.FloatField()
    days = models.PositiveIntegerField()
    science_target = models.FloatField()
    required_tags = models.JSONField(default=list)
    thermal_req = models.PositiveSmallIntegerField(default=1)

    def __str__(self):
        return self.name

    def as_sim_dict(self):
        fields = ["slug", "name", "destination", "objective", "budget", "sun_au", "comm_au",
                  "insertion_dv", "lv_factor", "eclipse_frac", "orbit_hours", "days",
                  "science_target", "required_tags", "thermal_req"]
        return {f: getattr(self, f) for f in fields}


class QueueEntry(models.Model):
    """Matchmaking queue (persistent, so a server restart doesn't lose it)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["joined_at"]


class Match(models.Model):
    DRAFTING, FINISHED, ABANDONED = "drafting", "finished", "abandoned"
    STATUS_CHOICES = [(DRAFTING, "Drafting"), (FINISHED, "Finished"), (ABANDONED, "Abandoned")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mission = models.ForeignKey(Mission, on_delete=models.PROTECT)
    player1 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    player2 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=DRAFTING)
    # live draft state: {"pool": {component_id: remaining}, "players": {uid: {...}}, "deadline": ts}
    state = models.JSONField(default=dict)
    results = models.JSONField(default=dict, blank=True)
    winner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                               on_delete=models.SET_NULL, related_name="+")
    seed = models.CharField(max_length=36, default=uuid.uuid4)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    def has_player(self, user):
        return user.id in (self.player1_id, self.player2_id)


class PlayerStats(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="stats")
    games = models.PositiveIntegerField(default=0)
    wins = models.PositiveIntegerField(default=0)
    losses = models.PositiveIntegerField(default=0)
    draws = models.PositiveIntegerField(default=0)
    best_score = models.IntegerField(default=0)
    total_score = models.IntegerField(default=0)
    rating = models.IntegerField(default=1000, db_index=True)  # simple Elo

    class Meta:
        ordering = ["-rating"]


class RoverScore(models.Model):
    """Rover Expedition high scores (one row per run)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rover_scores")
    planet = models.CharField(max_length=12, db_index=True)
    score = models.IntegerField()
    samples = models.PositiveIntegerField(default=0)
    build = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-score"]


class ClassChallenge(models.Model):
    """Classroom mode: a teacher shares a code; every student flies the same mission, same NASA snapshot, same dice."""
    code = models.CharField(max_length=8, unique=True)
    title = models.CharField(max_length=80, blank=True)
    mission = models.ForeignKey(Mission, on_delete=models.PROTECT)
    seed = models.CharField(max_length=36, default=uuid.uuid4)
    env = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)


class ClassEntry(models.Model):
    challenge = models.ForeignKey(ClassChallenge, on_delete=models.CASCADE, related_name="entries")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    score = models.IntegerField()
    success = models.BooleanField(default=False)
    science_pct = models.FloatField(default=0)
    cost = models.FloatField(default=0)
    build = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-score"]
