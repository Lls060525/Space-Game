import type { History } from "../lib/history";

/** "It happened for real" card: a real mission that hit (or solved) the same engineering problem. */
export function HistoryCard({ h }: { h: History }) {
  return (
    <div className={`history-card ${h.solved ? "solved" : ""}`}>
      <div className="history-head">
        <span className="history-badge">{h.solved ? "✅ HOW THE PROS DID IT" : "📜 IT HAPPENED FOR REAL"}</span>
        <b>{h.mission}</b> <span className="muted small">· {h.agency} · {h.year}</span>
      </div>
      <div className="small">{h.story}</div>
      <div className="small history-takeaway">💡 {h.takeaway}</div>
    </div>
  );
}
