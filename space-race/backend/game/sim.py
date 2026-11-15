"""
Mission simulator: engineering physics + Monte Carlo.

What is modelled (and roughly how NASA mission design teams do it):

MASS (every kg counts)
  * Current Best Estimate (CBE) of every part, plus fixed bus avionics and ADCS.
  * Primary structure and harness are not free: they scale with what they carry
    (22 % and 6 % of dry mass, typical of planetary spacecraft, SMAD tables).
  * Mass Growth Allowance (MGA) per part, by heritage (AIAA S-120): flight-proven
    parts ~5-10 %, new technology 20-30 %. Predicted mass = CBE + MGA.
  * In the simulation the as-built spacecraft "grows" by a random fraction of its
    MGA (shared dice for both players). If it no longer fits the rocket, the ground
    team off-loads propellant; if that is not enough, the launch is scrubbed.

LAUNCH
  * Lift-off thrust-to-weight  TWR = F / ((m_rocket + m_payload) * g0).
  * Payload to the departure energy C3 from the rocket equation of the upper stage:
        m_pl = (m_LEO + m_stage) * exp(-dv / (Isp * g0)) - m_stage
    with dv = sqrt(C3 + 2 mu / r_LEO) - sqrt(mu / r_LEO). C3 comes from the REAL
    planetary geometry today (JPL Horizons), so launch windows matter.

ARRIVAL
  * Tsiolkovsky with propellant residuals; finite-burn gravity loss for chemical
    engines, spiral penalty for low-thrust ion capture; nav and Isp dispersions.

POWER / THERMAL / DATA / RADIATION
  * Solar output follows 1/r^2 on every day of operations (real ephemeris), with
    cell degradation and hot-cell losses near the Sun; RTGs decay (Pu-238 + couples).
  * Batteries: eclipse depth of discharge, Li-ion cycle life, capacity fade.
  * Power-negative spacecraft shed instrument load instead of dying outright.
  * Downlink: best working antenna x 1/d^2 per day, solar-conjunction blackouts.
  * Cruise radiation risk from NASA DONKI flare / CME / SEP activity.
  * Redundancy: parallel antennas / power sources only fail if all of them fail.

A seeded RNG (one stream per phase) makes every run reproducible, and both
players share the seed and the NASA snapshot, so only engineering decides.

Pure Python: a part is a dict with keys
    slug, name, category, cost, mass, power_draw, reliability, specs
and a mission is a dict as in catalog.MISSIONS.
"""
from __future__ import annotations

import math
import random
from typing import Any

# ---------------- physical constants ----------------
G0 = 9.80665                 # m/s^2 standard gravity
MU_EARTH = 398600.4418       # km^3/s^2
R_LEO = 6378.137 + 200       # km, 200 km parking orbit
V_EARTH = 29.7847            # km/s, Earth's mean orbital speed
LIGHT_S_PER_AU = 499.004784
SOLAR_CONSTANT = 1361        # W/m^2 at 1 AU (for display)

# Destination constants (Hohmann defaults, used when no live NASA snapshot is supplied)
# planet_flux: reflected sunlight + thermal IR from the planet hitting a low orbiter (W/m^2, orbit average)
# ops_per_day: mission operations + Deep Space Network cost ($M/day; Discovery missions ~$7-15M/yr)
DEST = {
    "Mars": dict(a_au=1.5237, period_d=686.98, c3_min=8.7, cruise_d=259, tcm_dv=40, gravity=3.721,
                 planet_flux=120, ops_per_day=0.035),
    "Venus": dict(a_au=0.7233, period_d=224.70, c3_min=6.3, cruise_d=146, tcm_dv=40, gravity=8.87,
                  planet_flux=1150, ops_per_day=0.035),
    "Moon": dict(a_au=1.0, period_d=None, c3_min=-2.0, cruise_d=4.5, tcm_dv=25, gravity=1.625,
                 planet_flux=600, ops_per_day=0.025),
}

# ---------------- spacecraft bus ----------------
AVIONICS_KG = 25             # command & data handling, flight computer
ADCS_KG = 30                 # reaction wheels, star trackers, sun sensors
STRUCTURE_FRAC = 0.22        # primary + secondary structure, of dry mass
HARNESS_FRAC = 0.06          # cabling, of dry mass
ADAPTER_KG = 60              # payload attach fitting + separation system (rides on the rocket)
MGA_DEFAULT = dict(power=0.10, battery=0.08, instrument=0.15, storage=0.05, comms=0.10,
                   propulsion=0.10, thermal=0.10)
MGA_BUS = 0.05               # avionics / ADCS (heritage)
MGA_STRUCT = 0.15            # structure + harness are estimated, not weighed
REQUIRED_SYSTEM_MARGIN = 0.15  # NASA projects hold ~15 % launch margin at PDR on top of MGA

BUS_POWER_W = 40             # flight computer + heaters baseline
BUS_STORAGE_GB = 2
CONTACT_HOURS_PER_DAY = 8    # Deep Space Network time per day
MIN_TWR = 1.2
BATTERY_DOD = 0.8            # max allowed depth of discharge
PROP_RESIDUAL = 0.03         # trapped / unusable propellant
FINITE_BURN_LOSS = 0.03      # gravity loss of a ~30-min chemical capture burn
LOW_THRUST_FACTOR = 1.35     # ion engines spiral in: more dv than an impulsive burn
SOLAR_DEGRADE_PER_YR = 0.02  # GaAs / Si cell darkening
RAD_K = 0.006                # cruise electronics risk per (activity index * 180 days)
SECONDARY_SCIENCE = 0.3

# ---------------- thermal (lumped heat balance) ----------------
ABSORPTIVITY = 0.3           # bare spacecraft surface (white paint / OSR mix)
BODY_EMIT_W_M2 = 200         # what bare surface radiates at ~0-20 C
BUS_RADIATOR_W = 250         # radiator area already built into the bus panels
BUS_RADIATOR_COLD_W = 80
MLI_FACTOR = [1.0, 0.06, 0.03, 0.02]   # heat leak vs number of blanket layers fitted
MLI_SOLAR = [1.0, 0.15, 0.10, 0.08]    # absorbed sunlight vs blanket layers

