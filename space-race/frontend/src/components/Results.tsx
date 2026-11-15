import { useEffect, useMemo } from "react";
import { sfx } from "../lib/sfx";
import { debrief } from "../lib/debrief";
import { historyFor, type History } from "../lib/history";
import { HistoryCard } from "./HistoryCard";
import { ShareCard, type ResultShare } from "./ShareCard";
import type { SimResult } from "../lib/types";

interface Row { label: string; result: SimResult; color: string; winner?: boolean }

const PHASES = ["launch", "cruise", "radiation", "insertion", "operations"];

/** The share card describes the first row (always "you"). */
function shareFor(r: Row, destination: string, player: string, won: boolean, rival?: string): ResultShare {
  const s = r.result.stats;
  const sci = Math.round(r.result.science_pct * 100);
  const margin = Math.round((s.system_margin ?? 0) * 100);
  const vs = rival ? (won ? `🏆 Beat ${rival} · ` : `⚔️ vs ${rival} · `) : "";
  const good = r.result.success;
  const headline = good ? `Reached ${destination} and delivered ${sci}% of the science` : r.result.outcome;
  const text = good
    ? `${vs}🚀 I reached ${destination} with a ${margin}% mass margin and ${sci}% of the science target: ${r.result.score.toLocaleString()} pts in The Space Race. Can you beat it?`
    : `${vs}💥 My ${destination} probe failed (${r.result.outcome}) with ${r.result.score.toLocaleString()} pts. Think you can engineer it better?`;
  return {
    mode: rival ? "MISSION DESIGN · PvP" : "MISSION DESIGN", planet: destination, headline, good, player,
    score: r.result.score, text,
    stats: [
      { label: "Science", value: `${sci}%` },
      { label: "Mass margin", value: `${margin}%` },
      { label: "Cost", value: `$${Math.round(r.result.as_built?.actual_cost ?? s.cost)}M` },
      { label: "Days alive", value: `${r.result.survived_days}/${r.result.days}` },
    ],
  };
}

export function Results({ rows, onBack, backLabel = "Back to lobby", myResultWon = false, destination, player }:
  { rows: Row[]; onBack: () => void; backLabel?: string; myResultWon?: boolean; destination?: string; player?: string }) {
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
              <dt>Final cost</dt>
              <dd>${(r.result.as_built?.actual_cost ?? r.result.stats.cost).toFixed(0)}M of ${r.result.stats.budget}M
                {r.result.as_built?.cost_growth !== undefined && ` (${r.result.as_built.cost_growth >= 0 ? "+" : ""}${(r.result.as_built.cost_growth * 100).toFixed(0)}% growth)`}</dd>
              {r.result.as_built?.dry_mass_kg !== undefined && <>
                <dt>As-built dry mass</dt>
                <dd>{r.result.as_built.dry_mass_kg.toFixed(0)} kg (+{(r.result.as_built.growth_kg ?? 0).toFixed(0)} kg growth)</dd>
              </>}
              {(r.result.as_built?.offloaded_kg ?? 0) > 0 && <>
                <dt>Propellant off-loaded</dt><dd className="bad-text">{r.result.as_built!.offloaded_kg!.toFixed(0)} kg</dd>
              </>}
              {r.result.as_built?.delta_v !== undefined && <>
                <dt>Δv at arrival</dt><dd>{r.result.as_built.delta_v} / {r.result.as_built.dv_needed} m/s</dd>
              </>}
            </dl>
            <h4>🧑‍🚀 Flight director's debrief</h4>
            <ul className="debrief">
              {(() => {
                const seen = new Set<History>();
                return debrief(r.result).map((l, i) => {
                  const h = historyFor(l);
                  const showH = h && !seen.has(h) && seen.size < 2;
                  if (h && showH) seen.add(h);
                  return (
                    <li key={i} className={l.tone}>
                      <b>{l.title}</b>{l.equation && <span className="muted small"> · see “{l.equation}”</span>}
                      <div className="small">{l.why}</div>
                      {l.fix && <div className="small fix">🔧 {l.fix}</div>}
                      {showH && <HistoryCard h={h!} />}
                    </li>
                  );
                });
              })()}
            </ul>
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
      {destination && rows[0] && (
        <ShareCard data={shareFor(rows[0], destination, player ?? rows[0].label, myResultWon, rows[1]?.label)} />
      )}
      <p className="muted center">Both spacecraft flew with the same dice rolls - the difference was engineering.</p>
      <div className="center"><button className="primary" onClick={onBack}>{backLabel}</button></div>
    </div>
  );
}
