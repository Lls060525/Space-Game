import { useState } from "react";
import type { Mission, Stats } from "../lib/types";

interface Step { id: string; label: string; done: (s: Stats) => boolean; hint: (s: Stats, m: Mission) => string; eq: string }

const has = (s: Stats, code: string) => s.warnings.some((w) => w.code === code && w.level === "fail");

const STEPS: Step[] = [
  { id: "rocket", label: "Rocket", eq: "Launch", done: (s) => !has(s, "launch"),
    hint: (s, m) => `Pick a launch vehicle. Check the rocket table: which ones can reach ${m.destination} today at C3 ${s.c3.toFixed(1)} km²/s²?` },
  { id: "power", label: "Power", eq: "Power", done: (s) => !has(s, "power") && s.power_margin >= 0,
    hint: (s, m) => `Add power. Sunlight at ${m.destination} is ${Math.round(1361 / s.env.sun_au ** 2)} W/m², and you need more than ${s.ops_draw_w.toFixed(0)} W on average, eclipses included.` },
  { id: "comms", label: "Antenna", eq: "Comms", done: (s) => !has(s, "comms"),
    hint: () => "Add an antenna. Without one you never hear from the probe. A cheap UHF backup is great insurance." },
  { id: "science", label: "Instrument", eq: "Science", done: (s) => !has(s, "instrument") && !has(s, "objective"),
    hint: (_s, m) => `Add an instrument that can do the objective (needs: ${m.required_tags.join(" or ")}).` },
  { id: "engine", label: "Engine", eq: "Propulsion", done: (s) => s.dv_margin >= 0,
    hint: (s) => `Add an engine. You need ${s.dv_required} m/s to brake into orbit; you have ${s.delta_v.toFixed(0)} m/s. Open the Tsiolkovsky card.` },
  { id: "thermal", label: "Thermal", eq: "Thermal", done: (s) => s.thermal_margin >= 0 && s.heater_w <= 40,
    hint: (s) => s.thermal_margin < 0 ? `Overheating: ${s.thermal.hot_load_w} W in, ${s.thermal.reject_w} W out. Add a radiator.`
      : `Heaters are eating ${s.heater_w} W. MLI blankets keep the heat in.` },
  { id: "battery", label: "Battery", eq: "Battery", done: (s) => s.eclipse_need_wh === 0 || s.battery_margin >= 0,
    hint: (s) => `Eclipses need ${s.eclipse_need_wh.toFixed(0)} Wh. Size the battery for ≤40% depth of discharge (~${(s.eclipse_need_wh / 0.4).toFixed(0)} Wh).` },
  { id: "margin", label: "Margins", eq: "Launch", done: (s) => s.system_margin >= 0.15 && s.budget_left >= 0,
    hint: (s) => s.budget_left < 0 ? `Over the cost cap by $${(-s.budget_left).toFixed(0)}M.`
      : `Launch mass margin is ${(s.system_margin * 100).toFixed(0)}%. NASA keeps ≥15% in case the probe grows.` },
];

/** Guided first mission: one step at a time, each linked to the equation that explains it. */
export function Coach({ stats, mission }: { stats: Stats | null; mission: Mission }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem("spacerace.coach.off") === "1");
  if (!stats || hidden) return hidden ? <div className="center"><button className="link small" onClick={() => { localStorage.removeItem("spacerace.coach.off"); setHidden(false); }}>Show mission coach</button></div> : null;
  const current = STEPS.find((st) => !st.done(stats));
  return (
    <div className="coach">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>🧑‍🏫 Mission coach {current ? `- step ${STEPS.indexOf(current) + 1} of ${STEPS.length}` : "- ready!"}</b>
        <button className="link small" onClick={() => { localStorage.setItem("spacerace.coach.off", "1"); setHidden(true); }}>hide</button>
      </div>
      <div className="coach-steps">
        {STEPS.map((st) => <span key={st.id} className={st === current ? "now" : st.done(stats) ? "done" : ""}>{st.done(stats) ? "✓ " : ""}{st.label}</span>)}
      </div>
      <div>{current ? <>{current.hint(stats, mission)} <span className="muted small">(📐 {current.eq} equations)</span></>
        : "Every system is green. Hit TEST LAUNCH, and if something breaks, the debrief explains why."}</div>
    </div>
  );
}