# ---------------- cost (NASA-style parametric estimate, $M) ----------------
BUS_CER_A = 1.6              # bus development + build = A * dry_mass_kg^0.7 (mass-based cost estimating relation)
BUS_CER_B = 0.7
WRAP = 0.30                  # project management, systems engineering, mission assurance, integration & test
RESERVE = 0.25               # NASA requires ~25 % cost reserves at confirmation
NUCLEAR_LAUNCH_M = 50        # extra launch processing + nuclear safety approval for RTG missions
COST_GROWTH_MEAN = 0.12      # historical Discovery development cost growth ~12 %
COST_GROWTH_SD = 0.10

Part = dict[str, Any]
Mission = dict[str, Any]


def _spec(p: Part, key: str, default: Any = 0.0):
    return (p.get("specs") or {}).get(key, default)


def margin_to_prob(margin: float, steepness: float = 10.0) -> float:
    """0 margin -> 50 %, +20 % -> ~88 %, -20 % -> ~12 %."""
    return 1.0 / (1.0 + math.exp(-steepness * margin))


def hohmann(r1_au: float, r2_au: float) -> tuple[float, float]:
    """(departure C3 in km^2/s^2, transfer time in days) for a Hohmann transfer between circular orbits."""
    v_inf = V_EARTH * math.sqrt(1 / r1_au) * (math.sqrt(2 * r2_au / (r1_au + r2_au)) - 1)
    a = (r1_au + r2_au) / 2
    t = 0.5 * 365.256 * a ** 1.5
    return v_inf ** 2, t


def escape_dv(c3: float) -> float:
    """m/s an upper stage must add from a 200 km parking orbit to reach C3 (km^2/s^2)."""
    return (math.sqrt(c3 + 2 * MU_EARTH / R_LEO) - math.sqrt(MU_EARTH / R_LEO)) * 1000


def payload_to_c3(lv: Part, c3: float) -> float:
    """Upper-stage rocket equation: payload the launcher can send to C3."""
    leo = _spec(lv, "payload_leo_kg")
    stage = _spec(lv, "upper_dry_kg", 0.25 * leo)
    isp = _spec(lv, "upper_isp_s", 450)
    return max(0.0, (leo + stage) * math.exp(-escape_dv(c3) / (isp * G0)) - stage)


def cycle_life(dod: float) -> float:
    """Li-ion cycles to 80 % capacity vs depth of discharge (LEO-type cycling curve)."""
    return 50000 * math.exp(-4.5 * max(0.05, dod))


def default_env(mission: Mission) -> dict[str, Any]:
    """Static environment from catalog values (used in tests / when no NASA snapshot is supplied)."""
    D = DEST.get(mission["destination"], DEST["Mars"])
    days = int(mission["days"])
    link = min(1 / max(mission["comm_au"], 0.01) ** 2, 25.0)
    return dict(source="catalog defaults", c3=D["c3_min"], c3_min=D["c3_min"], cruise_days=D["cruise_d"],
                sun_au=mission["sun_au"], comm_au=mission["comm_au"],
                light_time_min=round(mission["comm_au"] * LIGHT_S_PER_AU / 60, 2),
                window="Open", window_days_off=0, next_window_days=0, phase_deg=None, optimal_phase_deg=None,
                min_sep_deg=90.0, blackout_days=0, cruise_sun_min=min(1.0, 1 / mission["sun_au"] ** 2),
                solar_factor=[1 / mission["sun_au"] ** 2] * days, link_factor=[link] * days,
                activity_index=1.5, space_weather_level="moderate", space_weather_source="assumed",
                sep_events=0, launch_date=None, arrival_date=None)


def _mga(p: Part) -> float:
    return float(_spec(p, "mga", MGA_DEFAULT.get(p["category"], 0.10)))


# --------------------------------------------------------------------------
# Mass properties (shared by analyze + simulate)
# --------------------------------------------------------------------------
def mass_properties(spacecraft_parts: list[Part], growth: float = 1.0) -> dict[str, Any]:
    """growth = fraction of the MGA that is realised (1.0 = predicted, 0.0 = CBE)."""
    by_cat: dict[str, float] = {}
    for p in spacecraft_parts:
        by_cat[p["category"]] = by_cat.get(p["category"], 0.0) + p["mass"]
    parts_cbe = sum(by_cat.values())
    fixed = AVIONICS_KG + ADCS_KG
    dry_cbe = (parts_cbe + fixed) / (1 - STRUCTURE_FRAC - HARNESS_FRAC)
    structure, harness = dry_cbe * STRUCTURE_FRAC, dry_cbe * HARNESS_FRAC
    mga_kg = (sum(p["mass"] * _mga(p) for p in spacecraft_parts) + fixed * MGA_BUS
              + (structure + harness) * MGA_STRUCT)
    return dict(by_cat=by_cat, parts_cbe=parts_cbe, fixed=fixed, structure=structure, harness=harness,
                dry_cbe=dry_cbe, mga_kg=mga_kg, dry=dry_cbe + mga_kg * growth)


def thermal(by_cat: dict[str, list[Part]], dry_mass: float, mission: Mission, env: dict[str, Any],
            internal_w: float) -> dict[str, Any]:
    """Hot case: absorbed sun + planet glow + electronics + RTG heat must be rejected.
    Cold case (eclipse): heat leaking out must be made up by electronics, RTG heat or heaters."""
    D = DEST.get(mission["destination"], DEST["Mars"])
    therm = by_cat.get("thermal", [])
    n_mli = min(3, sum(1 for p in therm if _spec(p, "insulation", False)))
    a_proj = 0.6 + 0.0015 * dry_mass
    a_surf = 3 * a_proj
    rtg_heat = sum(_spec(p, "thermal_w", 0) - _spec(p, "gen_w") for p in by_cat.get("power", [])
                   if not _spec(p, "solar", False))
    s_dest = SOLAR_CONSTANT * max(env["solar_factor"])
    s_cruise = SOLAR_CONSTANT * max(env["cruise_sun_min"], max(env["solar_factor"]), 1 / 1.0167 ** 2)
    absorb = a_proj * ABSORPTIVITY * MLI_SOLAR[n_mli]
    hot_dest = absorb * (s_dest + D["planet_flux"])
    hot_cruise = absorb * s_cruise
    hot_load = max(hot_dest, hot_cruise) + 0.9 * internal_w + 0.25 * rtg_heat
    body = a_surf * BODY_EMIT_W_M2 * MLI_FACTOR[n_mli]
    reject = BUS_RADIATOR_W + body + sum(_spec(p, "reject_w", 0) for p in therm)
    cold_leak = BUS_RADIATOR_COLD_W + body + sum(_spec(p, "cold_leak_w", 0) for p in therm)
    return dict(n_mli=n_mli, area_m2=round(a_surf, 2), hot_load_w=round(hot_load), reject_w=round(reject),
                hot_margin=round(reject / hot_load - 1, 3), cold_leak_w=round(cold_leak),
                rtg_heat_w=round(rtg_heat), absorbed_sun_w=round(max(hot_dest, hot_cruise)))


