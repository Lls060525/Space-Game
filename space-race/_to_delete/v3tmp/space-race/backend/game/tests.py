"""Run with:  python manage.py test game   (the sim tests also run with plain `python -m unittest`)."""
import unittest

from .catalog import COMPONENTS, MISSIONS
from .sim import analyze, simulate

C = {c["slug"]: c for c in COMPONENTS}
M = {m["slug"]: m for m in MISSIONS}

GOOD_MARS = ["phoenix-reusable", "rollout-solar", "liion-900", "hires-camera", "ssr-256",
             "kaband-hga", "biprop", "mli"]


class SimTests(unittest.TestCase):
    def build(self, slugs):
        return [C[s] for s in slugs]

    def test_good_build_has_no_warnings(self):
        s = analyze(self.build(GOOD_MARS), M["mars-crater"])
        self.assertEqual(s["warnings"], [])
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
        self.assertLess(heavy["delta_v"], light["delta_v"])

    def test_same_seed_is_deterministic(self):
        parts = self.build(GOOD_MARS)
        self.assertEqual(simulate(parts, M["mars-crater"], "abc"), simulate(parts, M["mars-crater"], "abc"))


if __name__ == "__main__":
    unittest.main()
