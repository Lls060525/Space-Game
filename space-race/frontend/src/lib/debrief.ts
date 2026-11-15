import type { SimResult } from "./types";

export interface Lesson { tone: "bad" | "warn" | "good"; title: string; why: string; fix: string; equation?: string }

const G0 = 9.80665;

/** Turn a mission result into "what went wrong, which equation, how to fix it". */
export function debrief(r: SimResult): Lesson[] {
  const s = r.stats;
  const ab = r.as_built ?? {};
  const out: Lesson[] = [];
  const last = r.timeline.filter((e) => e.status === "fail").pop()?.message ?? "";

  switch (r.failed_phase) {
    case "review":
      if (r.outcome.includes("heavy")) out.push({
        tone: "bad", title: "Too heavy for the rocket", equation: "Launch mass margin",
        why: `As built, the probe weighed ${ab.dry_mass_kg?.toFixed(0)} kg dry (+${ab.growth_kg?.toFixed(0)} kg growth over the estimate). The rocket can send only ${s.lv_capacity_kg.toFixed(0)} kg to C3 ${s.c3.toFixed(1)}.`,
        fix: "Keep ≥15% launch margin on top of the growth allowance (NASA practice), pick a bigger rocket, or cut heavy parts.",
      });
      else if (r.outcome.includes("cost")) out.push({
        tone: "bad", title: "Cancelled for cost overrun", equation: "Total mission cost",
        why: `Development cost grew ${((ab.cost_growth ?? 0) * 100).toFixed(0)}%, more than the 25% reserve, so the final cost was $${ab.actual_cost?.toFixed(0)}M against a $${s.budget}M cap.`,
        fix: "Leave 10-20% of the cap unspent. Real missions grow ~12% on average; overruns beyond reserves trigger termination reviews.",
      });
      else out.push({ tone: "bad", title: r.outcome, why: last, fix: "Check the red items on the drafting board." });
      break;
    case "launch":
      out.push(s.twr < 1.2 ? {
        tone: "bad", title: "Weak lift-off", equation: "Lift-off thrust-to-weight",
        why: `TWR ${s.twr.toFixed(2)}: below 1.2, gravity losses eat the climb.`, fix: "Use a stronger rocket or a lighter probe.",
      } : {
        tone: "warn", title: "Rocket failure (bad luck)", equation: "Lift-off thrust-to-weight",
        why: `Launchers are not 100% reliable; yours had ~${((r.probabilities.launch ?? 0) * 100).toFixed(0)}% success odds.`,
        fix: "Highly flown rockets (Falcon 9: >99% success) cut this risk. Both players rolled the same dice.",
      });
      break;
    case "cruise":
      if (last.includes("overheat")) out.push({ tone: "bad", title: "Overheated in cruise", equation: "Hot case heat balance",
        why: `Heat in ${s.thermal.hot_load_w} W vs ${s.thermal.reject_w} W radiated.`, fix: "Add radiators or the active cooling loop; MLI reduces absorbed sunlight." });
      else if (last.includes("brownout")) out.push({ tone: "bad", title: "Power brownout in cruise", equation: "Orbit-average power balance",
        why: `Cruise needs ${s.cruise_draw_w.toFixed(0)} W but the worst point gives ${s.cruise_gen_w.toFixed(0)} W.`, fix: "Bigger arrays, or an RTG for missions far from the Sun." });
      else if (last.includes("radiation")) out.push({ tone: "warn", title: "Radiation upset", equation: "Radiation survival in cruise",
        why: `Real space weather from NASA DONKI made cruise ${((1 - s.radiation_survival) * 100).toFixed(0)}% risky.`, fix: "Shorter cruises and a quiet Sun help. Mostly bad luck." });
      else if (last.includes("antenna")) out.push({ tone: "bad", title: "Lost contact", equation: "Inverse-square link budget",
        why: "Every antenna failed.", fix: "Carry a cheap backup antenna (UHF): redundancy saves missions." });
      else out.push({ tone: "warn", title: "Component failure in cruise", why: last, fix: "Higher-reliability parts and backups reduce this." });
      break;
    case "insertion": {
      const need = ab.dv_needed ?? s.dv_required;
      const x = (need * 1.1) / (Math.max(1, s.isp_s) * G0);
      const prop = s.isp_s ? (s.dry_mass_kg * (Math.exp(x) - 1)) / (1 - 0.03 * Math.exp(x)) : 0;
      out.push({
        tone: "bad", title: "Missed orbit: not enough Δv", equation: "Tsiolkovsky rocket equation (your spacecraft)",
        why: `Had ${ab.delta_v ?? s.delta_v.toFixed(0)} m/s, needed ${need.toFixed?.(0) ?? need} m/s.${ab.offloaded_kg ? ` ${ab.offloaded_kg.toFixed(0)} kg of propellant was off-loaded to fit the rocket.` : ""}`,
        fix: s.isp_s ? `Δv = Isp·g₀·ln(m_wet/m_dry): with Isp ${s.isp_s.toFixed(0)} s you needed ≈ ${prop.toFixed(0)} kg of propellant, or a higher-Isp engine.` : "Add an engine!",
      });
      break;
    }
    case "operations":
      if (last.includes("Battery") || last.includes("eclipse")) out.push({ tone: "bad", title: "Battery died in eclipse", equation: "Depth of discharge & cycle life",
        why: `Depth of discharge ${(s.battery_dod * 100).toFixed(0)}%: the cells wore out after thousands of eclipses.`, fix: `Aim for ≤40% DoD: about ${(s.eclipse_need_wh / 0.4).toFixed(0)} Wh of battery.` });
      else if (last.includes("power")) out.push({ tone: "bad", title: "Ran out of power", equation: "Orbit-average power balance",
        why: `${s.avg_gen_w.toFixed(0)} W generated vs ${s.ops_draw_w.toFixed(0)} W drawn.`, fix: "More array area, fewer power-hungry parts, or MLI to stop heaters eating power." });
      else if (last.includes("Thermal")) out.push({ tone: "bad", title: "Thermal runaway", equation: "Hot case heat balance",
        why: `Hot case margin ${(s.thermal_margin * 100).toFixed(0)}%.`, fix: "Add heat rejection (radiators / cooling loop)." });
      else out.push({ tone: "warn", title: "Component failure", why: last, fix: "Reliability compounds: 10 parts at 98% = 82%. Fewer, better parts help." });
      break;
  }
  if (!r.failed_phase && !r.success) out.push({
    tone: "warn", title: "Survived, but not enough science", equation: "Science return",
    why: `${r.science.toFixed(0)} of ${s.science_target} science. Downlink ${s.downlink_gb_day.toFixed(2)} GB/day vs ${s.data_gb_day.toFixed(1)} GB/day produced.`,
    fix: "Match instruments to the objective, and size the antenna and storage to the data they make.",
  });
  if (r.success) out.push({
    tone: "good", title: "Mission accomplished",
    why: `${(r.science_pct * 100).toFixed(0)}% of the science target, $${(ab.actual_cost ?? s.cost).toFixed(0)}M spent.`,
    fix: s.max_science / s.science_target > 1.5 ? "Score caps at 150% science: spend less next time for a bigger budget bonus." : "Try a cheaper rocket or lighter parts to bank more budget points.",
  });
  // add the top remaining design warnings as secondary lessons
  for (const w of s.warnings.filter((w) => w.level !== "info").slice(0, 2)) {
    if (!out.some((o) => w.message.startsWith(o.why.slice(0, 20)))) out.push({ tone: w.level === "fail" ? "bad" : "warn", title: "Design note", why: w.message, fix: "" });
  }
  return out;
}
