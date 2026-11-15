import { useState } from "react";
import type { Mission, Stats } from "../lib/types";

/**
 * "Try it" sandboxes for the key equations. Sliders start at YOUR current design values,
 * so players can see exactly which knob would fix their spacecraft before spending budget.
 */
export type PlayKind = "rocket" | "solar" | "link" | "twr" | "dod" | "light";

export const PLAY_FOR_TITLE: Record<string, PlayKind> = {
  "Tsiolkovsky rocket equation (your spacecraft)": "rocket",
  "Solar array output at the target": "solar",
  "Inverse-square link budget": "link",
  "Lift-off thrust-to-weight": "twr",
  "Depth of discharge & cycle life": "dod",
  "Light-time delay": "light",
};

const G0 = 9.80665;
const ok = (x: number, d: number) => (Number.isFinite(x) && x > 0 ? x : d);
const fmt = (x: number, digits = 0) => (Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: digits }) : "∞");

const PLANETS = [
  { name: "Venus", au: 0.72 }, { name: "Earth", au: 1 }, { name: "Mars", au: 1.52 },
  { name: "Jupiter", au: 5.2 }, { name: "Saturn", au: 9.5 },
];

function Slider({ label, value, min, max, step, onChange, unit, log }:
  { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit: string; log?: boolean }) {
  // log sliders map 0..1000 -> min..max exponentially (for AU and data rates that span decades)
  const toPos = (v: number) => (log ? (Math.log(v / min) / Math.log(max / min)) * 1000 : v);
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p / 1000) : p);
  return (
    <label className="pg-slider">
      <span className="pg-label">{label}</span>
      <input type="range" min={log ? 0 : min} max={log ? 1000 : max} step={log ? 1 : step ?? 1}
             value={toPos(value)} onChange={(e) => onChange(fromPos(Number(e.target.value)))} />
      <span className="mono pg-val">{fmt(value, value < 10 ? 2 : 0)} {unit}</span>
    </label>
  );
}

function Meter({ value, target, label }: { value: number; target: number; label: string }) {
  const r = target > 0 ? value / target : 0;
  const tone = r >= 1.1 ? "good" : r >= 1 ? "warn" : "bad";
  return (
    <div className="pg-meter">
      <div className="pg-meter-bar"><div className={tone} style={{ width: `${Math.min(100, r * 80)}%` }} /><i style={{ left: "80%" }} /></div>
      <div className={`small ${tone}-text`}>{label}</div>
    </div>
  );
}

