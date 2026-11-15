"""
Live NASA data for the simulator.

Two NASA sources are used:

1. JPL Horizons API  (https://ssd.jpl.nasa.gov/api/horizons.api, no key needed)
   Heliocentric position vectors of Earth, Mars, Venus and the Moon from today
   until ~17 months ahead. From these we get, for the real calendar:
     - the Earth-target phase angle -> how close today is to the launch window
       -> departure C3 (launch energy) the rocket has to deliver
     - Sun distance on every day of operations -> solar array output (1/r^2)
     - Earth distance on every day -> radio link strength (1/d^2) and light time
     - Sun-Earth-Probe angle -> solar conjunction comms blackouts

2. NASA DONKI space-weather API  (https://api.nasa.gov/DONKI/..., NASA_API_KEY or DEMO_KEY)
   Solar flares, coronal mass ejections, solar energetic particle (SEP) events
   and geomagnetic storms over the last 30 days -> radiation risk to electronics
   during cruise and solar-array degradation.

Everything is cached (memory + a JSON file next to manage.py), because DEMO_KEY is
rate limited and both players of a match must see identical data. If NASA cannot be
reached, positions come from JPL's published Keplerian elements (Standish, "Keplerian
Elements for Approximate Positions of the Major Planets") and space weather falls
back to an "assumed moderate" value. The response always says which source was used.

Pure Python (stdlib only, no Django imports) so it can be tested without a server.
"""
from __future__ import annotations

import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .sim import DEST, LIGHT_S_PER_AU, hohmann

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
DONKI_URL = "https://api.nasa.gov/DONKI/"
BODIES = {"Earth": "399", "Mars": "499", "Venus": "299", "Moon": "301"}
STEP_DAYS = 2
SPAN_DAYS = 520              # Mars cruise (~260 d) + 120 d operations + slack
TTL_S = 3 * 3600             # refresh every 3 hours
TIMEOUT_S = 10
CACHE_FILE = Path(os.environ.get("NASA_CACHE_FILE",
                                 Path(__file__).resolve().parent.parent / ".nasa_cache.json"))
# a known-good LIVE snapshot saved by `python manage.py nasa_check`: used if NASA is unreachable on demo day
BACKUP_FILE = CACHE_FILE.with_name(".nasa_backup.json")
YEAR_D = 365.256

_lock = threading.Lock()
_cache: dict[str, Any] | None = None
_refreshing = False


