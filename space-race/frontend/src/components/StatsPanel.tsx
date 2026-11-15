import type { LaunchOption, Stats } from "../lib/types";

interface Gauge {
  label: string;
  value: string;
  margin: number; // >=0 good, <0 bad
  hint: string;
}

function gauges(s: Stats): Gauge[] {
  return [
    { label: "Mission cost vs cap", value: `$${s.cost.toFixed(0)}M / $${s.budget}M`, margin: (s.budget_left / s.budget) * 3,
      hint: "Launch + mass-based bus + parts + 30% management/I&T + 25% reserves + operations. Leftover earns points." },
    { label: "Thrust / Weight", value: s.twr.toFixed(2), margin: s.twr_margin,
      hint: "F / ((rocket + payload) · g₀). Needs > 1.2 for a safe ascent." },
    { label: `Launch mass vs rocket @ C3 ${s.c3.toFixed(1)}`, value: `${s.launch_mass_kg.toFixed(0)} / ${s.lv_capacity_kg.toFixed(0)} kg`,
      margin: s.capacity_margin,
      hint: `Upper-stage rocket equation: ${s.escape_dv} m/s from LEO to today's C3. Includes ${s.adapter_kg} kg adapter.` },
    { label: "Mass margin (NASA ≥15%)", value: `${(s.system_margin * 100).toFixed(0)}%`,
      margin: (s.system_margin - s.required_system_margin) * 3,
      hint: "Spare rocket capability on top of the growth allowance. Below 15% the as-built probe may not fit." },
    { label: "Delta-v", value: `${s.delta_v.toFixed(0)} / ${s.dv_required} m/s`, margin: s.dv_margin,
      hint: "Tsiolkovsky with 3% residuals. Needed: insertion + course corrections + gravity / spiral losses." },
    { label: "Power (end of life)", value: `${s.avg_gen_w.toFixed(0)} / ${s.ops_draw_w.toFixed(0)} W`, margin: s.power_margin,
      hint: "Average generation incl. eclipses, 1/r² from the real ephemeris and cell degradation, vs operating draw." },
    { label: "Eclipse battery", value: `${(s.battery_wh * 0.8).toFixed(0)} / ${s.eclipse_need_wh.toFixed(0)} Wh`,
      margin: s.battery_margin, hint: "Usable battery (80% DoD) vs energy needed in shadow." },
    { label: "Battery cycle life", value: `${s.battery_cycle_life} / ${s.battery_cycles} cycles`,
      margin: Math.max(-1, Math.min(1, s.battery_life_margin)),
      hint: `Li-ion life at ${(s.battery_dod * 100).toFixed(0)}% depth of discharge vs eclipses in the mission.` },
    { label: "Downlink", value: `${s.downlink_gb_day.toFixed(2)} / ${s.data_gb_day.toFixed(1)} GB/day`,
      margin: s.data_gb_day ? s.data_margin : 0, hint: "Best antenna × 1/d² on each real day, minus solar-conjunction blackouts." },
    { label: "Heat rejection (hot case)", value: `${s.thermal.reject_w} / ${s.thermal.hot_load_w} W`, margin: s.thermal_margin,
      hint: `Sunlight absorbed ${s.thermal.absorbed_sun_w} W + electronics + RTG heat ${s.thermal.rtg_heat_w} W vs what radiators and the body can dump.` },
    { label: "Heater power (cold case)", value: `${s.heater_w} W`, margin: s.heater_w > 0 ? -s.heater_w / Math.max(1, s.ops_draw_w) : 0.3,
      hint: `${s.thermal.cold_leak_w} W leaks out in eclipse; electronics and RTG heat cover part, heaters the rest. ${s.thermal.n_mli} MLI blanket(s).` },
    { label: "Radiation (cruise)", value: `${(s.radiation_survival * 100).toFixed(1)}% safe`,
      margin: (s.radiation_survival - 0.95) * 4, hint: "From NASA DONKI flares, CMEs and SEP events over the last 30 days." },
    { label: "Science (best case)", value: `${s.max_science.toFixed(0)} / ${s.science_target}`,
      margin: s.science_target ? s.max_science / s.science_target - 1 : 0,
      hint: "If nothing breaks. Score caps at 150%." },
  ];
}

function color(m: number) {
  if (m < -0.1) return "var(--bad)";
  if (m < 0.1) return "var(--warn)";
  return "var(--good)";
}

