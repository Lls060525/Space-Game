import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { MissionEnv, NasaSummary } from "../lib/types";

let cached: Promise<NasaSummary> | null = null;
export function useNasa(initial?: NasaSummary | null) {
  const [data, setData] = useState<NasaSummary | null>(initial ?? null);
  useEffect(() => {
    if (initial) return;
    cached ??= api.nasa().catch((e) => { cached = null; throw e; });
    cached.then(setData).catch(() => {});
  }, [initial]);
  return data;
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-";

/** "Live from NASA" strip: the real-world conditions this mission flies in today. */
export function NasaLive({ env, destination, nasa }: { env?: MissionEnv; destination: string; nasa?: NasaSummary | null }) {
  const data = useNasa(nasa);
  if (!env) return null;
  const wx = data?.space_weather;
  const planet = data?.planets?.[destination as "Mars" | "Venus" | "Moon"];
  const live = data?.live ?? env.source.includes("live");
  const windowTone = env.window_days_off <= 20 ? "good" : env.window_days_off <= 60 ? "warn" : "bad";
  return (
    <div className="nasa-live">
      <div className="nasa-head">
        <span className={`live-dot ${live ? "on" : ""}`} />
        <b>{live ? "LIVE FROM NASA" : "NASA DATA (offline fallback)"}</b>
        <span className="muted small">{env.source}{wx ? ` · ${wx.source}` : ""}</span>
      </div>
      <div className="nasa-grid">
        <div>
          <span className="muted">Launch window</span>
          <b className={`${windowTone}-text`}>{env.window}</b>
          {env.phase_deg !== null && (
            <span className="small muted">phase {env.phase_deg}° (ideal {env.optimal_phase_deg}°)
              {env.window_days_off > 20 ? ` · next ideal in ${env.next_window_days} d` : ""}</span>
          )}
        </div>
        <div>
          <span className="muted">Departure energy C3</span>
          <b>{env.c3.toFixed(1)} km²/s²</b>
          <span className="small muted">best possible {env.c3_min.toFixed(1)}</span>
        </div>
        <div>
          <span className="muted">Launch → arrival</span>
          <b>{fmtDate(env.launch_date)} → {fmtDate(env.arrival_date)}</b>
          <span className="small muted">{env.cruise_days.toFixed(0)} days cruise</span>
        </div>
        <div>
          <span className="muted">{destination} today</span>
          <b>{planet ? `${planet.sun_au.toFixed(3)} AU from Sun` : `${env.sun_au.toFixed(2)} AU`}</b>
          <span className="small muted">
            {planet?.earth_km ? `${(planet.earth_km / 1e6).toFixed(planet.earth_km < 1e6 ? 3 : 1)} M km from Earth · ` : ""}
            {planet ? `${planet.irradiance_w_m2} W/m²` : ""}
          </span>
        </div>
        <div>
          <span className="muted">Signal light time (arrival)</span>
          <b>{env.light_time_min < 1 ? `${(env.light_time_min * 60).toFixed(1)} s` : `${env.light_time_min.toFixed(1)} min`}</b>
          <span className="small muted">
            {env.blackout_days > 0 ? `☀ ${env.blackout_days} d solar-conjunction blackout` : `Sun-Earth-probe ≥ ${env.min_sep_deg.toFixed(0)}°`}
          </span>
        </div>
        <div>
          <span className="muted">Space weather (30 d)</span>
          <b className={env.activity_index >= 3 ? "warn-text" : ""}>{env.space_weather_level}</b>
          <span className="small muted">
            {wx ? `${wx.flares.X} X · ${wx.flares.M} M flares · ${wx.sep_events} SEP · ${wx.fast_cme_count} fast CMEs` : `index ${env.activity_index}`}
            {wx?.strongest_flare ? ` · peak ${wx.strongest_flare}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
