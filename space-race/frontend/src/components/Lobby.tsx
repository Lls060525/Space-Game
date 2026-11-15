import { useEffect, useState } from "react";
import { api, wsUrl } from "../lib/api";
import type { User } from "../lib/types";
import { sfx } from "../lib/sfx";
import { useSocket } from "../lib/useSocket";

type Board = Awaited<ReturnType<typeof api.leaderboard>>;

export function Lobby({ me, onMatch, onPractice, onRover, onScience }:
  { me: User; onMatch: (id: string) => void; onPractice: () => void; onRover: () => void; onScience: () => void }) {
  const [online, setOnline] = useState<User[]>([]);
  const [queued, setQueued] = useState(false);
  const [board, setBoard] = useState<Board>([]);

  const { send, connected } = useSocket(wsUrl("/ws/lobby/"), (msg) => {
    if (msg.type === "presence") setOnline(msg.users);
    if (msg.type === "queued") setQueued(true);
    if (msg.type === "cancelled") setQueued(false);
    if (msg.type === "match_found") { sfx.matchFound(); onMatch(msg.match_id); }
  });

  useEffect(() => { api.leaderboard().then(setBoard).catch(() => {}); }, []);

  return (
    <div className="lobby">
      <section className="panel hero">
        <h2>Mission Control</h2>
        <p>Both players get the same mission and budget, and draft from one shared pool of parts.
          If your rival grabs the lightweight solar array, you live with the heavy generator.
          Or design a rover and drive it across Mars, the Moon or Venus in <b>Rover Expedition</b>.</p>
        <div className="row">
          {!queued
            ? <button className="primary big" disabled={!connected} onClick={() => { sfx.click(); send({ type: "find_match" }); }}>Find a rival</button>
            : <button className="big" onClick={() => send({ type: "cancel" })}>
                <span className="pulse" /> Looking for match… (cancel)
              </button>}
          <button className="big" disabled={!connected || queued} onClick={() => { sfx.click(); send({ type: "play_ai" }); }}
                  title="A greedy AI engineer that drafts from the same shared pool and steals last copies">
            🤖 Play vs AI rival
          </button>
          <button className="big" onClick={onPractice}>Solo practice</button>
          <button className="big" onClick={onScience}>🔬 Science & data</button>
          <button className="big rover-btn" onClick={() => { sfx.click(); onRover(); }}>🚙 Rover Expedition <span className="badge good">NEW</span></button>
        </div>
        {!connected && <p className="muted">Connecting to mission control…</p>}
      </section>

      <section className="panel">
        <h3>Online now <span className="badge good">{online.length}</span></h3>
        <ul className="online">
          {online.map((u) => <li key={u.id}><span className="dot" /> {u.username}{u.id === me.id && " (you)"}</li>)}
        </ul>
      </section>

      <section className="panel">
        <h3>Leaderboard</h3>
        <table className="board">
          <thead><tr><th>#</th><th>Pilot</th><th>Rating</th><th>W-L</th><th>Best</th></tr></thead>
          <tbody>
            {board.map((r, i) => (
              <tr key={r.username}><td>{i + 1}</td><td>{r.username}</td><td className="mono">{r.rating}</td>
                <td className="mono">{r.wins}-{r.losses}</td><td className="mono">{r.best_score}</td></tr>
            ))}
            {board.length === 0 && <tr><td colSpan={5} className="muted">No games yet - be the first.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
