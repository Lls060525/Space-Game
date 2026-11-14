"""
Statistical mission simulator.

No physics engine: we compute the engineering ratios a real mission team
would check (thrust-to-weight, launch margin, delta-v, power balance,
battery depth of discharge, data volume vs storage vs downlink, thermal)
and turn each margin into a success probability. A seeded RNG makes the
result reproducible, and both players in a match share the same seed, so
"luck" is identical: only the engineering decides the winner.

Pure Python: a part is a dict with keys
    slug, name, category, cost, mass, power_draw, reliability, specs
and a mission is a dict as in catalog.MISSIONS.
"""
from __future__ import annotations

import math
import random
from typing import Any

G0 = 9.81
BUS_MASS_KG = 120          # structure, avionics, wiring, attitude control
BUS_POWER_W = 40           # flight computer + heaters baseline
BUS_STORAGE_GB = 2         # flight computer memory
CONTACT_HOURS_PER_DAY = 8  # Deep Space Network time you get each day
MIN_TWR = 1.2              # rockets need TWR comfortably > 1 to climb
BATTERY_DOD = 0.8          # only discharge batteries to 80%
SECONDARY_SCIENCE = 0.3    # data from instruments not matching the objective is worth less

Part = dict[str, Any]
Mission = dict[str, Any]


def _spec(p: Part, key: str, default: float = 0.0):
    return (p.get("specs") or {}).get(key, default)


def margin_to_prob(margin: float, steepness: float = 10.0) -> float:
    """0 margin -> 50%, +20% margin -> ~88%, -20% -> ~12%."""
    return 1.0 / (1.0 + math.exp(-steepness * margin))


