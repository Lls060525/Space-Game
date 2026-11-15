import { useState } from "react";
import type { Mission, Stats } from "../lib/types";

/**
 * Live "flight dynamics notebook": every equation the simulator uses, with YOUR numbers plugged in,
 * the result, the optimum range real mission designers aim for, a real-world reference, and a fix.
 */
type Tone = "good" | "warn" | "bad" | "info";
interface Eq {
  group: string; title: string; formula: string; plug: string; result: string;
  tone: Tone; optimum: string; real: string; fix?: string;
}

const f0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString() : "∞");
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "∞");
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "∞");
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const band = (x: number, lo: number, hi: number, badLo = -Infinity, badHi = Infinity): Tone =>
  x >= lo && x <= hi ? "good" : x < badLo || x > badHi ? "bad" : "warn";

function equations(s: Stats, m: Mission): Eq[] {
  const e = s.eq;
  const env = s.env;
  const g0 = e.g0;
  const hasLv = !!e.lv_name;
  const hasParts = s.cost_breakdown.hardware > 0;
  const out: Eq[] = [];

  // ---------------- LAUNCH ----------------
  if (hasLv) {
    const liftoff = e.rocket_mass_t * 1000 + s.launch_mass_kg;
    out.push({
      group: "Launch", title: "Lift-off thrust-to-weight",
      formula: "TWR = F / ((m_rocket + m_payload) · g₀)",
      plug: `${f0(e.thrust_kn * 1000)} N / ((${f0(e.rocket_mass_t * 1000)} + ${f0(s.launch_mass_kg)}) kg · ${g0} m/s²)`,
      result: `TWR = ${f2(s.twr)}  (lift-off weight ${f1((liftoff * g0) / 1e6)} MN)`,
      tone: band(s.twr, 1.2, 1.8, 1.0),
      optimum: "1.2 – 1.6. Below 1.0 the rocket cannot rise; below 1.2 gravity losses eat the climb.",
      real: "Saturn V lifted off at 1.16, Falcon 9 at ≈1.4, Atlas V 401 at ≈1.2.",
    });
  }
  out.push({
    group: "Launch", title: "Departure energy today (Hohmann + real geometry)",
    formula: "v∞ = v⊕·(√(2r₂/(r₁+r₂)) − 1),  C3 = v∞² × window penalty",
    plug: `minimum C3 ${f2(env.c3_min)} km²/s², ${env.window_days_off} days from the ideal window`,
    result: `C3 = ${f2(s.c3)} km²/s²  (${env.window})`,
    tone: env.window_days_off <= 20 ? "good" : env.window_days_off <= 60 ? "warn" : "bad",
    optimum: "Launch within ±20 days of the optimum phase angle. Off-window C3 can be 2-3× higher.",
    real: "Mars launch windows open every ~26 months (the Earth-Mars synodic period).",
  });
  out.push({
    group: "Launch", title: "Escape burn from parking orbit",
    formula: "Δv = √(C3 + 2μ/r) − √(μ/r)",
    plug: `√(${f2(s.c3)} + 2·${f0(e.mu_earth)}/${f1(e.r_leo_km)}) − √(${f0(e.mu_earth)}/${f1(e.r_leo_km)})  km/s`,
    result: `Δv = ${f0(s.escape_dv)} m/s from a 200 km orbit`,
    tone: "info", optimum: "Lower C3 = smaller burn = more payload.",
    real: "Escape from LEO is 3.2 km/s; reaching Mars adds ~0.4 km/s more.",
  });
  if (hasLv) {
    out.push({
      group: "Launch", title: "Upper-stage rocket equation: payload the rocket can send",
      formula: "m_pl = (m_LEO + m_stage) · e^(−Δv / (Isp·g₀)) − m_stage",
      plug: `(${f0(s.lv_leo_kg)} + ${f0(e.upper_dry_kg)}) · e^(−${f0(s.escape_dv)} / (${e.upper_isp_s}·${g0})) − ${f0(e.upper_dry_kg)}`,
      result: `${f0(s.lv_capacity_kg)} kg to C3 ${f1(s.c3)} on ${e.lv_name}`,
      tone: "info", optimum: "Hydrogen upper stages (Isp 450 s) lose far less payload at high C3 than kerosene ones (348 s).",
      real: "SpaceX publishes 4,020 kg to Mars for an expendable Falcon 9 and 16,800 kg for Falcon Heavy.",
    });
    out.push({
      group: "Launch", title: "Launch mass margin",
      formula: "margin = (capability − m_launch) / capability,   m_launch = m_wet + adapter",
      plug: `(${f0(s.lv_capacity_kg)} − (${f0(s.wet_mass_kg)} + ${s.adapter_kg})) / ${f0(s.lv_capacity_kg)}`,
      result: `margin = ${pct(s.system_margin)}`,
      tone: band(s.system_margin, 0.15, 0.4, 0, 0.7),
      optimum: "15 – 40 %. NASA wants ≥15 % at PDR on top of MGA. Above ~50 % you paid for a rocket that is too big.",
      real: "MRO (2,180 kg) flew on Atlas V 401 with ~25 % margin.",
      fix: s.system_margin < 0.15 && hasParts
        ? `Remove ${f0(s.launch_mass_kg - s.lv_capacity_kg * 0.85)} kg or pick a bigger rocket.`
        : s.system_margin > 0.5 ? "A smaller, cheaper rocket would do: check the rocket table." : undefined,
    });
  }

  // ---------------- MASS ----------------
  if (hasParts) {
    out.push({
      group: "Mass", title: "Dry mass closure (structure carries everything)",
      formula: "m_dry = (Σ parts + avionics) / (1 − f_struct − f_harness) + MGA",
      plug: `(${f1(e.parts_cbe_kg)} + ${e.fixed_kg}) / (1 − ${e.structure_frac} − ${e.harness_frac}) + ${f1(s.mga_kg)}`,
      result: `m_dry = ${f0(s.dry_mass_kg)} kg  (each 1 kg of parts costs ${f2(1 / (1 - e.structure_frac - e.harness_frac))} kg of spacecraft)`,
      tone: "info", optimum: "Light parts snowball: less structure, less propellant, smaller rocket, lower cost.",
      real: "Structure is typically 20-30 % of a planetary spacecraft's dry mass (SMAD).",
    });
    const pf = s.propellant_kg / s.wet_mass_kg;
    out.push({
      group: "Mass", title: "Propellant mass fraction",
      formula: "f_prop = m_prop / m_wet",
      plug: `${f0(s.propellant_kg)} / ${f0(s.wet_mass_kg)}`,
      result: `f_prop = ${pct(pf)}`,
      tone: s.low_thrust ? "info" : band(pf, 0.3, 0.65, 0.1, 0.75),
      optimum: "30 – 65 % for a chemical orbiter (ion engines: 5 – 15 %).",
      real: "MRO: 1,149 of 2,180 kg (53 %); MAVEN: 1,645 of 2,454 kg (67 %); LRO: 898 of 1,916 kg (47 %).",
    });
    out.push({
      group: "Mass", title: "Weight is not mass",
      formula: "W = m · g",
      plug: `${f0(s.wet_mass_kg)} kg × ${g0} m/s² (Earth) / × ${e.gravity_dest} m/s² (${m.destination})`,
      result: `${f1(s.weight_on_earth_n / 1000)} kN on the pad, ${f1(s.weight_at_destination_n / 1000)} kN at ${m.destination}`,
      tone: "info", optimum: "Mass never changes; weight depends on local gravity.",
      real: "Perseverance weighs 10 kN on Earth but only 3.8 kN on Mars.",
    });
  }

  // ---------------- PROPULSION ----------------
  if (hasParts) {
    out.push({
      group: "Propulsion", title: "Δv budget required",
      formula: "Δv_req = Δv_insertion · (C3/C3_min)^¼ · loss + Δv_TCM",
      plug: `${e.insertion_dv_base} · ${f2(e.c3_ratio)} · ${f2(e.loss_factor)} + ${e.tcm_dv}`,
      result: `Δv_req = ${f0(s.dv_required)} m/s`,
      tone: "info",
      optimum: s.low_thrust ? "Ion engines spiral in: ×1.35 the impulsive Δv." : "Chemical capture burns lose ~3 % to gravity.",
      real: "Mars orbit insertion: MRO ≈ 1.0 km/s (then aerobraking); MAVEN ≈ 1.2 km/s.",
    });
    const x = s.isp_s > 0 ? (s.dv_required * 1.1) / (s.isp_s * g0) : 0;
    const need = s.isp_s > 0 ? (s.dry_mass_kg * (Math.exp(x) - 1)) / (1 - e.prop_residual * Math.exp(x)) : NaN;
    out.push({
      group: "Propulsion", title: "Tsiolkovsky rocket equation (your spacecraft)",
      formula: "Δv = Isp · g₀ · ln(m_wet / (m_dry + residuals))",
      plug: s.isp_s ? `${f0(s.isp_s)} · ${g0} · ln(${f0(s.wet_mass_kg)} / (${f0(s.dry_mass_kg)} + ${f1(s.propellant_kg * e.prop_residual)}))` : "no engine",
      result: `Δv = ${f0(s.delta_v)} m/s → margin ${pct(s.dv_margin)}`,
      tone: band(s.dv_margin, 0.05, 0.25, -0.03, 0.6),
      optimum: "5 – 25 % above requirement. More than that is dead propellant mass you launched for nothing.",
      real: "Isp: hydrazine 220 s, biprop 320 s, xenon ion 3,000 s.",
      fix: Number.isFinite(need) && (s.dv_margin < 0.05 || s.dv_margin > 0.4)
        ? `For a 10 % margin you need ≈ ${f0(need)} kg propellant at Isp ${f0(s.isp_s)} s (you carry ${f0(s.propellant_kg)} kg).` : undefined,
    });
  }

  // ---------------- POWER ----------------
  if (hasParts) {
    out.push({
      group: "Power", title: "Solar array output at the target",
      formula: "P = P₁AU · (1/r²) · η_hot · (1 − degradation)",
      plug: `${f0(s.solar_bol_w)} W · ${f2(e.sun_avg)} · ${f2(e.hot_loss)} · ${f2(e.degradation)}`,
      result: `P_solar = ${f0(s.solar_w)} W  (Sun at ${f2(env.sun_au)} AU = ${f0(e.solar_constant * e.sun_avg)} W/m²)`,
      tone: "info", optimum: "Mars gets 43 % of Earth's sunlight; Venus 191 % (but cells run hot).",
      real: "Juno needs 60 m² of arrays to make ~500 W at Jupiter (5.2 AU).",
    });
    const fixW = (s.ops_draw_w * 1.15 - s.rtg_w) / Math.max(1e-6, e.sun_avg * e.hot_loss * e.degradation * (1 - e.eclipse_frac));
    out.push({
      group: "Power", title: "Orbit-average power balance",
      formula: "P_avg = P_solar · (1 − f_eclipse) + P_RTG  ≥  P_draw (incl. heaters)",
      plug: `${f0(s.solar_w)} · (1 − ${e.eclipse_frac}) + ${f0(s.rtg_w)}  vs  ${f0(s.ops_draw_w)} W`,
      result: `${f0(s.avg_gen_w)} / ${f0(s.ops_draw_w)} W → margin ${pct(s.power_margin)}`,
      tone: band(s.power_margin, 0.1, 0.4, -0.05, 1.5),
      optimum: "10 – 40 % margin at end of life. Below 0 the instruments get throttled.",
      real: "Perseverance's MMRTG makes 110 W but peak demand is ~900 W, so batteries buffer it.",
      fix: s.power_margin < 0.1 ? `Needs ≈ ${f0(fixW)} W of solar array (rated at 1 AU) for a 15 % margin.` : undefined,
    });
    if (s.rtg_w > 0) out.push({
      group: "Power", title: "RTG decay",
      formula: "P(t) = P₀ · (1 − k)^t",
      plug: `t = ${f2(e.years)} years after fuelling`,
      result: `P_RTG = ${f0(s.rtg_w)} W (end of mission)`,
      tone: "info", optimum: "Pu-238 half-life 87.7 years, but thermocouples degrade ~4-5 %/yr on MMRTG.",
      real: "Curiosity's MMRTG fell from 110 W (2011) to ~77 W (2024).",
    });
  }

  // ---------------- BATTERY ----------------
  if (s.eclipse_need_wh > 0) {
    out.push({
      group: "Battery", title: "Eclipse energy",
      formula: "E = (P_bus + P_instr·duty − P_RTG) · t_eclipse",
      plug: `(${f0(e.bus_draw_w)} + ${f0(e.instr_draw_w)}·${f2(s.instrument_duty)} − ${f0(s.rtg_w)}) W · ${f2(e.eclipse_hours)} h`,
      result: `E = ${f0(s.eclipse_need_wh)} Wh per orbit`,
      tone: "info", optimum: "Fewer watts in the shadow = smaller battery.", real: `${f0(s.battery_cycles)} eclipses in ${e.days} days.`,
    });
    out.push({
      group: "Battery", title: "Depth of discharge & cycle life",
      formula: "DoD = E / C,   N_life ≈ 50 000 · e^(−4.5·DoD)",
      plug: `${f0(s.eclipse_need_wh)} / ${f0(s.battery_wh)} Wh`,
      result: `DoD = ${pct(s.battery_dod)} → ~${f0(s.battery_cycle_life)} cycles (need ${f0(s.battery_cycles)})`,
      tone: s.battery_dod <= 0.4 ? "good" : s.battery_dod <= e.battery_dod_limit ? "warn" : "bad",
      optimum: "≤ 40 % DoD for missions with thousands of eclipses; 80 % is the hard limit.",
      real: "LEO satellites cycle ~5,500 times a year and are designed for 20-30 % DoD.",
      fix: s.battery_dod > 0.4 ? `≈ ${f0(s.eclipse_need_wh / 0.4)} Wh of battery would give 40 % DoD.` : undefined,
    });
  }

  // ---------------- COMMUNICATIONS ----------------
  if (hasParts && e.best_mbps > 0) {
    const needMbps = (s.data_gb_day * 1.2 * 8000) / (e.contact_hours * 3600 * Math.max(1e-6, e.link_avg));
    out.push({
      group: "Comms", title: "Inverse-square link budget",
      formula: "R = R₁AU / d²,   data/day = R · t_contact · 3600 / 8000  (GB)",
      plug: `${e.best_mbps} Mbps · ${e.link_avg.toFixed(3)} (avg 1/d²) · ${e.contact_hours} h DSN`,
      result: `${f2(s.downlink_gb_day)} GB/day vs ${f1(s.data_gb_day)} GB/day produced`,
      tone: s.data_gb_day ? band(s.downlink_gb_day / s.data_gb_day, 1.1, 3, 0.7) : "info",
      optimum: "Downlink ≥ 1.1-1.5 × what the instruments make, or storage overflows.",
      real: "MRO's Ka/X-band dish returns up to 6 Mbps from Mars; the UHF relay is ~2 Mbps to rovers.",
      fix: s.data_gb_day && s.downlink_gb_day < s.data_gb_day * 1.1 ? `Need an antenna rated ≈ ${f1(needMbps)} Mbps at 1 AU.` : undefined,
    });
    out.push({
      group: "Comms", title: "Light-time delay",
      formula: "t = d / c = d[AU] · 499 s",
      plug: `${env.comm_au.toFixed(3)} AU · 499 s`,
      result: env.light_time_min < 1 ? `${f1(env.light_time_min * 60)} s one way` : `${f1(env.light_time_min)} min one way`,
      tone: "info", optimum: "Why probes must be autonomous: no joystick control from Earth.",
      real: "Earth-Mars light time ranges from 3 to 22 minutes.",
    });
  }

  // ---------------- THERMAL ----------------
  if (hasParts) {
    const t = s.thermal;
    out.push({
      group: "Thermal", title: "Hot case heat balance",
      formula: "Q_in = A·α·(S/r² + q_planet) + 0.9·P_elec + 0.25·Q_RTG  ≤  Q_reject",
      plug: `sun ${t.absorbed_sun_w} W + electronics + RTG ${t.rtg_heat_w} W (${t.n_mli} MLI, ${t.area_m2} m²)`,
      result: `${t.hot_load_w} W in vs ${t.reject_w} W radiated → margin ${pct(t.hot_margin)}`,
      tone: band(t.hot_margin, 0.1, 0.6, -0.05, 2),
      optimum: "10 – 60 %. Too little: electronics cook. Too much radiator: you need heaters in the cold.",
      real: "LRO needed big radiators because the lunar dayside glows at ~1,300 W/m² in infrared.",
      fix: t.hot_margin < 0.1 ? `Add ≈ ${f0(t.hot_load_w * 1.15 - t.reject_w)} W of heat rejection (radiator panel = 350 W).` : undefined,
    });
    out.push({
      group: "Thermal", title: "Cold case heater power",
      formula: "P_heater = Q_leak − 0.9·P_bus − 0.5·Q_RTG",
      plug: `${t.cold_leak_w} − 0.9·${f0(e.bus_draw_w - s.heater_w)} − 0.5·${t.rtg_heat_w}`,
      result: `P_heater = ${s.heater_w} W`,
      tone: s.heater_w <= 20 ? "good" : s.heater_w <= 80 ? "warn" : "bad",
      optimum: "≈ 0 W: insulate with MLI or reuse RTG waste heat. Every heater watt needs array + battery.",
      real: "MLI drops a surface's effective emittance from ~0.8 to ~0.03.",
    });
    out.push({
      group: "Thermal", title: "Radiation survival in cruise (NASA DONKI)",
      formula: "P_survive = e^(−k · activity · t_cruise / 180 d)",
      plug: `e^(−${e.rad_k} · ${env.activity_index} · ${f0(env.cruise_days)} / 180)`,
      result: `${(s.radiation_survival * 100).toFixed(1)} %`,
      tone: s.radiation_survival >= 0.97 ? "good" : s.radiation_survival >= 0.93 ? "warn" : "bad",
      optimum: "Short cruises and a quiet Sun. The activity index comes from the last 30 days of real flares/CMEs/SEPs.",
      real: "Solar cycle 25 peaked around 2024-2025 with many X-class flares.",
    });
  }

  // ---------------- COST ----------------
  if (hasParts) {
    const cb = s.cost_breakdown;
    out.push({
      group: "Cost", title: "Mass-based cost estimating relation (bus)",
      formula: "C_bus = a · m_dry^b",
      plug: `${e.bus_cer_a} · ${f0(s.dry_mass_kg)}^${e.bus_cer_b}`,
      result: `$${f1(cb.bus)}M`,
      tone: "info", optimum: "Halving the dry mass cuts the bus cost by ~40 %.",
      real: "NASA uses CERs like this (e.g. the NASA/Air Force Cost Model) early in design.",
    });
    const slack = s.budget_left / s.budget;
    out.push({
      group: "Cost", title: "Total mission cost",
      formula: "C = launch + bus + parts + 30 % wrap + 25 % reserves + operations",
      plug: `${f1(cb.launch)} + ${f1(cb.bus)} + ${f1(cb.hardware)} + ${f1(cb.wrap)} + ${f1(cb.reserve)} + ${f1(cb.operations)}`,
      result: `$${f0(cb.total)}M of $${s.budget}M cap (${pct(slack)} left)`,
      tone: band(slack, 0.05, 0.35, 0),
      optimum: "5 – 35 % under the cap: reserves absorb ~25 % growth; leftover money scores points.",
      real: "Discovery missions historically grew ~12 % in development cost.",
    });
  }

  // ---------------- SCIENCE ----------------
  if (hasParts) {
    out.push({
      group: "Science", title: "Science return",
      formula: "Science = Σ_days min(data_made, downlink_day) · value_per_GB",
      plug: `${e.days} days · ${f2(Math.min(s.data_gb_day, s.downlink_gb_day))} GB/day · ${f2(e.value_per_gb)}`,
      result: `${f0(s.max_science)} / ${m.science_target} (${pct(s.max_science / m.science_target)})`,
      tone: band(s.max_science / m.science_target, 1.1, 1.5, 0.8, 99),
      optimum: "110 – 150 % of target. The score caps at 150 %, so beyond that spend mass on margins instead.",
      real: "HiRISE has returned tens of thousands of images of Mars since 2006.",
    });
  }
  return out;
}

