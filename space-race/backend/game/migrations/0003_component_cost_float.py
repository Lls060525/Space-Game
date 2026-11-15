from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("game", "0002_roverscore")]

    operations = [
        migrations.AlterField(
            model_name="component", name="cost",
            field=models.FloatField(help_text="$M (flight-unit price; launch vehicles: launch service price)"),
        ),
    ]
