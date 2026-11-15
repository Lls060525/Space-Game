import { useEffect, useMemo, useState } from "react";
import { api, type ClassInfo } from "../lib/api";
import type { Component, Mission, SimResult, Stats } from "../lib/types";
import { Coach } from "./Coach";
import { DraftBoard } from "./DraftBoard";
import { Launch3D } from "./Launch3D";
import { Results } from "./Results";

/** Single-player sandbox: same board, full stock, stats from the same server-side sim. */
export function Practice({ components, onExit }: { components: Component[]; onExit: () => void }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [animDone, setAnimDone] = useState(false);
  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [clsMsg, setClsMsg] = useState("");
  const joinClass = (code: string) => api.getClass(code.trim().toUpperCase()).then((c) => {
    setCls(c); setClsMsg(""); setPicks([]);
    const m = missions.find((x) => x.slug === c.mission); if (m) setMission(m);
  }).catch((e) => setClsMsg(String(e.message ?? e)));
  const refreshClass = () => { if (cls) api.getClass(cls.code).then(setCls).catch(() => {}); };

  useEffect(() => { api.missions().then((m) => { setMissions(m); setMission(m[0]); }); }, []);
  useEffect(() => {
    if (!mission) return;
    const t = setTimeout(() => api.analyze(mission.slug, picks, cls?.code).then(setStats), 120);
    return () => clearTimeout(t);
  }, [mission, picks, cls]);

  const pool = useMemo(() => {
    const p: Record<string, number> = {};
    for (const c of components) p[String(c.id)] = c.stock - picks.filter((x) => x === c.id).length;
    return p;
  }, [components, picks]);

  if (!mission) return <div className="center muted">Loading missions…</div>;

  if (result) {
    const parts = picks.map((id) => components.find((c) => c.id === id)).filter((c): c is Component => !!c);
    const lanes = [{ label: "Your probe", result, color: "#7dd3fc", parts }];
    return (
      <div className="launch-screen">
        {animDone
          ? <>
              <Results rows={lanes} myResultWon={result.success} backLabel="Back to drafting board"
                       onBack={() => { setResult(null); setAnimDone(false); refreshClass(); }} />
              {cls && <ClassBoard cls={cls} />}
            </>
          : <>
              <Launch3D lanes={lanes} destination={mission.destination} onDone={() => setAnimDone(true)} />
              <div className="center"><button onClick={() => setAnimDone(true)}>Skip</button></div>
            </>}
      </div>
    );
  }

  return (
    <>
      <div className="practice-bar">
        <button className="link" onClick={onExit}>← Lobby</button>
        {!cls && missions.map((m) => (
          <button key={m.slug} className={m.slug === mission.slug ? "on" : ""}
                  onClick={() => { setMission(m); setPicks([]); }}>{m.destination}</button>
        ))}
        <span className="class-bar">
          {cls ? <>
            <span className="badge good">🏫 Class {cls.code}</span> <span className="small">{cls.title || cls.mission_name}</span>
            <button className="link small" onClick={() => { setCls(null); setPicks([]); }}>leave</button>
          </> : <>
            <input placeholder="Class code" value={codeInput} maxLength={8} onChange={(e) => setCodeInput(e.target.value)} style={{ width: 110 }} />
            <button onClick={() => joinClass(codeInput)} disabled={!codeInput.trim()}>Join class</button>
            <button title="Teacher: everyone who joins gets this mission, today's NASA snapshot and the same dice"
                    onClick={() => api.createClass(mission.slug, `${mission.destination} class challenge`)
                      .then((c) => { setCls(c); setClsMsg(`Share this code with your class: ${c.code}`); }).catch((e) => setClsMsg(String(e.message ?? e)))}>
              Create class challenge
            </button>
          </>}
          {clsMsg && <span className="small warn-text"> {clsMsg}</span>}
        </span>
      </div>
      <Coach stats={stats} mission={mission} />
      <DraftBoard
        mission={mission} components={components} pool={pool} myPicks={picks} myStats={stats} ready={false}
        onPick={(id) => setPicks((p) => [...p, id])}
        onRelease={(id) => setPicks((p) => { const i = p.indexOf(id); return p.filter((_, j) => j !== i); })}
        onReady={() => api.practiceLaunch(mission.slug, picks, cls?.code).then(setResult)}
        readyLabel="TEST LAUNCH"
      />
    </>
  );
}

function ClassBoard({ cls }: { cls: ClassInfo }) {
  return (
    <section className="panel" style={{ maxWidth: 720, margin: "12px auto" }}>
      <h3>🏫 Class {cls.code} leaderboard <span className="muted small">same mission, same NASA data, same dice</span></h3>
      <table className="board">
        <thead><tr><th>#</th><th>Engineer</th><th>Best score</th><th>Science</th><th>Cost</th><th>Tries</th></tr></thead>
        <tbody>
          {cls.leaderboard.map((r, i) => (
            <tr key={r.username}><td>{i + 1}</td><td>{r.username}{r.success ? " ✓" : ""}</td><td className="mono">{r.score}</td>
              <td className="mono">{Math.round(r.science_pct * 100)}%</td><td className="mono">${Math.round(r.cost)}M</td><td className="mono">{r.attempts}</td></tr>
          ))}
          {cls.leaderboard.length === 0 && <tr><td colSpan={6} className="muted">No launches yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