/** Where every kilogram goes: the weightage of each subsystem in the wet mass. */
export function MassBudget({ stats }: { stats: Stats }) {
  return (
    <div className="mass-budget small">
      <div className="mb-head">
        <span>Mass budget</span>
        <span className="mono">
          {stats.wet_mass_kg.toFixed(0)} kg wet · {stats.dry_mass_kg.toFixed(0)} kg dry
          (CBE {stats.cbe_dry_mass_kg.toFixed(0)} + {stats.mga_kg.toFixed(0)} MGA)
        </span>
      </div>
      {stats.mass_budget.map((r) => (
        <div key={r.label} className="mb-row">
          <span>{r.label}</span>
          <span className="mb-bar"><span style={{ width: `${Math.min(100, r.pct)}%` }} /></span>
          <span className="mono">{r.kg.toFixed(0)} kg · {r.pct.toFixed(1)}%</span>
        </div>
      ))}
      <div className="muted mb-foot">
        Weighs {(stats.weight_on_earth_n / 1000).toFixed(1)} kN on the pad, {(stats.weight_at_destination_n / 1000).toFixed(1)} kN
        at the destination. Heaviest part: {stats.heaviest_part ?? "-"} ({stats.heaviest_part_kg} kg).
        Every part kg also adds {(100 * (0.22 + 0.06) / (1 - 0.28)).toFixed(0)}% for structure + harness.
      </div>
    </div>
  );
}

/** Where every dollar goes (NASA-style parametric estimate). */
export function CostBudget({ stats }: { stats: Stats }) {
  const cb = stats.cost_breakdown;
  if (!cb) return null;
  return (
    <div className="mass-budget small">
      <div className="mb-head">
        <span>Cost estimate</span>
        <span className="mono">${cb.total.toFixed(0)}M of ${stats.budget}M cap</span>
      </div>
      {cb.rows.map((r) => (
        <div key={r.label} className="mb-row">
          <span>{r.label}</span>
          <span className="mb-bar"><span style={{ width: `${Math.min(100, (100 * r.musd) / stats.budget)}%`, background: "var(--warn)" }} /></span>
          <span className="mono">${r.musd.toFixed(1)}M</span>
        </div>
      ))}
      {cb.nuclear_surcharge > 0 && <div className="muted mb-foot">Includes ${cb.nuclear_surcharge}M nuclear launch approval for the RTG.</div>}
    </div>
  );
}

/** Every rocket vs today's real C3: can it carry your probe, and what does it cost? */
export function LaunchTable({ options, mass, c3 }: { options: LaunchOption[]; mass?: number; c3: number }) {
  if (!options?.length) return null;
  return (
    <div className="mass-budget small">
      <div className="mb-head"><span>Rockets for this expedition today (C3 {c3.toFixed(1)} km²/s²)</span>
        {mass ? <span className="mono">your probe {mass.toFixed(0)} kg</span> : null}</div>
      {options.map((o) => (
        <div key={o.slug} className="lv-row" title={o.ref}>
          <span>{o.name}</span>
          <span className="mono">{o.capacity_kg.toLocaleString()} kg</span>
          <span className="mono">${o.price_low}–{o.price_high}M</span>
          <span className={o.fits ? "good-text" : mass ? "bad-text" : "muted"}>{mass ? (o.fits ? "✓ fits" : "✗ too small") : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsPanel({ stats, compact = false }: { stats: Stats; compact?: boolean }) {
  return (
    <div className={`stats ${compact ? "compact" : ""}`}>
      {gauges(stats).map((g) => (
        <div className="gauge" key={g.label} title={g.hint}>
          <div className="gauge-head">
            <span>{g.label}</span>
            <span className="mono">{g.value}</span>
          </div>
          <div className="bar">
            <div className="fill" style={{
              width: `${Math.max(4, Math.min(100, 50 + g.margin * 100))}%`,
              background: color(g.margin),
            }} />
            <div className="tick" />
          </div>
        </div>
      ))}
      {!compact && stats.mass_budget && <MassBudget stats={stats} />}
      {!compact && <CostBudget stats={stats} />}
      {!compact && stats.launch_options?.length > 0 && (
        <LaunchTable options={stats.launch_options} mass={stats.cost_breakdown?.hardware ? stats.launch_mass_kg : undefined} c3={stats.c3} />
      )}
      {!compact && (
        <ul className="warnings">
          {stats.warnings.length === 0 && <li className="ok">All systems nominal. Go for launch?</li>}
          {stats.warnings.map((w) => <li key={w.code} className={w.level}>{w.message}</li>)}
        </ul>
      )}
    </div>
  );
}
