"""Run with:  python manage.py test game   (the sim tests also run with plain `python -m unittest game.tests`)."""
import json
import unittest
from datetime import date

from . import nasa
from .catalog import COMPONENTS, MISSIONS
from .sim import analyze, default_env, escape_dv, hohmann, payload_to_c3, simulate

C = {c["slug"]: c for c in COMPONENTS}
M = {m["slug"]: m for m in MISSIONS}

GOOD_MARS = ["f9-expendable", "rollout-solar", "liion-900", "hires-camera", "ssr-256",
             "kaband-hga", "biprop", "mli", "radiators"]
HEAVY_MARS = ["f9-reusable", "legacy-rtg", "legacy-rtg", "liion-900", "hires-camera", "radar", "ssr-256",
              "kaband-hga", "biprop", "biprop", "active-cooling", "mli"]


def offline_conditions(day=date(2026, 11, 15)):
    return dict(date=day.isoformat(), step_days=nasa.STEP_DAYS,
                ephemeris=dict(source="test", bodies=nasa.analytic_ephemeris(day)),
                space_weather=dict(nasa.ASSUMED_WEATHER, source="test"))


class PhysicsTests(unittest.TestCase):
    def test_hohmann_mars(self):
        c3, t = hohmann(1.0, 1.5237)
        self.assertAlmostEqual(c3, 8.7, delta=0.3)       # textbook minimum C3 to Mars
        self.assertAlmostEqual(t, 259, delta=3)          # Hohmann transfer time

    def test_escape_dv_from_leo(self):
        self.assertAlmostEqual(escape_dv(0), 3220, delta=20)  # LEO -> escape

    def test_payload_drops_with_c3(self):
        lv = C["f9-expendable"]
        self.assertGreater(payload_to_c3(lv, -2), payload_to_c3(lv, 8.7))
        self.assertGreater(payload_to_c3(lv, 8.7), payload_to_c3(lv, 20))


class SimTests(unittest.TestCase):
    def build(self, slugs):
        return [C[s] for s in slugs]

    def test_good_build_has_no_warnings(self):
        s = analyze(self.build(GOOD_MARS), M["mars-crater"])
        self.assertEqual([w["message"] for w in s["warnings"] if w["level"] != "info"], [])
        self.assertLessEqual(s["cost"], s["budget"])

    def test_good_build_usually_succeeds(self):
        parts = self.build(GOOD_MARS)
        wins = sum(simulate(parts, M["mars-crater"], i)["success"] for i in range(200))
        self.assertGreater(wins, 120)

    def test_no_rocket_scrubs(self):
        r = simulate(self.build(GOOD_MARS[1:]), M["mars-crater"], 1)
        self.assertEqual(r["failed_phase"], "review")
        self.assertEqual(r["score"], 0)

    def test_heavier_power_cascades_into_mass(self):
        light = analyze(self.build(GOOD_MARS), M["mars-crater"])
        heavy = analyze(self.build([s if s != "rollout-solar" else "legacy-rtg" for s in GOOD_MARS]),
                        M["mars-crater"])
        self.assertGreater(heavy["wet_mass_kg"], light["wet_mass_kg"])
        self.assertGreater(heavy["structure_kg"], light["structure_kg"])   # structure carries the extra kg
        self.assertLess(heavy["delta_v"], light["delta_v"])

    def test_mass_budget_adds_up(self):
        s = analyze(self.build(GOOD_MARS), M["mars-crater"])
        self.assertAlmostEqual(sum(r["kg"] for r in s["mass_budget"]), s["wet_mass_kg"], delta=1)
        self.assertAlmostEqual(sum(r["pct"] for r in s["mass_budget"]), 100, delta=1)

    def test_too_heavy_for_small_rocket_scrubs(self):
        m = dict(M["mars-crater"], budget=5000)
        env = dict(default_env(m), c3=20.0)              # far from the launch window: much more energy needed
        r = simulate(self.build(HEAVY_MARS), m, 1, env)
        self.assertEqual(r["outcome"], "Too heavy for the rocket")

    def test_published_launch_performance(self):
        # SpaceX: Falcon 9 expendable ~4,020 kg and Falcon Heavy ~16,800 kg to Mars; F9 5.5 t to GTO (reusable)
        self.assertAlmostEqual(payload_to_c3(C["f9-expendable"], 8.7), 4020, delta=300)
        self.assertAlmostEqual(payload_to_c3(C["falcon-heavy"], 8.7), 16800, delta=800)

    def test_cost_model_adds_up(self):
        s = analyze(self.build(GOOD_MARS), M["mars-crater"])
        cb = s["cost_breakdown"]
        self.assertAlmostEqual(sum(r["musd"] for r in cb["rows"]), s["cost"], delta=0.5)
        self.assertAlmostEqual(cb["reserve"], 0.25 * cb["development"], delta=0.2)

    def test_rtg_needs_nuclear_launch_approval(self):
        solar = analyze(self.build(GOOD_MARS), M["mars-crater"])
        rtg = analyze(self.build([x if x != "rollout-solar" else "mmrtg" for x in GOOD_MARS]), M["mars-crater"])
        self.assertEqual(rtg["cost_breakdown"]["launch"] - solar["cost_breakdown"]["launch"], 50)

    def test_thermal_needs_blankets_and_radiators(self):
        bare = analyze(self.build([x for x in GOOD_MARS if x not in ("mli", "radiators")]), M["mars-crater"])
        self.assertGreater(bare["heater_w"], 200)                    # no MLI: heaters eat the power
        venus = [x for x in GOOD_MARS if x != "radiators"] + ["mmrtg"]
        hot = analyze(self.build(venus), M["venus-atmo"])
        self.assertLess(hot["thermal_margin"], 0)                     # sun + clouds + RTG heat = overheating

    def test_every_component_changes_the_engineering(self):
        """Adding any part must change at least one functional number, not just mass and cost."""
        functional = ["twr", "lv_capacity_kg", "avg_gen_w", "battery_wh", "science_per_day", "storage_gb",
                      "downlink_mbps", "delta_v", "thermal_margin", "heater_w", "ops_draw_w", "cruise_gen_w"]
        base_slugs = ["f9-expendable", "silicon-solar", "liion-300", "context-camera", "flash-32", "uhf-lga",
                      "hydrazine", "mli"]
        for c in COMPONENTS:
            slugs = [x for x in base_slugs if C[x]["category"] != c["category"] or c["category"] in
                     ("instrument", "power", "battery", "thermal", "comms", "storage")] + [c["slug"]]
            if c["category"] == "launch":
                slugs = [x for x in slugs if C[x]["category"] != "launch" or x == c["slug"]]
            before = analyze(self.build([x for x in slugs if x != c["slug"]] if c["category"] != "launch"
                                        else [x for x in base_slugs if x != "f9-expendable"]), M["mars-crater"])
            after = analyze(self.build(slugs), M["mars-crater"])
            changed = [k for k in functional if before[k] != after[k]]
            self.assertTrue(changed, f"{c['slug']} changes nothing functional")

    def test_same_seed_is_deterministic(self):
        parts = self.build(GOOD_MARS)
        self.assertEqual(simulate(parts, M["mars-crater"], "abc"), simulate(parts, M["mars-crater"], "abc"))


