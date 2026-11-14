import { useEffect, useMemo } from "react";
import { sfx } from "../lib/sfx";
import type { SimResult } from "../lib/types";

interface Row { label: string; result: SimResult; color: string; winner?: boolean }

const PHASES = ["launch", "cruise", "insertion", "operations"];

export function Results({ rows, onBack, backLabel = "Back to lobby", myResultWon = false }:
  { rows: Row[]; onBack: () => void; backLabel?: string; myResultWon?: boolean }) {
  useEffect(() => { myResultWon ? sfx.fanfare() : sfx.sad(); }, [myResultWon]);
  const confetti = useMemo(() => Array.from({ length: 90 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.5, dur: 2.5 + Math.random() * 2,
    color: ["#7dd3fc", "#f472b6", "#fbbf24", "#34d399", "#ffffff"][i % 5], rot: Math.random() * 360,
  })), []);
  return (
    <div className="results">
      {myResultWon && (
        <div className="confetti" aria-hidden>
          {confetti.map((c, i) => (
            <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`,
              animationDuration: `${c.dur}s`, transform: `rotate(${c.rot}deg)` }} />
          ))}
        </div>
      )}
      <div className={`verdict ${myResultWon ? "good" : "bad"}`}>{myResultWon ? "MISSION ACCOMPLISHED" : "MISSION FAILED"}</div>
      <div className="result-cards">
        {rows.map((r) => (
          <div key={r.label} className={`result-card ${r.winner ? "winner" : ""}`} style={{ borderColor: r.color }}>
            {r.winner && <div className="crown">🏆 WINNER</div>}
            <h3 style={{ color: r.color }}>{r.label}</h3>
            <div className={`outcome ${r.result.success ? "good" : r.result.failed_phase ? "bad" : "warn"}`}>
              {r.result.outcome}
            </div>
            <div className="score mono">{r.result.score} pts</div>
            <dl>
              <dt>Science returned</dt><dd>{r.result.science.toFixed(0)} ({(r.result.science_pct * 100).toFixed(0)}%)</dd>
              <dt>Days operated</dt><dd>{r.result.survived_days} / {r.result.days}</dd>
              <dt>Budget left</dt><dd>${r.result.stats.budget_left}M</dd>
            </dl>
            <h4>Success odds you engineered</h4>
            <ul className="odds">
              {PHASES.map((ph) => (
                <li key={ph}>
                  <span>{ph}</span>
                  <span className="mono">
                    {r.result.probabilities[ph] !== undefined ? `${(r.result.probabilities[ph] * 100).toFixed(0)}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted center">Both spacecraft flew with the same dice rolls - the difference was engineering.</p>
      <div className="center"><button className="primary" onClick={onBack}>{backLabel}</button></div>
    </div>
  );
}