# --------------------------------------------------------------------------
# Static analysis: what the drafting board shows live
# --------------------------------------------------------------------------
def analyze(parts: list[Part], mission: Mission) -> dict[str, Any]:
    by_cat: dict[str, list[Part]] = {}
    for p in parts:
        by_cat.setdefault(p["category"], []).append(p)

    cost = sum(p["cost"] for p in parts)
    spacecraft_parts = [p for p in parts if p["category"] != "launch"]

    # ---- mass ----
    dry_mass = BUS_MASS_KG + sum(p["mass"] for p in spacecraft_parts)
    propellant = sum(_spec(p, "propellant_kg") for p in by_cat.get("propulsion", []))
    wet_mass = dry_mass + propellant

    # ---- launch ----
    lvs = by_cat.get("launch", [])
    lv = lvs[0] if lvs else None
    if lv:
        thrust_n = _spec(lv, "thrust_kn") * 1000
        liftoff_mass = _spec(lv, "rocket_mass_t") * 1000 + wet_mass
        twr = thrust_n / (liftoff_mass * G0)
        capacity = _spec(lv, "payload_leo_kg") * mission["lv_factor"]
    else:
        twr, capacity = 0.0, 0.0
    twr_margin = twr / MIN_TWR - 1 if lv else -1.0
    capacity_margin = capacity / wet_mass - 1 if lv else -1.0

    # ---- delta-v (Tsiolkovsky) ----
    if propellant > 0:
        isp = sum(_spec(p, "isp_s") * _spec(p, "propellant_kg") for p in by_cat["propulsion"]) / propellant
        delta_v = isp * G0 * math.log(wet_mass / dry_mass)
    else:
        isp, delta_v = 0.0, 0.0
    dv_margin = delta_v / mission["insertion_dv"] - 1

    # ---- power ----
    sun_factor = 1.0 / mission["sun_au"] ** 2
    solar_w = sum(_spec(p, "gen_w") for p in by_cat.get("power", []) if _spec(p, "solar", False)) * sun_factor
    rtg_w = sum(_spec(p, "gen_w") for p in by_cat.get("power", []) if not _spec(p, "solar", False))
    ecl = mission["eclipse_frac"]
    avg_gen_w = solar_w * (1 - ecl) + rtg_w

    ops_draw_w = BUS_POWER_W + sum(p["power_draw"] for p in spacecraft_parts)
    cruise_draw_w = (BUS_POWER_W
                     + sum(p["power_draw"] for p in by_cat.get("comms", []))
                     + sum(p["power_draw"] for p in by_cat.get("thermal", []))
                     + sum(_spec(p, "cruise_power_w") for p in by_cat.get("propulsion", [])))
    power_margin = avg_gen_w / ops_draw_w - 1
    cruise_power_margin = (solar_w + rtg_w) / cruise_draw_w - 1  # no eclipses in cruise

    battery_wh = sum(_spec(p, "battery_wh") for p in by_cat.get("battery", []))
    eclipse_hours = mission["orbit_hours"] * ecl
    eclipse_need_wh = max(0.0, ops_draw_w - rtg_w) * eclipse_hours
    battery_margin = (battery_wh * BATTERY_DOD / eclipse_need_wh - 1) if eclipse_need_wh > 0 else 1.0

    # ---- data ----
    req = set(mission["required_tags"])
    instruments = by_cat.get("instrument", [])
    data_gb_day = sum(_spec(p, "data_gb_day") for p in instruments)
    science_per_day = 0.0
    for p in instruments:
        match = bool(req & set(_spec(p, "tags", [])))
        science_per_day += _spec(p, "data_gb_day") * _spec(p, "quality", 1.0) * (1 if match else SECONDARY_SCIENCE)
    value_per_gb = science_per_day / data_gb_day if data_gb_day else 0.0
    objective_covered = any(req & set(_spec(p, "tags", [])) for p in instruments)

    storage_gb = BUS_STORAGE_GB + sum(_spec(p, "storage_gb") for p in by_cat.get("storage", []))
    link_factor = min(1.0 / max(mission["comm_au"], 0.01) ** 2, 25.0)  # capped for the Moon
    downlink_mbps = sum(_spec(p, "downlink_mbps") for p in by_cat.get("comms", [])) * link_factor
    downlink_gb_day = downlink_mbps * CONTACT_HOURS_PER_DAY * 3600 / 8000
    max_return = min(data_gb_day, downlink_gb_day) * mission["days"] * value_per_gb
    data_margin = (downlink_gb_day / data_gb_day - 1) if data_gb_day else 0.0

    # ---- thermal ----
    thermal = sum(_spec(p, "thermal_rating") for p in by_cat.get("thermal", []))
    thermal_margin = thermal - mission["thermal_req"]

    stats = dict(
        cost=cost, budget=mission["budget"], budget_left=mission["budget"] - cost,
        dry_mass_kg=round(dry_mass, 1), propellant_kg=round(propellant, 1), wet_mass_kg=round(wet_mass, 1),
        twr=round(twr, 3), twr_margin=round(twr_margin, 3),
        lv_capacity_kg=round(capacity, 1), capacity_margin=round(capacity_margin, 3),
        isp_s=round(isp, 1), delta_v=round(delta_v, 1), dv_required=mission["insertion_dv"],
        dv_margin=round(dv_margin, 3),
        solar_w=round(solar_w, 1), rtg_w=round(rtg_w, 1), avg_gen_w=round(avg_gen_w, 1),
        ops_draw_w=round(ops_draw_w, 1), cruise_draw_w=round(cruise_draw_w, 1),
        power_margin=round(power_margin, 3), cruise_power_margin=round(cruise_power_margin, 3),
        battery_wh=battery_wh, eclipse_need_wh=round(eclipse_need_wh, 1), battery_margin=round(battery_margin, 3),
        data_gb_day=round(data_gb_day, 2), storage_gb=storage_gb,
        downlink_mbps=round(downlink_mbps, 3), downlink_gb_day=round(downlink_gb_day, 2),
        data_margin=round(data_margin, 3),
        science_per_day=round(science_per_day, 2), max_science=round(max_return, 1),
        science_target=mission["science_target"], objective_covered=objective_covered,
        thermal_rating=thermal, thermal_req=mission["thermal_req"], thermal_margin=thermal_margin,
    )
    stats["warnings"] = _warnings(stats, by_cat, mission)
    return stats