export function Playground({ kind, stats, mission }: { kind: PlayKind; stats: Stats; mission: Mission }) {
  const e = stats.eq ?? ({} as Stats["eq"]);
  // ---------- rocket equation ----------
  const [isp, setIsp] = useState(ok(stats.isp_s, 320));
  const [dry, setDry] = useState(ok(stats.dry_mass_kg, 800));
  const [prop, setProp] = useState(ok(stats.propellant_kg, 400));
  // ---------- solar ----------
  const [au, setAu] = useState(ok(stats.env?.sun_au ?? mission.sun_au, 1.52));
  const [panel, setPanel] = useState(ok(stats.solar_bol_w, 1000));   // solar_bol_w = array rating at 1 AU
  // ---------- link ----------
  const [dist, setDist] = useState(ok(stats.env?.comm_au, 1.5));
  const [mbps, setMbps] = useState(ok(e.best_mbps, 2));
  // ---------- TWR ----------
  const [thrust, setThrust] = useState(ok(e.thrust_kn, 7600));
  const [rocketT, setRocketT] = useState(ok(e.rocket_mass_t, 550));
  const [payload, setPayload] = useState(ok(stats.launch_mass_kg, 2000));
  // ---------- DoD ----------
  const [cap, setCap] = useState(ok(stats.battery_wh, 1000));
  const [need, setNeed] = useState(ok(stats.eclipse_need_wh, 300));
  const [cycles, setCycles] = useState(ok(stats.battery_cycles, 2000));
  // ---------- light time ----------
  const [lt, setLt] = useState(ok(stats.env?.comm_au, 1.5));

  switch (kind) {
    case "rocket": {
      const dv = isp * G0 * Math.log((dry + prop) / dry);
      const dv2 = isp * G0 * Math.log((dry + 2 * prop) / dry);
      const target = ok(stats.dv_required, mission.insertion_dv);
      return (
        <div className="playground">
          <Slider label="Engine Isp" value={isp} min={200} max={3500} step={10} onChange={setIsp} unit="s" />
          <Slider label="Dry mass" value={dry} min={100} max={4000} step={10} onChange={setDry} unit="kg" />
          <Slider label="Propellant" value={prop} min={0} max={4000} step={10} onChange={setProp} unit="kg" />
          <div className="pg-out mono">Δv = {fmt(isp)}·9.81·ln({fmt(dry + prop)}/{fmt(dry)}) = <b>{fmt(dv)} m/s</b></div>
          <Meter value={dv} target={target} label={`Need ${fmt(target)} m/s to enter orbit (+10% margin is safe)`} />
          <div className="pg-insight small">💡 Doubling propellant to {fmt(2 * prop)} kg gives {fmt(dv2)} m/s, only
            +{fmt(prop > 0 ? (dv2 / Math.max(1, dv) - 1) * 100 : 0)}%. A higher-Isp engine scales Δv directly.</div>
        </div>
      );
    }
    case "solar": {
      const out = panel / (au * au);
      return (
        <div className="playground">
          <Slider label="Distance from Sun" value={au} min={0.3} max={10} onChange={setAu} unit="AU" log />
          <Slider label="Array rating at 1 AU" value={panel} min={100} max={6000} step={50} onChange={setPanel} unit="W" />
          <div className="pg-planets">{PLANETS.map((p) => (
            <button key={p.name} className={Math.abs(p.au - au) < 0.05 ? "on" : ""} onClick={() => setAu(p.au)}>{p.name}</button>
          ))}</div>
          <div className="pg-out mono">P = {fmt(panel)} W / {au.toFixed(2)}² = <b>{fmt(out)} W</b> ({fmt(100 / (au * au))}% of Earth)</div>
          <Meter value={out} target={ok(stats.ops_draw_w, 300)} label={`Your spacecraft draws ${fmt(ok(stats.ops_draw_w, 300))} W while operating`} />
          <div className="pg-insight small">💡 Inverse-square law: twice as far = ¼ the power. At Jupiter, Juno needs arrays the size of a basketball court.</div>
        </div>
      );
    }
    case "link": {
      const rate = mbps / Math.max(dist * dist, 0.04);
      const gb = (rate * ok(e.contact_hours, 8) * 3600) / 8000;
      return (
        <div className="playground">
          <Slider label="Distance from Earth" value={dist} min={0.003} max={10} onChange={setDist} unit="AU" log />
          <Slider label="Antenna rate at 1 AU" value={mbps} min={0.1} max={100} onChange={setMbps} unit="Mbps" log />
          <div className="pg-out mono">R = {mbps.toFixed(2)} / {dist.toFixed(2)}² = <b>{rate.toFixed(2)} Mbps</b> → {gb.toFixed(1)} GB/day</div>
          <Meter value={gb} target={ok(stats.data_gb_day, 1)} label={`Your instruments make ${fmt(ok(stats.data_gb_day, 1), 1)} GB/day`} />
          <div className="pg-insight small">💡 Doubling the distance cuts the data rate to a quarter. Bigger dishes and Ka-band win it back, at a cost in power and mass.</div>
        </div>
      );
    }
    case "twr": {
      const twr = (thrust * 1000) / ((rocketT * 1000 + payload) * G0);
      const msg = twr < 1 ? "Can't lift off: thrust is less than weight!" : twr < 1.2 ? "Lifts off, but slowly. Gravity losses eat your fuel."
        : twr < 1.8 ? "Healthy lift-off." : "Very punchy: high g-loads on the payload.";
      return (
        <div className="playground">
          <Slider label="Engine thrust" value={thrust} min={500} max={40000} step={100} onChange={setThrust} unit="kN" />
          <Slider label="Rocket mass (fuelled)" value={rocketT} min={20} max={3000} step={5} onChange={setRocketT} unit="t" />
          <Slider label="Payload" value={payload} min={100} max={30000} step={50} onChange={setPayload} unit="kg" />
          <div className="pg-out mono">TWR = {fmt(thrust * 1000)} N / ({fmt(rocketT * 1000 + payload)} kg · 9.81) = <b>{twr.toFixed(2)}</b></div>
          <Meter value={twr} target={1.2} label={msg} />
          <div className="pg-insight small">💡 The rocket's own propellant is most of its weight. Your payload barely changes TWR, but it changes how much Δv the rocket has left.</div>
        </div>
      );
    }
    case "dod": {
      const dod = need / cap;
      const life = 50000 * Math.exp(-4.5 * Math.max(0.05, dod));
      return (
        <div className="playground">
          <Slider label="Battery capacity" value={cap} min={100} max={10000} step={50} onChange={setCap} unit="Wh" />
          <Slider label="Energy used per eclipse" value={need} min={10} max={3000} step={10} onChange={setNeed} unit="Wh" />
          <Slider label="Eclipses in the mission" value={cycles} min={100} max={60000} onChange={setCycles} unit="" log />
          <div className="pg-out mono">DoD = {fmt(need)}/{fmt(cap)} = <b>{fmt(dod * 100)}%</b> → cells last ~{fmt(life)} cycles</div>
          <Meter value={life} target={cycles} label={life >= cycles ? "Battery outlives the mission" : "Battery wears out before the mission ends"} />
          <div className="pg-insight small">💡 Cycle life falls exponentially with depth of discharge, so shallow cycles last far longer. A bigger battery is often the cheapest life extension.</div>
        </div>
      );
    }
    case "light": {
      const min = (lt * 499) / 60;
      const metres = (10 / 3.6) * min * 60 * 2;    // a 10 km/h rover during the round trip
      return (
        <div className="playground">
          <Slider label="Distance from Earth" value={lt} min={0.0026} max={10} onChange={setLt} unit="AU" log />
          <div className="pg-planets">{[{ name: "Moon", au: 0.0026 }, { name: "Mars (close)", au: 0.38 }, { name: "Mars (far)", au: 2.67 }, { name: "Jupiter", au: 5.2 }].map((p) => (
            <button key={p.name} onClick={() => setLt(p.au)}>{p.name}</button>
          ))}</div>
          <div className="pg-out mono">t = {lt.toFixed(3)} AU · 499 s = <b>{min < 1 ? `${(min * 60).toFixed(1)} s` : `${min.toFixed(1)} min`}</b> one way</div>
          <div className="pg-insight small">💡 You see a cliff and press "STOP". By the time the command arrives and you see the result, a 10 km/h rover has driven <b>{fmt(metres)} m</b>. That's why rovers drive themselves.</div>
        </div>
      );
    }
  }
}
