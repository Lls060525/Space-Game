import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Check {
  group: string; name: string; kind: "independent" | "calibration" | "input"; model: number; published: number;
  unit: string; error_pct: number; tolerance_pct: number; passed: boolean; source: string; note: string;
}
interface Source { name: string; url: string; use: string }
type Data = { checks: Check[]; passed: number; total: number; sources: Source[] };

const KIND: Record<Check["kind"], string> = {
  independent: "Prediction", calibration: "Calibrated", input: "Input data",
};

/** Model validation vs published NASA / launch-provider numbers + every data source used. */
export function SciencePage({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.validation().then(setData).catch((e) => setErr(String(e))); }, []);
  const indep = data?.checks.filter((c) => c.kind === "independent") ?? [];

  return (
    <div className="science">
      <div className="practice-bar">
        <button className="link" onClick={onExit}>← Lobby</button>
        <h2 style={{ margin: 0 }}>🔬 Science, validation & data sources</h2>
      </div>

      <section className="panel">
        <h3>Is the simulator right? {data && <span className="badge good">{data.passed}/{data.total} checks pass</span>}</h3>
        <p className="muted small">
          The game runs the same equations a mission design team would. Here they are tested against numbers published by
          NASA, JPL and launch providers. <b>Prediction</b> means an independent check that we did not tune.{" "}
          <b>Calibrated</b> means we fitted a parameter to this number, and <b>Input data</b> means a real value the game
          uses directly. {indep.length > 0 && <>Independent predictions: <b>{indep.filter((c) => c.passed).length}/{indep.length}</b> within tolerance.</>}
        </p>
        {err && <p className="bad-text">{err}</p>}
        {data && (
          <table className="board validation">
            <thead><tr><th>Area</th><th>Check</th><th>Type</th><th>Our model</th><th>Published</th><th>Error</th><th>Source</th></tr></thead>
            <tbody>
              {data.checks.map((c) => (
                <tr key={c.name} title={c.note}>
                  <td>{c.group}</td>
                  <td>{c.name}{c.note && <div className="muted small">{c.note}</div>}</td>
                  <td><span className={`badge ${c.kind === "independent" ? "good" : ""}`}>{KIND[c.kind]}</span></td>
                  <td className="mono">{c.model.toLocaleString()} {c.unit}</td>
                  <td className="mono">{c.published.toLocaleString()} {c.unit}</td>
                  <td className={`mono ${c.passed ? "good-text" : "bad-text"}`}>{c.error_pct > 0 ? "+" : ""}{c.error_pct}% {c.passed ? "✓" : "✗"}</td>
                  <td className="small muted">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h3>NASA data and references used</h3>
        <ul className="sources">
          {data?.sources.map((s) => (
            <li key={s.name}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> <span className="muted">- {s.use}</span></li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>What is modelled, and what is simplified</h3>
        <ul className="small">
          <li><b>Real and live:</b> planet positions (JPL Horizons), launch windows and C3, Sun and Earth distances,
            solar conjunctions, space weather (DONKI), Mars local time and season (Mars24), real rocket prices and performance.</li>
          <li><b>Physics:</b> rocket equation, upper-stage payload to C3, mass growth allowance, structure and harness fractions,
            1/r² sunlight and radio links, RTG decay, battery depth of discharge and cycle life, lumped heat balance,
            rover Newtonian forces with terramechanics-style sinkage.</li>
          <li><b>Estimates:</b> part prices marked "est." are our engineering estimates; the cost model is a simplified
            NASA-style parametric estimate.</li>
          <li><b>Simplified:</b> 2-D heat balance, Hohmann-based window penalty (not a full porkchop plot), procedural rover
            terrain (not real elevation data), and rover energy runs 120× faster than real time so a drive fits in 3 minutes.</li>
        </ul>
      </section>
    </div>
  );
}