def heater_power(th: dict[str, Any], internal_w: float) -> float:
    return max(0.0, th["cold_leak_w"] - 0.9 * internal_w - 0.5 * th["rtg_heat_w"])


def cost_model(parts: list[Part], mission: Mission, env: dict[str, Any], dry_mass: float) -> dict[str, Any]:
    D = DEST.get(mission["destination"], DEST["Mars"])
    lv = next((p for p in parts if p["category"] == "launch"), None)
    hardware = sum(p["cost"] for p in parts if p["category"] != "launch")
    sc_parts = [p for p in parts if p["category"] != "launch"]
    bus = BUS_CER_A * dry_mass ** BUS_CER_B if sc_parts else 0.0
    wrap = WRAP * (hardware + bus)
    dev = hardware + bus + wrap
    reserve = RESERVE * dev
    ops = D["ops_per_day"] * (env["cruise_days"] + mission["days"])
    nuclear = any(not _spec(p, "solar", False) for p in parts if p["category"] == "power")
    launch = (lv["cost"] if lv else 0.0) + (NUCLEAR_LAUNCH_M if nuclear and lv else 0.0)
    total = dev + reserve + ops + launch
    rows = [("Launch service", launch), ("Spacecraft bus (mass-based)", bus), ("Instruments & parts", hardware),
            ("Management, systems eng., I&T", wrap), ("Reserves (25%)", reserve), ("Operations + DSN", ops)]
    return dict(total=round(total, 1), hardware=round(hardware, 1), bus=round(bus, 1), wrap=round(wrap, 1),
                development=round(dev, 1), reserve=round(reserve, 1), operations=round(ops, 1),
                launch=round(launch, 1), nuclear_surcharge=NUCLEAR_LAUNCH_M if nuclear and lv else 0,
                rows=[dict(label=l, musd=round(v, 1)) for l, v in rows if v > 0])


def launch_options(lvs: list[Part], c3: float, launch_mass: float | None = None) -> list[dict[str, Any]]:
    """Every rocket in the catalog vs today's C3: capability, price range, does your probe fit?"""
    out = []
    for lv in lvs:
        cap = payload_to_c3(lv, c3)
        out.append(dict(slug=lv["slug"], name=lv["name"], capacity_kg=round(cap), cost=lv["cost"],
                        price_low=_spec(lv, "price_low", lv["cost"]), price_high=_spec(lv, "price_high", lv["cost"]),
                        reliability=lv["reliability"], ref=_spec(lv, "ref", ""),
                        fits=(launch_mass is not None and cap >= launch_mass)))
    return sorted(out, key=lambda o: o["cost"])


def launch_price_range(opts: list[dict[str, Any]], mass_kg: float) -> dict[str, Any] | None:
    ok = [o for o in opts if o["capacity_kg"] >= mass_kg]
    if not ok:
        return None
    return dict(mass_kg=round(mass_kg), low=min(o["price_low"] for o in ok), high=max(o["price_high"] for o in ok),
                cheapest=min(ok, key=lambda o: o["cost"])["name"], count=len(ok))


