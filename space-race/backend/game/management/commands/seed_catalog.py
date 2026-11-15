from django.core.management.base import BaseCommand

from game.catalog import COMPONENTS, MISSIONS
from game.models import Component, Mission


class Command(BaseCommand):
    help = "Load / update the component catalog and missions from game/catalog.py"

    def handle(self, *args, **opts):
        for c in COMPONENTS:
            Component.objects.update_or_create(slug=c["slug"], defaults={k: v for k, v in c.items() if k != "slug"})
        stale = Component.objects.exclude(slug__in=[c["slug"] for c in COMPONENTS])
        if stale.exists():
            self.stdout.write(f"Removing retired parts: {', '.join(stale.values_list('slug', flat=True))}")
            stale.delete()
        for m in MISSIONS:
            Mission.objects.update_or_create(slug=m["slug"], defaults={k: v for k, v in m.items() if k != "slug"})
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(COMPONENTS)} components, {len(MISSIONS)} missions."))
