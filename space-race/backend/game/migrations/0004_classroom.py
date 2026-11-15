import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0003_component_cost_float"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ClassChallenge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=8, unique=True)),
                ("title", models.CharField(blank=True, max_length=80)),
                ("seed", models.CharField(default=uuid.uuid4, max_length=36)),
                ("env", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                                 related_name="+", to=settings.AUTH_USER_MODEL)),
                ("mission", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="game.mission")),
            ],
        ),
        migrations.CreateModel(
            name="ClassEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("score", models.IntegerField()),
                ("success", models.BooleanField(default=False)),
                ("science_pct", models.FloatField(default=0)),
                ("cost", models.FloatField(default=0)),
                ("build", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("challenge", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="entries",
                                                to="game.classchallenge")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="+",
                                           to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-score"]},
        ),
    ]
