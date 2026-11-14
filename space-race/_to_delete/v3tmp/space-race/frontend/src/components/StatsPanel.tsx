import type { Stats } from "../lib/types";

interface Gauge {
  label: string;
  value: string;
  margin: number; // >=0 good, <0 bad
  hint: string;
}

function gauges(s: Stats): Gauge[] {
  return [
    { label: "Budget", value: `$${s.cost}M / $${s.budget}M`, margin: s.budget_left / s.budget,
      hint: "Leftover budget earns bonus points." },
    { label: "Thrust / Weight", value: s.twr.toFixed(2), margin: s.twr_margin,
      hint: "Needs > 1.2 for a safe ascent." },
    { label: "Launch capacity", value: `${s.wet_mass_kg.toFixed(0)} / ${s.lv_capacity_kg.toFixed(0)} kg`,
      margin: s.capacity_margin, hint: "Wet mass vs what the rocket can send to the target." },
    { label: "Delta-v", value: `${s.delta_v.toFixed(0)} / ${s.dv_required} m/s`, margin: s.dv_margin,
      hint: "Braking burn to enter orbit (Tsiolkovsky equation)." },
    { label: "Power", value: `${s.avg_gen_w.toFixed(0)} / ${s.ops_draw_w.toFixed(0)} W`, margin: s.power_margin,
      hint: "Average generation (incl. eclipses) vs operating draw." },
    { label: "Eclipse battery", value: `${(s.battery_wh * 0.8).toFixed(0)} / ${s.eclipse_need_wh.toFixed(0)} Wh`,
      margin: s.battery_margin, hint: "Usable battery (80% DoD) vs energy needed in shadow." },
    { label: "Downlink", value: `${s.downlink_gb_day.toFixed(2)} / ${s.data_gb_day.toFixed(1)} GB/day`,
      margin: s.data_gb_day ? s.data_margin : 0, hint: "Data you can send home vs data you produce." },
    { label: "Thermal", value: `${s.thermal_rating} / ${s.thermal_req}`, margin: s.thermal_margin / Math.max(1, s.thermal_req),
      hint: "Thermal control rating vs environment." },
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
      {!compact && (
        <ul className="warnings">
          {stats.warnings.length === 0 && <li className="ok">All systems nominal. Go for launch?</li>}
          {stats.warnings.map((w) => <li key={w.code} className={w.level}>{w.message}</li>)}
        </ul>
      )}
    </div>
  );
}