# --------------------------------------------------------------------------
# HTTP helpers
# --------------------------------------------------------------------------
def _get_json(url: str, params: dict[str, str]) -> Any:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(full, headers={"User-Agent": "SpaceRace-NASA-SpaceApps/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read().decode("utf-8"))


# --------------------------------------------------------------------------
# JPL Horizons
# --------------------------------------------------------------------------
def parse_horizons_vectors(result_text: str) -> list[list[float]]:
    """Parse the $$SOE..$$EOE block of a CSV VECTORS (VEC_TABLE=1) ephemeris into [[x,y,z],...] AU."""
    if "$$SOE" not in result_text:
        raise ValueError("Horizons response has no ephemeris block")
    block = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in block.strip().splitlines():
        f = [x.strip() for x in line.split(",")]
        if len(f) >= 5:
            rows.append([float(f[2]), float(f[3]), float(f[4])])
    if not rows:
        raise ValueError("Horizons ephemeris block is empty")
    return rows


def fetch_horizons(body_id: str, start: date, days: int = SPAN_DAYS) -> list[list[float]]:
    q = lambda v: f"'{v}'"  # Horizons wants every value quoted
    data = _get_json(HORIZONS_URL, dict(
        format="json", COMMAND=q(body_id), OBJ_DATA=q("NO"), MAKE_EPHEM=q("YES"),
        EPHEM_TYPE=q("VECTORS"), CENTER=q("500@10"), REF_PLANE=q("ECLIPTIC"),
        START_TIME=q(start.isoformat()), STOP_TIME=q((start + timedelta(days=days)).isoformat()),
        STEP_SIZE=q(f"{STEP_DAYS} d"), VEC_TABLE=q("1"), OUT_UNITS=q("AU-D"), CSV_FORMAT=q("YES"),
    ))
    return parse_horizons_vectors(data["result"])


# Standish (JPL) mean elements at J2000 and rates per century: a, e, I, L, long.peri, long.node
_ELEMENTS = {
    "Earth": ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0),
              (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
    "Mars": ((1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891),
             (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
    "Venus": ((0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255),
              (0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418)),
}


def _kepler_pos(body: str, d: date) -> list[float]:
    jd = (datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp() / 86400) + 2440587.5
    t = (jd - 2451545.0) / 36525
    (a0, e0, i0, l0, w0, n0), (ar, er, ir, lr, wr, nr) = _ELEMENTS[body]
    a, e = a0 + ar * t, e0 + er * t
    inc, L = math.radians(i0 + ir * t), l0 + lr * t
    peri, node = w0 + wr * t, n0 + nr * t
    M = math.radians((L - peri) % 360)
    E = M
    for _ in range(8):
        E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
    xp, yp = a * (math.cos(E) - e), a * math.sqrt(1 - e * e) * math.sin(E)
    w, O = math.radians(peri - node), math.radians(node)
    cw, sw, cO, sO, ci, si = math.cos(w), math.sin(w), math.cos(O), math.sin(O), math.cos(inc), math.sin(inc)
    return [(cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
            (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
            (sw * si) * xp + (cw * si) * yp]


def analytic_ephemeris(start: date, days: int = SPAN_DAYS) -> dict[str, list[list[float]]]:
    out: dict[str, list[list[float]]] = {b: [] for b in BODIES}
    for k in range(days // STEP_DAYS + 1):
        d = start + timedelta(days=k * STEP_DAYS)
        e = _kepler_pos("Earth", d)
        out["Earth"].append(e)
        out["Mars"].append(_kepler_pos("Mars", d))
        out["Venus"].append(_kepler_pos("Venus", d))
        ang = 2 * math.pi * ((d - date(2000, 1, 6)).days % 29.530589) / 29.530589  # synodic month
        out["Moon"].append([e[0] - 0.00257 * math.cos(ang + math.atan2(e[1], e[0])),
                            e[1] - 0.00257 * math.sin(ang + math.atan2(e[1], e[0])), e[2]])
    return out


# --------------------------------------------------------------------------
# DONKI space weather
# --------------------------------------------------------------------------
def summarize_space_weather(flr: list, cme: list, sep: list, gst: list) -> dict[str, Any]:
    classes = {"X": 0, "M": 0, "C": 0}
    strongest, strongest_val = None, -1.0
    recent = []
    for f in flr or []:
        c = (f.get("classType") or "").strip()
        if not c:
            continue
        letter = c[0].upper()
        if letter in classes:
            classes[letter] += 1
        try:
            val = {"X": 100, "M": 10, "C": 1, "B": 0.1, "A": 0.01}.get(letter, 0) * float(c[1:] or 1)
        except ValueError:
            val = 0
        if val > strongest_val:
            strongest, strongest_val = c, val
        recent.append(dict(time=f.get("peakTime") or f.get("beginTime"), cls=c))
    fast_cme = 0
    for c in cme or []:
        speeds = [a.get("speed") or 0 for a in (c.get("cmeAnalyses") or []) if a]
        if speeds and max(speeds) >= 1000:
            fast_cme += 1
    kp_max = 0.0
    for g in gst or []:
        for k in g.get("allKpIndex") or []:
            kp_max = max(kp_max, float(k.get("kpIndex") or 0))
    sep_n = len(sep or [])
    # 0 = dead quiet sun, ~1-3 typical, 10+ = very stormy month
    activity = (classes["X"] * 1.0 + classes["M"] * 0.1 + classes["C"] * 0.01
                + sep_n * 1.0 + fast_cme * 0.3 + max(0.0, kp_max - 4) * 0.2)
    level = "quiet" if activity < 1 else "moderate" if activity < 3 else "active" if activity < 8 else "severe"
    recent.sort(key=lambda r: r["time"] or "", reverse=True)
    return dict(flares=classes, strongest_flare=strongest, recent_flares=recent[:6], cme_count=len(cme or []),
                fast_cme_count=fast_cme, sep_events=sep_n, kp_max=kp_max,
                activity_index=round(activity, 2), level=level)


def fetch_space_weather(today: date) -> dict[str, Any]:
    key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    p = dict(startDate=(today - timedelta(days=30)).isoformat(), endDate=today.isoformat(), api_key=key)
    with ThreadPoolExecutor(4) as ex:
        futs = {k: ex.submit(_get_json, DONKI_URL + k, p) for k in ("FLR", "CME", "SEP", "GST")}
        res = {k: (f.result() or []) for k, f in futs.items()}
    return summarize_space_weather(res["FLR"], res["CME"], res["SEP"], res["GST"])


ASSUMED_WEATHER = dict(flares={"X": 0, "M": 5, "C": 40}, strongest_flare=None, recent_flares=[],
                       cme_count=20, fast_cme_count=1, sep_events=0, kp_max=5.0,
                       activity_index=1.5, level="moderate")


# --------------------------------------------------------------------------
# Cache + refresh
# --------------------------------------------------------------------------
def _fetch_all() -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    ephem_src, ephem_err = "JPL Horizons (live)", None
    try:
        with ThreadPoolExecutor(len(BODIES)) as ex:
            futs = {b: ex.submit(fetch_horizons, bid, today) for b, bid in BODIES.items()}
            bodies = {b: f.result() for b, f in futs.items()}
        n = min(len(v) for v in bodies.values())
        bodies = {b: v[:n] for b, v in bodies.items()}
    except Exception as e:  # network down, API change, rate limit...
        bodies, ephem_src, ephem_err = analytic_ephemeris(today), "JPL Keplerian elements (offline fallback)", str(e)
    wx_src, wx_err = "NASA DONKI (live)", None
    try:
        weather = fetch_space_weather(today)
    except Exception as e:
        weather, wx_src, wx_err = dict(ASSUMED_WEATHER), "assumed moderate (DONKI unreachable)", str(e)
    return dict(fetched_at=time.time(), date=today.isoformat(), step_days=STEP_DAYS,
                ephemeris=dict(source=ephem_src, error=ephem_err, bodies=bodies),
                space_weather=dict(weather, source=wx_src, error=wx_err))


def _load_file() -> dict[str, Any] | None:
    try:
        return json.loads(CACHE_FILE.read_text())
    except Exception:
        return None


def _store(data: dict[str, Any]) -> None:
    global _cache
    _cache = data
    try:
        CACHE_FILE.write_text(json.dumps(data))
    except Exception:
        pass


def _fresh(d: dict[str, Any] | None) -> bool:
    return bool(d) and time.time() - d.get("fetched_at", 0) < TTL_S \
        and d.get("date") == datetime.now(timezone.utc).date().isoformat()


def refresh() -> dict[str, Any]:
    data = _fetch_all()
    old = _cache or _load_file()
    # never replace live data with a fallback just because NASA blipped
    if old and old.get("date") == data["date"]:
        if data["ephemeris"]["error"] and not old["ephemeris"].get("error"):
            data["ephemeris"] = old["ephemeris"]
        if data["space_weather"]["error"] and not old["space_weather"].get("error"):
            data["space_weather"] = old["space_weather"]
    # offline on demo day? use the last saved live snapshot instead of the analytic fallback
    if data["ephemeris"]["error"]:
        try:
            bak = json.loads(BACKUP_FILE.read_text())
            if not bak["ephemeris"].get("error"):
                data["date"] = bak["date"]
                data["step_days"] = bak.get("step_days", STEP_DAYS)
                data["ephemeris"] = dict(bak["ephemeris"], source=f"JPL Horizons (saved snapshot {bak['date']})")
                if data["space_weather"]["error"] and not bak["space_weather"].get("error"):
                    data["space_weather"] = dict(bak["space_weather"],
                                                 source=f"NASA DONKI (saved snapshot {bak['date']})")
        except Exception:
            pass
    with _lock:
        _store(data)
    return data


def _bg_refresh() -> None:
    global _refreshing
    try:
        refresh()
    finally:
        _refreshing = False


def get_conditions(block: bool = False) -> dict[str, Any]:
    """Cached live conditions. block=False never waits on the network (safe inside websocket handlers)."""
    global _cache, _refreshing
    with _lock:
        if _cache is None:
            _cache = _load_file()
        cur = _cache
    if _fresh(cur):
        return cur
    if block:
        return refresh()
    if not _refreshing:
        _refreshing = True
        threading.Thread(target=_bg_refresh, daemon=True).start()
    if cur:
        return cur
    today = datetime.now(timezone.utc).date()
    return dict(fetched_at=0, date=today.isoformat(), step_days=STEP_DAYS,
                ephemeris=dict(source="JPL Keplerian elements (loading live data...)", error=None,
                               bodies=analytic_ephemeris(today)),
                space_weather=dict(ASSUMED_WEATHER, source="assumed (loading live data...)", error=None))


# --------------------------------------------------------------------------
# Turn raw conditions into the mission environment the simulator uses
# --------------------------------------------------------------------------
def _norm(v):
    return math.sqrt(sum(x * x for x in v))


def _wrap(deg: float) -> float:
    return (deg + 180) % 360 - 180


def mission_env(mission: dict[str, Any], cond: dict[str, Any]) -> dict[str, Any]:
    dest = mission["destination"]
    D = DEST[dest]
    bodies = cond["ephemeris"]["bodies"]
    step = cond.get("step_days", STEP_DAYS)
    n = len(bodies["Earth"])
    start = date.fromisoformat(cond["date"])

    def pos(body: str, day: float) -> list[float]:
        k = max(0.0, min(n - 1.0, day / step))
        i = int(k)
        j = min(n - 1, i + 1)
        f = k - i
        a, b = bodies[body][i], bodies[body][j]
        return [a[x] + (b[x] - a[x]) * f for x in range(3)]

    target = dest  # Mars / Venus / Moon
    E0, T0 = pos("Earth", 0), pos(target, 0)
    env: dict[str, Any] = dict(source=cond["ephemeris"]["source"], date=cond["date"])

    if dest == "Moon":
        c3, c3_min, cruise = D["c3_min"], D["c3_min"], D["cruise_d"]
        env.update(phase_deg=None, optimal_phase_deg=None, window_days_off=0, next_window_days=0,
                   window="Every day (lunar transfer)")
    else:
        r1, r2 = _norm(E0), D["a_au"]
        c3_min, t_transfer = hohmann(r1, r2)
        lonE, lonT = math.degrees(math.atan2(E0[1], E0[0])), math.degrees(math.atan2(T0[1], T0[0]))
        phase = _wrap(lonT - lonE)
        n_t = 360 / D["period_d"]
        optimal = _wrap(180 - n_t * t_transfer)
        rate = 360 / YEAR_D - n_t                      # deg/day the phase angle shrinks
        synodic = abs(360 / rate)
        days_to = _wrap(phase - optimal) / rate        # >0: window ahead, <0: window passed
        off = abs(days_to)
        next_w = days_to if days_to >= -10 else days_to + synodic
        c3 = c3_min * min(2.5, 1 + (off / 45) ** 2)    # porkchop-plot shaped penalty, capped
        cruise = t_transfer * (1 + 0.15 * min(1.0, off / 90))
        env.update(phase_deg=round(phase, 1), optimal_phase_deg=round(optimal, 1),
                   window_days_off=round(off), next_window_days=round(max(0, next_w)),
                   window="Open" if off <= 20 else "Marginal" if off <= 60 else "Closed (off-optimal trajectory)")

    arrive = round(cruise)
    days = int(mission["days"])
    solar, link, blackout, seps = [], [], [], []
    for d in range(days):
        T, E = pos(target, arrive + d), pos("Earth", arrive + d)
        r = _norm(T)
        to_t = [T[i] - E[i] for i in range(3)]
        dist = max(_norm(to_t), 1e-4)
        to_sun = [-E[i] for i in range(3)]
        cosang = sum(to_t[i] * to_sun[i] for i in range(3)) / (dist * _norm(to_sun))
        sep = math.degrees(math.acos(max(-1.0, min(1.0, cosang))))
        dark = dest != "Moon" and sep < 2.0
        lf = min(1.0 / max(dist, 0.01) ** 2, 25.0)
        if dest != "Moon" and sep < 5.0:
            lf *= 0.5                                  # solar plasma scintillation
        solar.append(round(1.0 / r ** 2, 4))
        link.append(0.0 if dark else round(lf, 4))
        blackout.append(dark)
        seps.append(sep)

    E_arr, T_arr = pos("Earth", arrive), pos(target, arrive)
    cruise_sun = [1.0 / _norm(E0) ** 2, 1.0 / _norm(T_arr) ** 2]   # transfer runs between the two
    arr_dist = _norm([T_arr[i] - E_arr[i] for i in range(3)])
    wx = cond["space_weather"]
    env.update(
        c3=round(c3, 2), c3_min=round(c3_min, 2), cruise_days=round(cruise, 1),
        launch_date=start.isoformat(), arrival_date=(start + timedelta(days=arrive)).isoformat(),
        sun_au=round(sum(1 / math.sqrt(s) for s in solar) / days, 3),
        comm_au=round(arr_dist, 4), light_time_min=round(arr_dist * LIGHT_S_PER_AU / 60, 2),
        min_sep_deg=round(min(seps), 1), blackout_days=sum(blackout),
        cruise_sun_min=round(min(cruise_sun), 4),
        solar_factor=solar, link_factor=link,
        activity_index=wx["activity_index"], space_weather_level=wx["level"],
        space_weather_source=wx["source"], sep_events=wx["sep_events"],
    )
    return env


def planet_snapshot(cond: dict[str, Any]) -> dict[str, Any]:
    """Today's real geometry for each body: distance from the Sun and from Earth."""
    b = cond["ephemeris"]["bodies"]
    E = b["Earth"][0]
    out = {}
    for name in ("Mars", "Venus", "Moon"):
        T = b[name][0]
        r = _norm(T)
        d = _norm([T[i] - E[i] for i in range(3)])
        out[name] = dict(sun_au=round(r, 4), earth_au=round(d, 5),
                         earth_km=round(d * 149597870.7), light_time_min=round(d * LIGHT_S_PER_AU / 60, 2),
                         irradiance_w_m2=round(1361 / r ** 2), solar_factor=round(1 / r ** 2, 4))
    out["Earth"] = dict(sun_au=round(_norm(E), 4), irradiance_w_m2=round(1361 / _norm(E) ** 2))
    return out


def public_summary(cond: dict[str, Any]) -> dict[str, Any]:
    """What the UI shows in the 'Live from NASA' panel (no big arrays)."""
    wx = {k: v for k, v in cond["space_weather"].items() if k != "error"}
    return dict(date=cond["date"], fetched_at=cond.get("fetched_at", 0),
                ephemeris_source=cond["ephemeris"]["source"],
                live=not cond["ephemeris"].get("error") and "live" in cond["ephemeris"]["source"],
                space_weather=wx, planets=planet_snapshot(cond))


def env_summary(env: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in env.items() if k not in ("solar_factor", "link_factor")}


# --------------------------------------------------------------------------
# Surface conditions at real landing sites (for Rover Expedition)
# --------------------------------------------------------------------------
SITES = {
    "Mars": dict(name="Jezero Crater (Perseverance)", lat=18.38, lon_e=77.58),
    "Moon": dict(name="Taurus-Littrow (Apollo 17)", lat=20.19, lon_e=30.77),
    "Venus": dict(name="Venera 13 landing site", lat=-7.55, lon_e=303.69),
}
MARS_SOL_S = 88775.244
LUNAR_DAY_S = 29.530589 * 86400


def mars_solar_time(lat: float, lon_e: float, unix: float) -> dict[str, Any]:
    """NASA GISS Mars24 algorithm (Allison & McEwen 2000): local true solar time + Sun elevation."""
    jd_tt = unix / 86400 + 2440587.5 + 69.184 / 86400          # TT = UTC + 37 s + 32.184 s
    dt = jd_tt - 2451545.0
    M = math.radians(19.3871 + 0.52402073 * dt)
    alpha = 270.3871 + 0.524038496 * dt
    nu_m = ((10.691 + 3.0e-7 * dt) * math.sin(M) + 0.623 * math.sin(2 * M) + 0.050 * math.sin(3 * M)
            + 0.005 * math.sin(4 * M) + 0.0005 * math.sin(5 * M))
    ls = (alpha + nu_m) % 360
    L = math.radians(ls)
    eot = 2.861 * math.sin(2 * L) - 0.071 * math.sin(4 * L) + 0.002 * math.sin(6 * L) - nu_m
    msd = (jd_tt - 2405522.0028779) / 1.0274912517
    mtc = (24 * msd) % 24
    ltst = (mtc + lon_e / 15 + eot / 15) % 24
    dec = math.degrees(math.asin(0.42565 * math.sin(L))) + 0.25 * math.sin(L)
    H = math.radians((ltst - 12) * 15)
    la, de = math.radians(lat), math.radians(dec)
    el = math.degrees(math.asin(math.sin(la) * math.sin(de) + math.cos(la) * math.cos(de) * math.cos(H)))
    season = ["northern spring", "northern summer", "northern autumn", "northern winter"][int(ls // 90)]
    return dict(ltst_h=round(ltst, 3), sun_el_deg=round(el, 1), solar_dec_deg=round(dec, 2), ls_deg=round(ls, 1),
                season=season, dust_season=180 <= ls < 360, mars_sol_date=round(msd, 3), day_s=MARS_SOL_S)


def moon_solar_time(cond: dict[str, Any], lat: float, lon_e: float, unix: float) -> dict[str, Any]:
    """Sun elevation on the Moon from the Earth/Moon ephemeris (sub-solar longitude = 180 deg - elongation)."""
    b = cond["ephemeris"]["bodies"]
    day = (unix - datetime.fromisoformat(cond["date"]).replace(tzinfo=timezone.utc).timestamp()) / 86400
    step = cond.get("step_days", STEP_DAYS)
    k = max(0.0, min(len(b["Earth"]) - 1.001, day / step))
    i, f = int(k), k - int(k)
    E = [b["Earth"][i][x] + (b["Earth"][i + 1][x] - b["Earth"][i][x]) * f for x in range(3)]
    Mo = [b["Moon"][i][x] + (b["Moon"][i + 1][x] - b["Moon"][i][x]) * f for x in range(3)]
    lon_sun = math.degrees(math.atan2(-E[1], -E[0]))
    lon_moon = math.degrees(math.atan2(Mo[1] - E[1], Mo[0] - E[0]))
    elong = (lon_moon - lon_sun) % 360                         # 0 new, 90 first quarter, 180 full
    sub_solar = _wrap(180 - elong)
    H = _wrap(lon_e - sub_solar)
    el = math.degrees(math.asin(math.cos(math.radians(lat)) * math.cos(math.radians(H))))
    phase = ("new moon" if elong < 22.5 or elong >= 337.5 else "waxing crescent" if elong < 67.5 else
             "first quarter" if elong < 112.5 else "waxing gibbous" if elong < 157.5 else
             "full moon" if elong < 202.5 else "waning gibbous" if elong < 247.5 else
             "last quarter" if elong < 292.5 else "waning crescent")
    return dict(ltst_h=round((12 + H / 15) % 24, 3), sun_el_deg=round(el, 1), solar_dec_deg=0.0,
                elongation_deg=round(elong, 1), phase=phase, day_s=LUNAR_DAY_S)


def surface_sites(cond: dict[str, Any], unix: float | None = None) -> dict[str, Any]:
    unix = time.time() if unix is None else unix
    out = {}
    for planet, site in SITES.items():
        info = dict(site, computed_at=unix)
        if planet == "Mars":
            info.update(mars_solar_time(site["lat"], site["lon_e"], unix), source="Mars24 algorithm (NASA GISS)")
            # where Earth sits in the Martian sky relative to the Sun (for direct-to-Earth radio)
            Mp, E = cond["ephemeris"]["bodies"]["Mars"][0], cond["ephemeris"]["bodies"]["Earth"][0]
            lam_sun = math.degrees(math.atan2(-Mp[1], -Mp[0]))
            lam_earth = math.degrees(math.atan2(E[1] - Mp[1], E[0] - Mp[0]))
            info["earth_offset_deg"] = round(_wrap(lam_earth - lam_sun), 2)
        elif planet == "Moon":
            info.update(moon_solar_time(cond, site["lat"], site["lon_e"], unix), source=cond["ephemeris"]["source"])
            # the near side always faces Earth: Earth hangs at a fixed elevation over the site
            info["earth_el_deg"] = round(math.degrees(math.asin(math.cos(math.radians(site["lat"]))
                                                                * math.cos(math.radians(site["lon_e"])))), 1)
        else:
            info.update(ltst_h=None, sun_el_deg=None, solar_dec_deg=None, day_s=116.75 * 86400, earth_el_deg=45.0,
                        source="Venus solar day is 117 Earth days; only diffuse cloud light reaches the ground")
        out[planet] = info
    return out