# --------------------------------------------------------------------------
# Static analysis: what the drafting board shows live
# --------------------------------------------------------------------------
def analyze(parts: list[Part], mission: Mission, env: dict[str, Any] | None = None,
            catalog_lvs: list[Part] | None = None) -> dict[str, Any]:
    env = env or default_env(mission)
    D = DEST.get(mission["destination"], DEST["Mars"])
    by_cat: dict[str, list[Part]] = {}
    for p in parts:
        by_cat.setdefault(p["category"], []).append(p)
    sc_parts = [p for p in parts if p["category"] != "launch"]

    # ---- mass budget ----
    mp = mass_properties(sc_parts)
    dry_mass = mp["dry"]
    costs = cost_model(parts, mission, env, dry_mass)
    cost = costs["total"]
    propellant = sum(_spec(p, "propellant_kg") for p in by_cat.get("propulsion", []))
    wet_mass = dry_mass + propellant
    launch_mass = wet_mass + ADAPTER_KG
    labels = dict(power="Power generation", battery="Batteries", instrument="Science payload",
                  storage="Data storage", comms="Telecom", propulsion="Propulsion hardware",
                  thermal="Thermal control")
    rows = [(labels[c], kg) for c, kg in mp["by_cat"].items()]
    rows += [("Avionics + ADCS", mp["fixed"]), ("Structure (22%)", mp["structure"]),
             ("Harness (6%)", mp["harness"]), ("Growth allowance (MGA)", mp["mga_kg"]),
             ("Propellant", propellant)]
    mass_budget = [dict(label=l, kg=round(kg, 1), pct=round(100 * kg / wet_mass, 1))
                   for l, kg in sorted(rows, key=lambda r: -r[1]) if kg > 0]
    heaviest = max(sc_parts, key=lambda p: p["mass"], default=None)
    weight_at_dest_n = wet_mass * D["gravity"]

    # ---- launch ----
    lvs = by_cat.get("launch", [])
    lv = lvs[0] if lvs else None
    if lv:
        thrust_n = _spec(lv, "thrust_kn") * 1000
        twr = thrust_n / ((_spec(lv, "rocket_mass_t") * 1000 + launch_mass) * G0)
        capacity = payload_to_c3(lv, env["c3"])
        leo = _spec(lv, "payload_leo_kg")
    else:
        twr, capacity, leo = 0.0, 0.0, 0.0
    twr_margin = twr / MIN_TWR - 1 if lv else -1.0
    capacity_margin = capacity / launch_mass - 1 if lv else -1.0
    cbe_launch = mp["dry_cbe"] + propellant + ADAPTER_KG
    system_margin = (capacity - launch_mass) / capacity if capacity else -1.0

    # ---- delta-v ----
    ion = any(_spec(p, "isp_s") > 1000 for p in by_cat.get("propulsion", []))
    c3_ratio = (env["c3"] / env["c3_min"]) ** 0.25 if env["c3_min"] > 0 else 1.0
    dv_required = (mission["insertion_dv"] * c3_ratio * (LOW_THRUST_FACTOR if ion else 1 + FINITE_BURN_LOSS)
                   + D["tcm_dv"])
    if propellant > 0:
        isp = sum(_spec(p, "isp_s") * _spec(p, "propellant_kg") for p in by_cat["propulsion"]) / propellant
        delta_v = isp * G0 * math.log(wet_mass / (dry_mass + propellant * PROP_RESIDUAL))
    else:
        isp, delta_v = 0.0, 0.0
    dv_margin = delta_v / dv_required - 1

    # ---- power ----
    years = (env["cruise_days"] + mission["days"]) / 365.25
    sf = env["solar_factor"]
    sun_avg = sum(sf) / len(sf)
    hot_loss = 1 - 0.09 * max(0.0, sun_avg - 1)                  # cells run hotter near the Sun
    degr = (1 - SOLAR_DEGRADE_PER_YR * years) * (1 - 0.003 * env["activity_index"])
    solar_bol = sum(_spec(p, "gen_w") for p in by_cat.get("power", []) if _spec(p, "solar", False))
    solar_w = solar_bol * sun_avg * hot_loss * degr
    rtg_w = sum(_spec(p, "gen_w") * (1 - _spec(p, "decay_per_yr", 0.03)) ** years
                for p in by_cat.get("power", []) if not _spec(p, "solar", False))
    ecl = mission["eclipse_frac"]
    avg_gen_w = solar_w * (1 - ecl) + rtg_w

    instr_draw = sum(p["power_draw"] for p in by_cat.get("instrument", []))
    base_draw = BUS_POWER_W + sum(p["power_draw"] for p in sc_parts)
    th = thermal(by_cat, dry_mass, mission, env, base_draw)
    heater_w = heater_power(th, base_draw - instr_draw)      # eclipse: instruments may be off
    ops_draw_w = base_draw + heater_w
    bus_draw_w = ops_draw_w - instr_draw
    cruise_draw_w = (BUS_POWER_W + heater_w
                     + max((p["power_draw"] for p in by_cat.get("comms", [])), default=0)
                     + sum(p["power_draw"] for p in by_cat.get("thermal", []))
                     + sum(_spec(p, "cruise_power_w") for p in by_cat.get("propulsion", [])))
    cruise_gen_w = solar_bol * env["cruise_sun_min"] * degr + rtg_w
    power_margin = avg_gen_w / ops_draw_w - 1
    cruise_power_margin = cruise_gen_w / cruise_draw_w - 1
    duty = max(0.0, min(1.0, (avg_gen_w - bus_draw_w) / instr_draw)) if instr_draw else 1.0

    battery_wh = sum(_spec(p, "battery_wh") for p in by_cat.get("battery", []))
    eclipse_hours = mission["orbit_hours"] * ecl
    eclipse_need_wh = max(0.0, bus_draw_w + instr_draw * duty - rtg_w) * eclipse_hours
    battery_margin = (battery_wh * BATTERY_DOD / eclipse_need_wh - 1) if eclipse_need_wh > 0 else 1.0
    dod = eclipse_need_wh / battery_wh if battery_wh else (1.0 if eclipse_need_wh else 0.0)
    cycles = mission["days"] * 24 / mission["orbit_hours"]
    battery_life_margin = cycle_life(dod) / cycles - 1 if eclipse_need_wh > 0 else 1.0

    # ---- data ----
    req = set(mission["required_tags"])
    instruments = by_cat.get("instrument", [])
    data_gb_day = sum(_spec(p, "data_gb_day") for p in instruments) * duty
    science_per_day = 0.0
    for p in instruments:
        match = bool(req & set(_spec(p, "tags", [])))
        science_per_day += (_spec(p, "data_gb_day") * duty * _spec(p, "quality", 1.0)
                            * (1 if match else SECONDARY_SCIENCE))
    value_per_gb = science_per_day / data_gb_day if data_gb_day else 0.0
    objective_covered = any(req & set(_spec(p, "tags", [])) for p in instruments)
    storage_gb = BUS_STORAGE_GB + sum(_spec(p, "storage_gb") for p in by_cat.get("storage", []))
    best_mbps = max((_spec(p, "downlink_mbps") for p in by_cat.get("comms", [])), default=0.0)
    lf = env["link_factor"]
    per_day_gb = [best_mbps * f * CONTACT_HOURS_PER_DAY * 3600 / 8000 for f in lf]
    downlink_gb_day = sum(per_day_gb) / len(per_day_gb)
    downlink_mbps = best_mbps * (sum(lf) / len(lf))
    max_return = sum(min(data_gb_day, g) for g in per_day_gb) * value_per_gb
    data_margin = (downlink_gb_day / data_gb_day - 1) if data_gb_day else 0.0

    # ---- thermal / radiation ----
    thermal_margin = th["hot_margin"]
    rad_survival = math.exp(-RAD_K * env["activity_index"] * env["cruise_days"] / 180)

    env_summary = {k: v for k, v in env.items() if k not in ("solar_factor", "link_factor")}
    # raw inputs for the live "equations" panel (every number the formulas use)
    eq = dict(
        g0=G0, mu_earth=MU_EARTH, r_leo_km=R_LEO, solar_constant=SOLAR_CONSTANT, v_earth=V_EARTH,
        thrust_kn=_spec(lv, "thrust_kn") if lv else 0, rocket_mass_t=_spec(lv, "rocket_mass_t") if lv else 0,
        upper_isp_s=_spec(lv, "upper_isp_s", 450) if lv else 0, upper_dry_kg=_spec(lv, "upper_dry_kg", 0) if lv else 0,
        lv_name=lv["name"] if lv else None,
        insertion_dv_base=mission["insertion_dv"], c3_ratio=round(c3_ratio, 4), tcm_dv=D["tcm_dv"],
        loss_factor=LOW_THRUST_FACTOR if ion else 1 + FINITE_BURN_LOSS, prop_residual=PROP_RESIDUAL,
        parts_cbe_kg=round(mp["parts_cbe"], 1), fixed_kg=mp["fixed"], structure_frac=STRUCTURE_FRAC,
        harness_frac=HARNESS_FRAC, sun_avg=round(sun_avg, 4), hot_loss=round(hot_loss, 4), degradation=round(degr, 4),
        years=round(years, 3), eclipse_frac=ecl, eclipse_hours=round(eclipse_hours, 3), orbit_hours=mission["orbit_hours"],
        battery_dod_limit=BATTERY_DOD, best_mbps=best_mbps, link_avg=round(sum(lf) / len(lf), 5),
        contact_hours=CONTACT_HOURS_PER_DAY, days=mission["days"], value_per_gb=round(value_per_gb, 4),
        bus_cer_a=BUS_CER_A, bus_cer_b=BUS_CER_B, wrap=WRAP, reserve=RESERVE, ops_per_day=D["ops_per_day"],
        planet_flux=D["planet_flux"], gravity_dest=D["gravity"], instr_draw_w=instr_draw, bus_draw_w=round(bus_draw_w, 1),
        rad_k=RAD_K,
    )
    opts = launch_options(catalog_lvs, env["c3"], launch_mass) if catalog_lvs else []
    stats = dict(
        cost=cost, budget=mission["budget"], budget_left=round(mission["budget"] - cost, 1),
        cost_breakdown=costs, hardware_cost=costs["hardware"],
        launch_options=opts, launch_price_range=launch_price_range(opts, launch_mass) if opts and sc_parts else None,
        # mass
        cbe_dry_mass_kg=round(mp["dry_cbe"], 1), mga_kg=round(mp["mga_kg"], 1),
        dry_mass_kg=round(dry_mass, 1), propellant_kg=round(propellant, 1), wet_mass_kg=round(wet_mass, 1),
        launch_mass_kg=round(launch_mass, 1), adapter_kg=ADAPTER_KG, cbe_launch_kg=round(cbe_launch, 1),
        structure_kg=round(mp["structure"], 1), harness_kg=round(mp["harness"], 1),
        mass_budget=mass_budget, heaviest_part=heaviest["name"] if heaviest else None,
        heaviest_part_kg=heaviest["mass"] if heaviest else 0,
        weight_at_destination_n=round(weight_at_dest_n), weight_on_earth_n=round(wet_mass * G0),
        system_margin=round(system_margin, 3), required_system_margin=REQUIRED_SYSTEM_MARGIN,
        # launch
        twr=round(twr, 3), twr_margin=round(twr_margin, 3), lv_leo_kg=leo,
        lv_capacity_kg=round(capacity, 1), capacity_margin=round(capacity_margin, 3),
        c3=env["c3"], escape_dv=round(escape_dv(env["c3"])),
        # dv
        isp_s=round(isp, 1), delta_v=round(delta_v, 1), dv_required=round(dv_required),
        dv_margin=round(dv_margin, 3), low_thrust=ion,
        # power
        solar_bol_w=solar_bol, solar_w=round(solar_w, 1), rtg_w=round(rtg_w, 1), avg_gen_w=round(avg_gen_w, 1),
        ops_draw_w=round(ops_draw_w, 1), cruise_draw_w=round(cruise_draw_w, 1),
        cruise_gen_w=round(cruise_gen_w, 1), power_margin=round(power_margin, 3),
        cruise_power_margin=round(cruise_power_margin, 3), instrument_duty=round(duty, 3),
        battery_wh=battery_wh, eclipse_need_wh=round(eclipse_need_wh, 1), battery_margin=round(battery_margin, 3),
        battery_dod=round(dod, 3), battery_cycles=round(cycles), battery_cycle_life=round(cycle_life(dod)),
        battery_life_margin=round(battery_life_margin, 3),
        # data
        data_gb_day=round(data_gb_day, 2), storage_gb=storage_gb,
        downlink_mbps=round(downlink_mbps, 3), downlink_gb_day=round(downlink_gb_day, 2),
        data_margin=round(data_margin, 3),
        science_per_day=round(science_per_day, 2), max_science=round(max_return, 1),
        science_target=mission["science_target"], objective_covered=objective_covered,
        # thermal / radiation
        thermal=th, heater_w=round(heater_w), thermal_margin=thermal_margin,
        radiation_survival=round(rad_survival, 3),
        env=env_summary, eq=eq,
    )
    stats["warnings"] = _warnings(stats, by_cat, mission)
    return stats