def _warnings(s: dict, by_cat: dict, mission: Mission) -> list[dict[str, str]]:
    """Plain-language cascading consequences. level: 'fail' | 'warn' | 'info'."""
    w: list[dict[str, str]] = []

    def add(level, code, msg):
        w.append(dict(level=level, code=code, message=msg))

    if s["budget_left"] < 0:
        add("fail", "budget", f"Over budget by ${-s['budget_left']}M.")
    if not by_cat.get("launch"):
        add("fail", "launch", "No launch vehicle selected.")
    else:
        if s["twr"] < 1.0:
            add("fail", "twr", f"Thrust-to-weight {s['twr']:.2f} < 1.0: the rocket cannot leave the pad.")
        elif s["twr_margin"] < 0:
            add("warn", "twr", f"Thrust-to-weight {s['twr']:.2f} is below the safe {MIN_TWR}. Sluggish, risky ascent.")
        if s["capacity_margin"] < 0:
            add("fail" if s["capacity_margin"] < -0.25 else "warn", "capacity",
                f"Spacecraft is {s['wet_mass_kg']:.0f} kg but the rocket can only send "
                f"{s['lv_capacity_kg']:.0f} kg to {mission['destination']}.")
    if not by_cat.get("power"):
        add("fail", "power", "No power source: the probe is dead on arrival.")
    elif s["power_margin"] < 0:
        add("fail" if s["power_margin"] < -0.3 else "warn", "power",
            f"Operating draw {s['ops_draw_w']:.0f} W exceeds average generation {s['avg_gen_w']:.0f} W "
            f"(solar output at {mission['destination']} is {1 / mission['sun_au'] ** 2:.0%} of Earth's).")
    if s["cruise_power_margin"] < 0 and by_cat.get("power"):
        add("warn", "cruise_power",
            f"Cruise needs {s['cruise_draw_w']:.0f} W but arrays give {s['solar_w'] + s['rtg_w']:.0f} W.")
    if s["eclipse_need_wh"] > 0 and s["battery_margin"] < 0:
        add("fail" if s["battery_wh"] == 0 else "warn", "battery",
            f"Eclipses need {s['eclipse_need_wh']:.0f} Wh but batteries supply "
            f"{s['battery_wh'] * BATTERY_DOD:.0f} Wh usable.")
    if not by_cat.get("comms"):
        add("fail", "comms", "No antenna: you will never hear from your probe.")
    if not by_cat.get("instrument"):
        add("fail", "instrument", "No science instruments.")
    elif not s["objective_covered"]:
        add("fail", "objective",
            f"No instrument can do the objective (needs: {', '.join(mission['required_tags'])}).")
    if by_cat.get("instrument") and s["data_margin"] < 0:
        add("warn", "downlink",
            f"Instruments make {s['data_gb_day']:.1f} GB/day but you can only downlink "
            f"{s['downlink_gb_day']:.2f} GB/day.")
    if by_cat.get("instrument") and s["storage_gb"] < s["data_gb_day"] * 2:
        add("warn", "storage", f"Only {s['storage_gb']} GB storage: less than 2 days of data. Overflow is lost.")
    if s["dv_margin"] < 0:
        add("fail" if s["delta_v"] == 0 else "warn", "delta_v",
            f"Delta-v {s['delta_v']:.0f} m/s < {s['dv_required']} m/s needed for orbit insertion.")
    if s["thermal_margin"] < 0:
        add("warn", "thermal", f"Thermal rating {s['thermal_rating']} < {s['thermal_req']} required.")
    if by_cat.get("instrument") and s["objective_covered"] and s["max_science"] < s["science_target"]:
        add("warn", "science",
            f"Best case science return {s['max_science']:.0f} < target {s['science_target']}.")
    return w


