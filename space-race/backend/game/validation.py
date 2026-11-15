"""
Model validation: run the simulator's own equations against numbers NASA, JPL and launch
providers have published, and report the error. Shown in the app ("Science & data") and
asserted in tests.py, so if someone breaks the physics, the tests catch it.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .catalog import COMPONENTS
from .sim import DEST, G0, LIGHT_S_PER_AU, SOLAR_CONSTANT, hohmann, payload_to_c3

C = {c["slug"]: c for c in COMPONENTS}
GTO_DV = 2450      # m/s from a 200 km LEO to geostationary transfer orbit


def _payload_dv(lv, dv):
    s = lv["specs"]
    return max(0.0, (s["payload_leo_kg"] + s["upper_dry_kg"]) * math.exp(-dv / (s["upper_isp_s"] * G0)) - s["upper_dry_kg"])


def checks() -> list[dict]:
    from . import nasa
    out = []

    def add(group, name, model, published, unit, tol, source, note="", kind="independent"):
        """kind: independent = a genuine prediction; calibration = we tuned a parameter to it; input = data we use."""
        err = (model - published) / published if published else 0.0
        out.append(dict(group=group, name=name, kind=kind, model=round(model, 2), published=published, unit=unit,
                        error_pct=round(100 * err, 1), tolerance_pct=round(100 * tol), passed=abs(err) <= tol,
                        source=source, note=note))

    # ---- launch vehicles (upper-stage rocket equation) ----
    add("Launch", "Falcon 9 expendable → Mars", payload_to_c3(C["f9-expendable"], 8.7), 4020, "kg", 0.10,
        "SpaceX published capability", "Upper stage calibrated at C3 = 10 km²/s²", "calibration")
    add("Launch", "Falcon Heavy expendable → Mars", payload_to_c3(C["falcon-heavy"], 8.7), 16800, "kg", 0.10,
        "SpaceX published capability", "Upper stage calibrated at C3 = 10 km²/s²", "calibration")
    add("Launch", "Falcon 9 (reusable) → GTO", _payload_dv(C["f9-reusable"], GTO_DV), 5500, "kg", 0.10,
        "SpaceX Capabilities & Services 2026 ($74M up to 5.5 t GTO)")
    add("Launch", "Falcon Heavy expendable → GTO", _payload_dv(C["falcon-heavy"], GTO_DV), 26700, "kg", 0.10,
        "SpaceX published capability")
    add("Launch", "Vulcan VC6 → GTO", _payload_dv(C["vulcan-vc6"], GTO_DV), 14400, "kg", 0.10, "ULA published capability", "Upper stage calibrated to this", "calibration")
    add("Launch", "New Glenn → GTO", _payload_dv(C["new-glenn"], GTO_DV), 13000, "kg", 0.10, "Blue Origin published capability", "Upper stage calibrated to this", "calibration")
    lv = C["f9-expendable"]["specs"]
    add("Launch", "Falcon 9 lift-off TWR (no payload)", lv["thrust_kn"] * 1000 / (lv["rocket_mass_t"] * 1000 * G0),
        1.41, "", 0.05, "7,607 kN thrust / 549 t (SpaceX)")

    # ---- orbital mechanics ----
    c3, t = hohmann(1.0, DEST["Mars"]["a_au"])
    add("Orbits", "Earth→Mars Hohmann transfer time", t, 259, "days", 0.03, "Textbook (Curtis, Orbital Mechanics)")
    _, tv = hohmann(1.0, DEST["Venus"]["a_au"])
    add("Orbits", "Earth→Venus Hohmann transfer time", tv, 146, "days", 0.03, "Textbook (Curtis, Orbital Mechanics)")
    add("Orbits", "Escape Δv from 200 km LEO", (math.sqrt(2 * 398600.4418 / 6578.137) - math.sqrt(398600.4418 / 6578.137)) * 1000,
        3226, "m/s", 0.02, "Vis-viva equation")
    a, e = 1.52368, 0.0934
    add("Orbits", "Max Earth-Mars light time", (a * (1 + e) + 1.0167) * LIGHT_S_PER_AU / 60, 22.3, "min", 0.05,
        "NASA: 3 to 22 minutes")
    add("Orbits", "Min Earth-Mars light time", (a * (1 - e) - 0.9833) * LIGHT_S_PER_AU / 60, 3.0, "min", 0.15,
        "NASA: 3 to 22 minutes")

    # ---- power ----
    add("Power", "Solar irradiance at Mars", SOLAR_CONSTANT / 1.52366 ** 2, 586.2, "W/m²", 0.02, "NASA Mars Fact Sheet")
    add("Power", "Solar irradiance at Venus", SOLAR_CONSTANT / 0.72333 ** 2, 2601.3, "W/m²", 0.02, "NASA Venus Fact Sheet")
    mm = C["mmrtg"]["specs"]
    add("Power", "Curiosity MMRTG after ~12.3 years", mm["gen_w"] * (1 - mm["decay_per_yr"]) ** 12.3, 77.2, "W", 0.05,
        "NASA RPS Program update 2024 (F1 on Curiosity: 77.2 We)",
        "This check caught a bug: our first decay rate (4.8%/yr) predicted 59 W. Now 2.8%/yr.", "calibration")
    add("Power", "MMRTG specific power", mm["gen_w"] / C["mmrtg"]["mass"], 2.8, "W/kg", 0.15, "NASA MMRTG fact sheet", kind="input")

    # ---- Mars local time (Mars24) ----
    t0 = datetime(2021, 2, 18, 20, 55, tzinfo=timezone.utc).timestamp()
    m24 = nasa.mars_solar_time(18.4447, 77.4508, t0)
    add("Mars time", "Mars season at Perseverance landing (Ls)", m24["ls_deg"], 5.2, "°", 0.25,
        "NASA/JPL: landed in northern spring, Ls ≈ 5°")

    # ---- spacecraft references ----
    add("Mass", "HiRISE-class camera mass", C["hires-camera"]["mass"], 65, "kg", 0.02, "HiRISE on MRO (Ball Aerospace)", kind="input")
    add("Cost", "HiRISE-class camera cost", C["hires-camera"]["cost"], 40, "$M", 0.05, "HiRISE on MRO", kind="input")
    add("Cost", "MMRTG cost", C["mmrtg"]["cost"], 75, "$M", 0.05, "U.S. DOE (Perseverance's MMRTG)", kind="input")
    add("Cost", "Falcon 9 list price", C["f9-reusable"]["cost"], 74, "$M", 0.01, "SpaceX 2026 list price", kind="input")
    return out


SOURCES = [
    dict(name="JPL Horizons API", url="https://ssd.jpl.nasa.gov/horizons/",
         use="Live positions of Earth, Mars, Venus, Moon: launch windows, C3, Sun & Earth distance, conjunctions"),
    dict(name="NASA DONKI (Space Weather Database)", url="https://api.nasa.gov/",
         use="Solar flares, CMEs, SEP events, geomagnetic storms: cruise radiation risk"),
    dict(name="Mars24 algorithm (NASA GISS, Allison & McEwen 2000)", url="https://www.giss.nasa.gov/tools/mars24/",
         use="Mars local true solar time, season (Ls), Sun elevation at Jezero"),
    dict(name="JPL Keplerian Elements for Approximate Positions", url="https://ssd.jpl.nasa.gov/planets/approx_pos.html",
         use="Offline fallback ephemeris"),
    dict(name="NASA Planetary Fact Sheets", url="https://nssdc.gsfc.nasa.gov/planetary/factsheet/",
         use="Gravity, solar irradiance, atmosphere density, temperatures"),
    dict(name="NASA MMRTG fact sheet & RPS Program", url="https://science.nasa.gov/planetary-science/programs/radioisotope-power-systems/",
         use="RTG power, mass, decay, heat"),
    dict(name="SpaceX Capabilities & Services", url="https://www.spacex.com/media/Capabilities&Services.pdf",
         use="Falcon 9 / Heavy price and performance"),
    dict(name="NASA launch service contract awards", url="https://www.nasa.gov/news/",
         use="Falcon Heavy prices paid for Psyche, Europa Clipper, Dragonfly"),
    dict(name="Mission references (MRO, MAVEN, LRO, HiRISE)", url="https://science.nasa.gov/mission/mars-reconnaissance-orbiter/",
         use="Masses, propellant fractions, costs, instrument data"),
    dict(name="AIAA S-120 mass growth allowance / SMAD", url="https://arc.aiaa.org/",
         use="Mass growth allowances, structure & harness fractions"),
]