def _warnings(s: dict, by_cat: dict, mission: Mission) -> list[dict[str, str]]:
    """Plain-language cascading consequences. level: 'fail' | 'warn' | 'info'."""
    w: list[dict[str, str]] = []
    env = s["env"]

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
            add("fail" if s["capacity_margin"] < -0.15 else "warn", "capacity",
                f"Launch mass {s['launch_mass_kg']:.0f} kg (incl. {ADAPTER_KG} kg adapter + "
                f"{s['mga_kg']:.0f} kg growth allowance) but the rocket only sends "
                f"{s['lv_capacity_kg']:.0f} kg to C3 {s['c3']:.1f} km²/s².")
        elif s["system_margin"] < REQUIRED_SYSTEM_MARGIN:
            add("warn", "mass_margin",
                f"Only {s['system_margin']:.0%} launch mass margin. NASA projects hold ≥15% on top of MGA: "
                f"if the as-built probe grows, propellant gets off-loaded.")
    if env.get("window_days_off", 0) > 20:
        add("warn", "window",
            f"{env['window_days_off']} days from the ideal {mission['destination']} launch window today: "
            f"C3 is {s['c3']:.1f} instead of {env['c3_min']:.1f} km²/s² (next ideal window in "
            f"{env.get('next_window_days', 0)} days).")
    if not by_cat.get("power"):
        add("fail", "power", "No power source: the probe is dead on arrival.")
    elif s["power_margin"] < 0:
        add("fail" if s["instrument_duty"] <= 0 else "warn", "power",
            f"Operating draw {s['ops_draw_w']:.0f} W exceeds average generation {s['avg_gen_w']:.0f} W "
            f"(end-of-life, at {env['sun_au']:.2f} AU from the Sun). Instruments will be throttled to "
            f"{s['instrument_duty']:.0%} duty.")
    if s["cruise_power_margin"] < 0 and by_cat.get("power"):
        add("warn", "cruise_power",
            f"Cruise needs {s['cruise_draw_w']:.0f} W but arrays give {s['cruise_gen_w']:.0f} W at the worst point.")
    if s["eclipse_need_wh"] > 0 and s["battery_margin"] < 0:
        add("fail" if s["battery_wh"] == 0 else "warn", "battery",
            f"Eclipses need {s['eclipse_need_wh']:.0f} Wh but batteries supply "
            f"{s['battery_wh'] * BATTERY_DOD:.0f} Wh usable (80% depth of discharge).")
    elif s["eclipse_need_wh"] > 0 and s["battery_life_margin"] < 0:
        add("warn", "battery_life",
            f"{s['battery_cycles']} eclipse cycles at {s['battery_dod']:.0%} depth of discharge, but the cells "
            f"only last ~{s['battery_cycle_life']} cycles. The battery will fade before the mission ends.")
    if not by_cat.get("comms"):
        add("fail", "comms", "No antenna: you will never hear from your probe.")
    if env.get("blackout_days", 0) > 0:
        add("info", "conjunction",
            f"Solar conjunction: the Sun blocks the radio link for {env['blackout_days']} days of the mission.")
    if not by_cat.get("instrument"):
        add("fail", "instrument", "No science instruments.")
    elif not s["objective_covered"]:
        add("fail", "objective",
            f"No instrument can do the objective (needs: {', '.join(mission['required_tags'])}).")
    if by_cat.get("instrument") and s["data_margin"] < 0:
        add("warn", "downlink",
            f"Instruments make {s['data_gb_day']:.1f} GB/day but you can only downlink "
            f"{s['downlink_gb_day']:.2f} GB/day at {env['comm_au']:.2f} AU.")
    if by_cat.get("instrument") and s["storage_gb"] < s["data_gb_day"] * 2:
        add("warn", "storage", f"Only {s['storage_gb']} GB storage: less than 2 days of data. Overflow is lost.")
    if s["dv_margin"] < 0:
        add("fail" if s["dv_margin"] < -0.03 else "warn", "delta_v",
            f"Delta-v {s['delta_v']:.0f} m/s < {s['dv_required']} m/s needed (insertion + course corrections"
            f"{' + low-thrust spiral' if s['low_thrust'] else ' + gravity losses'}).")
    if s["thermal_margin"] < 0:
        th = s["thermal"]
        add("fail" if s["thermal_margin"] < -0.3 else "warn", "thermal",
            f"Overheats: {th['hot_load_w']} W of heat in the hot case (sunlight {th['absorbed_sun_w']} W, "
            f"electronics, RTG {th['rtg_heat_w']} W) but only {th['reject_w']} W can be radiated. Add radiators "
            f"or active cooling.")
    if s["heater_w"] > 40:
        add("warn", "heaters",
            f"In the cold the probe leaks {s['thermal']['cold_leak_w']} W of heat: heaters eat {s['heater_w']} W of "
            f"power{' (add MLI blankets)' if s['thermal']['n_mli'] == 0 else ''}.")
    if s["budget"] and s["budget_left"] >= 0 and s["budget_left"] < 0.05 * s["budget"] and s["cost_breakdown"]["hardware"] > 0:
        add("info", "cost_margin",
            f"Only ${s['budget_left']:.0f}M below the cost cap. Reserves cover ~25% growth; beyond that NASA descopes.")
    if s["radiation_survival"] < 0.95:
        add("warn", "radiation",
            f"Space weather is {env['space_weather_level']} (NASA DONKI): "
            f"{1 - s['radiation_survival']:.0%} chance of a radiation upset killing electronics in cruise.")
    if by_cat.get("instrument") and s["objective_covered"] and s["max_science"] < s["science_target"]:
        add("warn", "science",
            f"Best case science return {s['max_science']:.0f} < target {s['science_target']}.")
    return w