class ValidationTests(unittest.TestCase):
    def test_model_matches_published_numbers(self):
        from .validation import checks
        failed = [f"{c['name']}: model {c['model']} vs {c['published']} ({c['error_pct']}%)" for c in checks() if not c["passed"]]
        self.assertEqual(failed, [])


class BotTests(unittest.TestCase):
    def test_ai_rival_designs_a_flyable_probe_for_every_mission(self):
        import random
        from .bot import choose_pick
        lim = {"launch": 1, "power": 3, "battery": 3, "instrument": 4, "storage": 2, "comms": 2,
               "propulsion": 2, "thermal": 3}
        for m in MISSIONS:
            pool = [dict(c, id=i, left=c["stock"]) for i, c in enumerate(COMPONENTS)]
            mine = []
            while (c := choose_pick(mine, pool, m, None, lim, 14, random.Random(1))) is not None:
                c["left"] -= 1
                mine.append(c)
            s = analyze(mine, m)
            self.assertLessEqual(s["cost"], s["budget"])
            self.assertFalse([w for w in s["warnings"] if w["level"] == "fail"], m["slug"])
            wins = sum(simulate(mine, m, i)["success"] for i in range(60))
            self.assertGreater(wins, 30, m["slug"])


class NasaEnvTests(unittest.TestCase):
    def test_horizons_parser(self):
        txt = ("header\n$$SOE\n2461359.500000000, A.D. 2026-Nov-15 00:00:00.0000,  5.1E-01,  "
               "-8.6E-01,  4.0E-05,\n$$EOE\nfooter")
        self.assertEqual(nasa.parse_horizons_vectors(txt), [[0.51, -0.86, 4.0e-05]])

    def test_space_weather_summary(self):
        wx = nasa.summarize_space_weather(
            [{"classType": "X1.2", "peakTime": "2026-11-01T10:00Z"}, {"classType": "M3.1", "peakTime": "x"}],
            [{"cmeAnalyses": [{"speed": 1500}]}], [{}], [{"allKpIndex": [{"kpIndex": 7}]}])
        self.assertEqual(wx["flares"]["X"], 1)
        self.assertEqual(wx["strongest_flare"], "X1.2")
        self.assertEqual(wx["fast_cme_count"], 1)
        self.assertGreater(wx["activity_index"], 2)

    def test_env_from_ephemeris_runs_every_mission(self):
        cond = offline_conditions()
        for m in M.values():
            env = nasa.mission_env(m, cond)
            json.dumps(env)  # must be storable in the match state
            self.assertEqual(len(env["solar_factor"]), m["days"])
            self.assertGreater(env["c3"], -3)
            r = simulate(self.build(GOOD_MARS), m, "seed", env)
            self.assertIn("outcome", r)

    def test_mars_window_late_2026_is_open(self):
        env = nasa.mission_env(M["mars-crater"], offline_conditions(date(2026, 11, 15)))
        self.assertLess(env["window_days_off"], 40)
        closed = nasa.mission_env(M["mars-crater"], offline_conditions(date(2027, 11, 15)))
        self.assertGreater(closed["c3"], env["c3"])

    def build(self, slugs):
        return [C[s] for s in slugs]

    def test_mars24_perseverance_landing(self):
        # Perseverance touched down 2021-02-18 20:55 UTC at ~3:25 pm local true solar time, Ls ~5 deg
        from datetime import datetime, timezone
        t = datetime(2021, 2, 18, 20, 55, tzinfo=timezone.utc).timestamp()
        m = nasa.mars_solar_time(18.4447, 77.4508, t)
        self.assertAlmostEqual(m["ltst_h"], 15.4, delta=0.3)
        self.assertAlmostEqual(m["ls_deg"], 5.2, delta=1.0)
        self.assertGreater(m["sun_el_deg"], 0)

    def test_surface_sites(self):
        sites = nasa.surface_sites(offline_conditions())
        self.assertEqual(set(sites), {"Mars", "Moon", "Venus"})
        self.assertTrue(-90 <= sites["Moon"]["sun_el_deg"] <= 90)


if __name__ == "__main__":
    unittest.main()
