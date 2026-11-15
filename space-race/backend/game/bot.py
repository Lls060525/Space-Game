"""
AI rival ("HAL-9000"): a greedy mission designer.

For every part still in the shared pool it asks the same simulator the players use
(sim.analyze) how good the build would be with that part added, and takes the best one.
It respects budget, category limits and stock, and slightly prefers the LAST copy of a
part that also suits you - so it can steal. Pure Python, unit-testable.
"""
from __future__ import annotations

import random
from typing import Any

from .sim import analyze

BOT_USERNAME = "HAL-9000 (AI)"


def build_score(s: dict[str, Any]) -> float:
    fails = sum(1 for w in s["warnings"] if w["level"] == "fail")
    warns = sum(1 for w in s["warnings"] if w["level"] == "warn")
    sci = min(s["max_science"] / s["science_target"], 1.5) if s["science_target"] else 0
    margins = (min(s["dv_margin"], 0.3) + min(s["power_margin"], 0.4) + min(s["system_margin"], 0.4)
               + min(s["thermal_margin"], 0.4))
    duty_penalty = 80 * (1 - s["instrument_duty"]) if s["max_science"] > 0 else 0
    return (-100 * fails - 9 * warns + 60 * sci + 25 * margins + 0.04 * s["budget_left"]
            - 0.03 * s["heater_w"] - duty_penalty - 40 * max(0.0, -s["battery_margin"]))


def choose_pick(my_parts: list[dict], pool: list[dict], mission: dict, env: dict | None,
                limits: dict[str, int], max_parts: int, rng: random.Random | None = None) -> dict | None:
    """my_parts / pool are sim part dicts (pool items also carry 'id' and 'left')."""
    rng = rng or random.Random()
    if len(my_parts) >= max_parts:
        return None
    base = build_score(analyze(my_parts, mission, env))
    best, best_score = None, base + 0.5          # must actually improve the design
    counts: dict[str, int] = {}
    for p in my_parts:
        counts[p["category"]] = counts.get(p["category"], 0) + 1
    for c in pool:
        if c["left"] <= 0 or counts.get(c["category"], 0) >= limits.get(c["category"], 9):
            continue
        s = analyze(my_parts + [c], mission, env)
        if s["budget_left"] < 0:
            continue
        sc = build_score(s) + (1.5 if c["left"] == 1 else 0) + rng.uniform(0, 1.0)
        if sc > best_score:
            best, best_score = c, sc
    return best