# --------------------------------------------------------------------------
# Simulation
# --------------------------------------------------------------------------
def simulate(parts: list[Part], mission: Mission, seed: str | int,
             env: dict[str, Any] | None = None) -> dict[str, Any]:
    env = env or default_env(mission)
    s = analyze(parts, mission, env)
    D = DEST.get(mission["destination"], DEST["Mars"])
    by_cat: dict[str, list[Part]] = {}
    for p in parts:
        by_cat.setdefault(p["category"], []).append(p)
    sc_parts = [p for p in parts if p["category"] != "launch"]

    def R(phase: str) -> random.Random:
        """One RNG stream per phase: both players get the same dice in every phase."""
        return random.Random(f"{seed}:{phase}")

    timeline: list[dict[str, Any]] = []
    probabilities: dict[str, float] = {}
    as_built: dict[str, Any] = {}

    def ev(t, phase, status, msg):
        timeline.append(dict(t=round(t, 3), phase=phase, status=status, message=msg))

    def rel(cat):
        r = 1.0
        for p in by_cat.get(cat, []):
            r *= p["reliability"]
        return r

    def rel_parallel(cat):
        """Redundant units: the function is lost only if every unit fails."""
        q = 1.0
        for p in by_cat.get(cat, []):
            q *= 1 - p["reliability"]
        return 1 - q if by_cat.get(cat) else 0.0

    def finish(outcome, failed_phase=None, science=0.0, survived_days=0):
        pct = science / mission["science_target"] if mission["science_target"] else 0
        complete = failed_phase is None
        score = round(min(pct, 1.5) * 1000)
        if score > 0:
            score += round(max(0, as_built.get("budget_left", s["budget_left"])))
        if complete and pct >= 1:
            score += 250
        return dict(outcome=outcome, success=complete and pct >= 1, failed_phase=failed_phase,
                    science=round(science, 1), science_pct=round(pct, 3),
                    survived_days=survived_days, days=mission["days"], score=score, timeline=timeline,
                    probabilities=probabilities, stats=s, as_built=as_built)

    # ---------- Phase 0: build, weigh, and flight readiness review ----------
    ev(0.0, "review", "info", f"Flight readiness review. Launch date {env.get('launch_date') or 'TBD'}, "
                              f"C3 {env['c3']:.1f} km²/s² ({env.get('window', 'Open')} window).")
    if s["budget_left"] < 0:
        ev(0.02, "review", "fail", "Mission cancelled: over budget.")
        return finish("Cancelled - over budget", "review")
    if not by_cat.get("launch"):
        ev(0.02, "review", "fail", "Scrubbed: no launch vehicle.")
        return finish("Scrubbed - no rocket", "review")

    rcost = R("cost")
    cg = max(-0.05, min(0.6, rcost.gauss(COST_GROWTH_MEAN, COST_GROWTH_SD)))   # shared cost-growth dice
    cb = s["cost_breakdown"]
    actual_cost = cb["development"] * (1 + cg) + cb["operations"] + cb["launch"]
    as_built.update(cost_growth=round(cg, 3), actual_cost=round(actual_cost, 1),
                    budget_left=round(mission["budget"] - actual_cost, 1))
    ev(0.01, "review", "warn" if cg > RESERVE else "info",
       f"Development cost grew {cg:+.0%} (reserves cover {RESERVE:.0%}): final cost ${actual_cost:.0f}M "
       f"of ${mission['budget']}M cap.")
    if actual_cost > mission["budget"] * 1.10:
        ev(0.02, "review", "fail", "Cost overrun above 10% of the cap: NASA termination review cancels the mission.")
        return finish("Cancelled - cost overrun", "review")

    rb = R("build")
    growth = max(0.0, min(1.5, rb.gauss(0.55, 0.3)))   # fraction of MGA realised on the scale
    mp = mass_properties(sc_parts, growth)
    dry = mp["dry"]
    propellant = s["propellant_kg"]
    capacity = s["lv_capacity_kg"]
    launch_mass = dry + propellant + ADAPTER_KG
    as_built.update(growth_of_mga=round(growth, 2), dry_mass_kg=round(dry, 1),
                    growth_kg=round(dry - mp["dry_cbe"], 1), propellant_kg=round(propellant, 1))
    ev(0.03, "review", "info",
       f"Spacecraft weighed: {dry:.0f} kg dry (CBE {mp['dry_cbe']:.0f} kg + {dry - mp['dry_cbe']:.0f} kg growth), "
       f"{propellant:.0f} kg propellant. Rocket capability to C3: {capacity:.0f} kg.")
    if launch_mass > capacity:
        over = launch_mass - capacity
        offload = min(over, propellant * 0.6)
        if over - offload > 0.5:
            ev(0.05, "review", "fail",
               f"Scrubbed: {over:.0f} kg too heavy for {by_cat['launch'][0]['name']} even after off-loading propellant.")
            as_built["offloaded_kg"] = round(offload, 1)
            return finish("Too heavy for the rocket", "review")
        propellant -= offload
        as_built["offloaded_kg"] = round(offload, 1)
        as_built["propellant_kg"] = round(propellant, 1)
        ev(0.05, "review", "warn", f"Overweight by {over:.0f} kg: ground team off-loads {offload:.0f} kg of propellant.")
    wet = dry + propellant

    # ---------- Phase 1: launch & ascent ----------
    lv = by_cat["launch"][0]
    twr = _spec(lv, "thrust_kn") * 1000 / ((_spec(lv, "rocket_mass_t") * 1000 + wet + ADAPTER_KG) * G0)
    ev(0.06, "launch", "info", f"Liftoff on {lv['name']}! TWR {twr:.2f}, {wet * G0 / 1000:.1f} kN of spacecraft on top.")
    if twr < 1.0:
        ev(0.08, "launch", "fail", "Engines at full thrust... the rocket never leaves the pad.")
        return finish("Too heavy to lift off", "launch")
    p_launch = lv["reliability"] * margin_to_prob(twr / MIN_TWR - 1 + 0.25)
    probabilities["launch"] = round(p_launch, 3)
    if R("launch").random() > p_launch:
        ev(0.12, "launch", "fail",
           "Low thrust margin: huge gravity losses, the upper stage ran dry." if twr < MIN_TWR
           else "Ascent anomaly - vehicle lost.")
        return finish("Launch failure", "launch")
    arrival = env.get("arrival_date") or f"in {env['cruise_days']:.0f} days"
    ev(0.15, "launch", "ok", f"Trans-{mission['destination']} injection: {s['escape_dv']} m/s burn, "
                             f"{wet:.0f} kg on its way. Arrival {arrival}.")

    # ---------- Phase 2: cruise ----------
    if not by_cat.get("power"):
        ev(0.2, "cruise", "fail", "No power source. Batteries drained within hours.")
        return finish("Dead on arrival - no power", "cruise")
    if not by_cat.get("comms"):
        ev(0.2, "cruise", "fail", "No antenna. Mission control never acquires the signal.")
        return finish("Lost - no communications", "cruise")
    rc = R("cruise")
    antennas = sorted(by_cat["comms"], key=lambda p: -_spec(p, "downlink_mbps"))
    working = [a for a in antennas if rc.random() <= a["reliability"]]
    rad = s["radiation_survival"]
    p_cruise = (rel_parallel("power") * rel("propulsion") * rel("thermal") * rad
                * margin_to_prob(s["cruise_power_margin"] + 0.3, 8)
                * margin_to_prob(s["thermal_margin"] * 3 + 0.5, 8))
    probabilities["cruise"] = round(p_cruise * rel_parallel("comms"), 3)
    probabilities["radiation"] = rad
    ev(0.25, "cruise", "info",
       f"Signal acquired. Light time {env['light_time_min']:.1f} min at arrival. "
       f"Space weather: {env['space_weather_level']}.")
    if not working:
        ev(0.38, "cruise", "fail", "Every antenna failed. Contact lost forever.")
        return finish("Lost in cruise", "cruise")
    if working[0] is not antennas[0]:
        ev(0.33, "cruise", "warn", f"{antennas[0]['name']} failed! Switching to backup {working[0]['name']}.")
    roll = rc.random()
    if roll > p_cruise:
        if s["thermal_margin"] < 0:
            msg = "Electronics overheated during cruise."
        elif s["cruise_power_margin"] < 0:
            msg = "Power brownout during cruise - safe mode loop, contact lost."
        elif roll > p_cruise / rad:
            msg = "Solar particle storm: radiation upset fried the flight computer."
        else:
            msg = "Component failure during cruise - contact lost."
        ev(0.42, "cruise", "fail", msg)
        return finish("Lost in cruise", "cruise")
    ev(0.5, "cruise", "ok", f"Approaching {mission['destination']} after {env['cruise_days']:.0f} days.")

    # ---------- Phase 3: orbit insertion (Monte Carlo dispersions) ----------
    if propellant <= 0 or not by_cat.get("propulsion"):
        ev(0.58, "insertion", "fail", f"No engine to brake: the probe flies past {mission['destination']}.")
        return finish("Missed orbit - flyby", "insertion")
    ri = R("insertion")
    isp = s["isp_s"] * (1 + 0.005 * ri.gauss(0, 1))
    dv_avail = isp * G0 * math.log(wet / (dry + propellant * PROP_RESIDUAL))
    dv_need = s["dv_required"] * (1 + 0.015 * ri.gauss(0, 1))
    as_built.update(delta_v=round(dv_avail), dv_needed=round(dv_need))
    p_ins = rel("propulsion")
    probabilities["insertion"] = round(p_ins * (1.0 if dv_avail >= dv_need else 0.0), 3)
    ev(0.55, "insertion", "info", f"Orbit insertion burn: {dv_avail:.0f} m/s available, {dv_need:.0f} m/s needed.")
    if dv_avail < dv_need:
        ev(0.6, "insertion", "fail",
           f"Out of propellant {dv_need - dv_avail:.0f} m/s short. Escaping into solar orbit.")
        return finish("Orbit insertion failed", "insertion")
    if ri.random() > p_ins:
        ev(0.6, "insertion", "fail", "Engine anomaly during the burn.")
        return finish("Orbit insertion failed", "insertion")
    ev(0.62, "insertion", "ok", f"In orbit around {mission['destination']}! {dv_avail - dv_need:.0f} m/s left over.")

    # ---------- Phase 4: science operations, day by day ----------
    ro = R("ops")
    days = mission["days"]
    death_day, death_msg = days + 1, ""
    if s["thermal_margin"] < -0.05:
        d = int(days * ro.uniform(0.2, 0.9))
        if d < death_day:
            death_day, death_msg = d, "Thermal runaway: instruments cooked."
    p_ops = rel("instrument") * rel("storage") * (rel_parallel("battery") if by_cat.get("battery") else 1.0)
    probabilities["operations"] = round(p_ops, 3)
    if ro.random() > p_ops:
        d = int(days * ro.uniform(0.3, 1.0))
        if d < death_day:
            death_day, death_msg = d, "Critical component failure."
    if not s["objective_covered"]:
        ev(0.66, "science", "warn", "No instrument can address the mission objective!")

    years0 = env["cruise_days"] / 365.25
    solar_bol = s["solar_bol_w"]
    rtg_parts = [p for p in by_cat.get("power", []) if not _spec(p, "solar", False)]
    instr = by_cat.get("instrument", [])
    instr_draw = sum(p["power_draw"] for p in instr)
    bus_draw = s["ops_draw_w"] - instr_draw
    ecl = mission["eclipse_frac"]
    eclipse_h = mission["orbit_hours"] * ecl
    orbits_per_day = 24 / mission["orbit_hours"]
    batt_cap = s["battery_wh"]
    best_mbps = _spec(working[0], "downlink_mbps")
    gen_full = sum(_spec(p, "data_gb_day") for p in instr)
    sci_full = s["science_per_day"] / s["instrument_duty"] if s["instrument_duty"] > 0 else 0.0
    value_per_gb = sci_full / gen_full if gen_full else 0.0
    cap = s["storage_gb"]
    stored = returned_gb = lost_gb = science = 0.0
    cycles_used = 0.0
    shed_warned = storage_warned = blackout_warned = fade_warned = False
    last_day = 0
    for day in range(1, days + 1):
        if day >= death_day:
            break
        t = 0.62 + 0.36 * day / days
        yrs = years0 + day / 365.25
        sf = env["solar_factor"][day - 1]
        hot = 1 - 0.09 * max(0.0, sf - 1)
        degr = (1 - SOLAR_DEGRADE_PER_YR * yrs) * (1 - 0.003 * env["activity_index"])
        rtg = sum(_spec(p, "gen_w") * (1 - _spec(p, "decay_per_yr", 0.03)) ** yrs for p in rtg_parts)
        gen_w = solar_bol * sf * hot * degr * (1 - ecl) + rtg
        if gen_w < bus_draw * 0.9:
            death_day, death_msg = day, "Not enough power to run even the bus. Probe froze."
            break
        duty = max(0.0, min(1.0, (gen_w - bus_draw) / instr_draw)) if instr_draw else 1.0
        if duty < 0.999 and not shed_warned:
            shed_warned = True
            ev(t, "science", "warn", f"Day {day}: power-negative, instruments throttled to {duty:.0%} duty.")
        need_wh = max(0.0, bus_draw + instr_draw * duty - rtg) * eclipse_h
        if need_wh > 0:
            dod = need_wh / batt_cap if batt_cap else 99
            fade = 0.2 * cycles_used / cycle_life(min(dod, 1.0))
            dod_now = need_wh / (batt_cap * (1 - fade)) if batt_cap else 99
            if dod_now > 1.0:
                death_day, death_msg = day, ("Batteries could not survive the eclipse - brownout." if fade < 0.05
                                             else f"Battery faded {fade:.0%} after {cycles_used:.0f} cycles - eclipse brownout.")
                break
            if fade > 0.1 and not fade_warned:
                fade_warned = True
                ev(t, "science", "warn", f"Day {day}: battery capacity down {fade:.0%} from deep cycling.")
            cycles_used += orbits_per_day
        last_day = day
        gen = gen_full * duty
        stored += gen
        if stored > cap:
            lost_gb += stored - cap
            stored = cap
            if not storage_warned:
                storage_warned = True
                ev(t, "science", "warn", f"Day {day}: storage full - new data is being overwritten.")
        lf = env["link_factor"][day - 1]
        if lf == 0 and not blackout_warned:
            blackout_warned = True
            ev(t, "science", "warn", f"Day {day}: solar conjunction - the Sun is between Earth and the probe. No link.")
        down = best_mbps * lf * CONTACT_HOURS_PER_DAY * 3600 / 8000
        sent = min(stored, down)
        stored -= sent
        returned_gb += sent
        science += sent * value_per_gb

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