# --------------------------------------------------------------------------
# Simulation
# --------------------------------------------------------------------------
def simulate(parts: list[Part], mission: Mission, seed: str | int) -> dict[str, Any]:
    s = analyze(parts, mission)
    rng = random.Random(seed)
    by_cat: dict[str, list[Part]] = {}
    for p in parts:
        by_cat.setdefault(p["category"], []).append(p)

    timeline: list[dict[str, Any]] = []
    probabilities: dict[str, float] = {}

    def ev(t, phase, status, msg):
        timeline.append(dict(t=round(t, 3), phase=phase, status=status, message=msg))

    def rel(cat):
        r = 1.0
        for p in by_cat.get(cat, []):
            r *= p["reliability"]
        return r

    def finish(outcome, failed_phase=None, science=0.0, survived_days=0):
        pct = science / mission["science_target"] if mission["science_target"] else 0
        complete = failed_phase is None
        score = round(min(pct, 1.5) * 1000)
        if score > 0:  # efficiency bonus only if you actually did science
            score += max(0, s["budget_left"]) * 2
        if complete and pct >= 1:
            score += 250
        return dict(outcome=outcome, success=complete and pct >= 1, failed_phase=failed_phase,
                    science=round(science, 1), science_pct=round(pct, 3),
                    survived_days=survived_days, days=mission["days"],
                    score=score, timeline=timeline, probabilities=probabilities, stats=s)

    # ---------- Phase 0: pre-flight review ----------
    ev(0.0, "review", "info", "Flight readiness review")
    if s["budget_left"] < 0:
        ev(0.02, "review", "fail", "Mission cancelled: over budget.")
        return finish("Cancelled - over budget", "review")
    if not by_cat.get("launch"):
        ev(0.02, "review", "fail", "Scrubbed: no launch vehicle.")
        return finish("Scrubbed - no rocket", "review")

    # ---------- Phase 1: launch & ascent ----------
    ev(0.05, "launch", "info", f"Liftoff on {by_cat['launch'][0]['name']}! TWR {s['twr']:.2f}")
    if s["twr"] < 1.0:
        ev(0.08, "launch", "fail", "Engines at full thrust... the rocket never leaves the pad.")
        return finish("Too heavy to lift off", "launch")
    p_launch = rel("launch") * margin_to_prob(s["twr_margin"] + 0.25) * margin_to_prob(s["capacity_margin"] + 0.1, 8)
    probabilities["launch"] = round(p_launch, 3)
    if rng.random() > p_launch:
        msg = ("Upper stage ran dry before reaching escape velocity." if s["capacity_margin"] < 0.1
               else "Ascent anomaly - vehicle lost.")
        ev(0.12, "launch", "fail", msg)
        return finish("Launch failure", "launch")
    ev(0.15, "launch", "ok", f"Payload separation. {s['wet_mass_kg']:.0f} kg on its way to {mission['destination']}.")

    # ---------- Phase 2: cruise ----------
    if not by_cat.get("power"):
        ev(0.2, "cruise", "fail", "No power source. Batteries drained within hours.")
        return finish("Dead on arrival - no power", "cruise")
    if not by_cat.get("comms"):
        ev(0.2, "cruise", "fail", "No antenna. Mission control never acquires the signal.")
        return finish("Lost - no communications", "cruise")
    p_cruise = (rel("power") * rel("comms") * rel("propulsion") * rel("thermal")
                * margin_to_prob(s["cruise_power_margin"] + 0.3, 8)
                * margin_to_prob(s["thermal_margin"] * 0.25 + 0.5, 8))
    probabilities["cruise"] = round(p_cruise, 3)
    ev(0.25, "cruise", "info", f"Signal acquired at {s['downlink_mbps']:.2f} Mbps. Cruise to {mission['destination']}.")
    if rng.random() > p_cruise:
        if s["thermal_margin"] < 0:
            msg = "Electronics overheated during cruise."
        elif s["cruise_power_margin"] < 0:
            msg = "Power brownout during cruise - safe mode loop, contact lost."
        else:
            msg = "Component failure during cruise - contact lost."
        ev(0.42, "cruise", "fail", msg)
        return finish("Lost in cruise", "cruise")
    ev(0.5, "cruise", "ok", "Approaching target.")

    # ---------- Phase 3: orbit insertion ----------
    if s["delta_v"] <= 0:
        ev(0.58, "insertion", "fail", f"No engine to brake: the probe flies past {mission['destination']}.")
        return finish("Missed orbit - flyby", "insertion")
    p_ins = rel("propulsion") * margin_to_prob(s["dv_margin"] + 0.05, 12)
    probabilities["insertion"] = round(p_ins, 3)
    ev(0.55, "insertion", "info", f"Orbit insertion burn: {s['delta_v']:.0f} / {s['dv_required']} m/s")
    if rng.random() > p_ins:
        ev(0.6, "insertion", "fail",
           "Ran out of propellant mid-burn. Escaping into solar orbit." if s["dv_margin"] < 0
           else "Engine anomaly during the burn.")
        return finish("Orbit insertion failed", "insertion")
    ev(0.62, "insertion", "ok", f"In orbit around {mission['destination']}!")

    # ---------- Phase 4: science operations (day by day) ----------
    days = mission["days"]
    death_day = days + 1
    death_msg = ""
    if s["power_margin"] < 0:
        d = max(1, int(days * max(0.05, 1 + s["power_margin"] * 2)))
        if d < death_day:
            death_day, death_msg = d, "Power deficit drained the batteries. Probe froze."
    if s["eclipse_need_wh"] > 0 and s["battery_margin"] < 0:
        d = max(1, int(days * max(0.03, 1 + s["battery_margin"])))
        if d < death_day:
            death_day, death_msg = d, "Batteries could not survive the eclipse - brownout."
    if s["thermal_margin"] < 0:
        d = int(days * rng.uniform(0.2, 0.9))
        if d < death_day:
            death_day, death_msg = d, "Thermal runaway: instruments cooked."
    # random part failure across mission lifetime (shared seed keeps it fair)
    p_ops = rel("instrument") * rel("storage") * rel("battery")
    probabilities["operations"] = round(p_ops, 3)
    if rng.random() > p_ops:
        d = int(days * rng.uniform(0.3, 1.0))
        if d < death_day:
            death_day, death_msg = d, "Critical component failure."

    if not s["objective_covered"]:
        ev(0.66, "science", "warn", "No instrument can address the mission objective!")

    stored = 0.0
    returned_gb = 0.0
    lost_gb = 0.0
    storage_warned = False
    gen = s["data_gb_day"]
    down = s["downlink_gb_day"]
    cap = s["storage_gb"]
    last_day = 0
    for day in range(1, days + 1):
        if day >= death_day:
            break
        last_day = day
        stored += gen
        if stored > cap:
            lost_gb += stored - cap
            stored = cap
            if not storage_warned:
                storage_warned = True
                ev(0.62 + 0.36 * day / days, "science", "warn",
                   f"Day {day}: storage full - new data is being overwritten.")
        sent = min(stored, down)
        stored -= sent
        returned_gb += sent

    science = returned_gb * (s["science_per_day"] / gen if gen else 0)
    if death_day <= days:
        ev(0.62 + 0.36 * death_day / days, "science", "fail", f"Day {death_day}: {death_msg}")
        ev(1.0, "end", "fail",
           f"Returned {returned_gb:.1f} GB ({science:.0f}/{mission['science_target']} science) before loss.")
        return finish("Lost during operations", "operations", science, last_day)

    status = "ok" if science >= mission["science_target"] else "warn"
    if lost_gb > 0:
        ev(0.97, "science", "warn", f"{lost_gb:.0f} GB of data never made it home (downlink/storage bottleneck).")
    ev(1.0, "end", status,
       f"Mission complete! Returned {returned_gb:.1f} GB = {science:.0f}/{mission['science_target']} science.")
    return finish("Mission success" if status == "ok" else "Partial success", None, science, days)