const GROUPS = ["Launch", "Mass", "Propulsion", "Power", "Battery", "Comms", "Thermal", "Cost", "Science"];

export function EquationsPanel({ stats, mission }: { stats: Stats; mission: Mission }) {
  const [group, setGroup] = useState<string>("all");
  if (!stats.eq) return null;
  const eqs = equations(stats, mission);
  const shown = eqs.filter((q) => group === "all" || q.group === group);
  const count = (t: Tone) => eqs.filter((q) => q.tone === t).length;
  return (
    <section className="equations">
      <div className="eq-head">
        <h3>📐 Flight dynamics notebook <span className="muted small">live: every number is your current design</span></h3>
        <div className="small">
          <span className="good-text">● {count("good")} optimal</span>{" "}
          <span className="warn-text">● {count("warn")} off-optimum</span>{" "}
          <span className="bad-text">● {count("bad")} failing</span>
        </div>
      </div>
      <div className="tabs">
        <button className={group === "all" ? "on" : ""} onClick={() => setGroup("all")}>All ({eqs.length})</button>
        {GROUPS.filter((g) => eqs.some((q) => q.group === g)).map((g) => (
          <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>
        ))}
      </div>
      <div className="eq-grid">
        {shown.map((q) => (
          <div key={q.title} className={`eq-card ${q.tone}`}>
            <div className="eq-title"><span className="muted small">{q.group}</span> {q.title}</div>
            <div className="eq-formula mono">{q.formula}</div>
            <div className="eq-plug mono small">= {q.plug}</div>
            <div className="eq-result mono">{q.result}</div>
            <div className="eq-opt small"><b>Optimum:</b> {q.optimum}</div>
            {q.fix && <div className="eq-fix small">🔧 {q.fix}</div>}
            <div className="eq-real small muted">🛰 Real data: {q.real}</div>
          </div>
        ))}
        {shown.length === 0 && <p className="muted">Pick a rocket and some parts to see the equations come alive.</p>}
      </div>
    </section>
  );
}
