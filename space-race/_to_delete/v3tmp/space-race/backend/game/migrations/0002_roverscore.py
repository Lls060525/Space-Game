import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("game", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="RoverScore",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("planet", models.CharField(db_index=True, max_length=12)),
                ("score", models.IntegerField()),
                ("samples", models.PositiveIntegerField(default=0)),
                ("build", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rover_scores",
                                           to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-score"]},
        ),
    ]
