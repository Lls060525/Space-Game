import json

from django.core.management.base import BaseCommand

from game import nasa


class Command(BaseCommand):
    help = "Fetch live NASA data now, print what worked, and save a backup snapshot for offline demos."

    def handle(self, *args, **opts):
        self.stdout.write("Contacting JPL Horizons and NASA DONKI ...")
        cond = nasa.refresh()
        eph, wx = cond["ephemeris"], cond["space_weather"]
        ok_e, ok_w = not eph.get("error") and "live" in eph["source"], not wx.get("error") and "live" in wx["source"]
        self.stdout.write((self.style.SUCCESS if ok_e else self.style.ERROR)(
            f"  Ephemeris:     {eph['source']}" + (f"  ({eph['error']})" if eph.get("error") else "")))
        self.stdout.write((self.style.SUCCESS if ok_w else self.style.ERROR)(
            f"  Space weather: {wx['source']}" + (f"  ({wx['error']})" if wx.get("error") else "")))
        for name, p in nasa.planet_snapshot(cond).items():
            extra = f", {p['earth_au']} AU from Earth, light time {p['light_time_min']} min" if "earth_au" in p else ""
            self.stdout.write(f"  {name:6s} {p['sun_au']} AU from the Sun{extra}")
        self.stdout.write(f"  Space weather: {wx['level']} (index {wx['activity_index']}), flares {wx['flares']}, "
                          f"SEP {wx['sep_events']}, Kp max {wx['kp_max']}")
        sites = nasa.surface_sites(cond)
        m = sites["Mars"]
        self.stdout.write(f"  Jezero now: local solar time {m['ltst_h']:.2f} h, Sun {m['sun_el_deg']}°, {m['season']}")
        if ok_e:
            nasa.BACKUP_FILE.write_text(json.dumps(cond))
            self.stdout.write(self.style.SUCCESS(f"Saved live backup snapshot -> {nasa.BACKUP_FILE}"))
        else:
            self.stdout.write(self.style.WARNING(
                "Live ephemeris failed: check internet / firewall / proxy for ssd.jpl.nasa.gov. No backup saved."))
            if not ok_w:
                self.stdout.write(self.style.WARNING("For DONKI set NASA_API_KEY (free at https://api.nasa.gov)."))
