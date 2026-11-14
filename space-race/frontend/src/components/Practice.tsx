import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Component, Mission, SimResult, Stats } from "../lib/types";
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

  useEffect(() => { api.missions().then((m) => { setMissions(m); setMission(m[0]); }); }, []);
  useEffect(() => {
    if (!mission) return;
    const t = setTimeout(() => api.analyze(mission.slug, picks).then(setStats), 120);
    return () => clearTimeout(t);
  }, [mission, picks]);

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
          ? <Results rows={lanes} myResultWon={result.success} backLabel="Back to drafting board"
                     onBack={() => { setResult(null); setAnimDone(false); }} />
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
        {missions.map((m) => (
          <button key={m.slug} className={m.slug === mission.slug ? "on" : ""}
                  onClick={() => { setMission(m); setPicks([]); }}>{m.destination}</button>
        ))}
      </div>
      <DraftBoard
        mission={mission} components={components} pool={pool} myPicks={picks} myStats={stats} ready={false}
        onPick={(id) => setPicks((p) => [...p, id])}
        onRelease={(id) => setPicks((p) => { const i = p.indexOf(id); return p.filter((_, j) => j !== i); })}
        onReady={() => api.practiceLaunch(mission.slug, picks).then(setResult)}
        readyLabel="TEST LAUNCH"
      />
    </>
  );
}
