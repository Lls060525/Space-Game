import { useEffect, useMemo, useState } from "react";
import { api, type ClassInfo } from "../lib/api";
import type { Component, Mission, SimResult, Stats } from "../lib/types";
import { Coach } from "./Coach";
import { DraftBoard } from "./DraftBoard";
import { Launch3D } from "./Launch3D";
import { QuizPanel, type QuizFeedback } from "./QuizPanel";
import { sfx } from "../lib/sfx";
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
  // Mission Control challenges (solo): graded in the browser, bonus raises the practice cost cap
  type PQ = Awaited<ReturnType<typeof api.quizPractice>>["questions"][number];
  const [quizQs, setQuizQs] = useState<PQ[]>([]);
  const [quizPer, setQuizPer] = useState(10);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizRight, setQuizRight] = useState(0);
  const [quizFb, setQuizFb] = useState<QuizFeedback | null>(null);
  const bonus = cls ? 0 : quizRight * quizPer;
  const newQuiz = () => api.quizPractice().then((r) => { setQuizQs(r.questions); setQuizPer(r.bonus); setQuizIdx(0); setQuizRight(0); setQuizFb(null); }).catch(() => {});
  useEffect(() => { newQuiz(); }, []);
  const answer = (qid: string, choice: number) => {
    const q = quizQs.find((x) => x.id === qid);
    if (!q) return;
    const correct = choice === q.answer;
    correct ? sfx.ready() : sfx.error();
    if (correct) setQuizRight((n) => n + 1);
    setQuizIdx((i) => i + 1);
    setQuizFb({ question_id: q.id, choice, answer: q.answer, correct, explain: q.explain, bonus: correct ? quizPer : 0 });
  };
  const joinClass = (code: string) => api.getClass(code.trim().toUpperCase()).then((c) => {
    setCls(c); setClsMsg(""); setPicks([]);
    const m = missions.find((x) => x.slug === c.mission); if (m) setMission(m);
  }).catch((e) => setClsMsg(String(e.message ?? e)));
  const refreshClass = () => { if (cls) api.getClass(cls.code).then(setCls).catch(() => {}); };

  useEffect(() => { api.missions().then((m) => { setMissions(m); setMission(m[0]); }); }, []);
  useEffect(() => {
    if (!mission) return;
    const t = setTimeout(() => api.analyze(mission.slug, picks, cls?.code, bonus).then(setStats), 120);
    return () => clearTimeout(t);
  }, [mission, picks, cls, bonus]);

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
              <Results rows={lanes} myResultWon={result.success} backLabel="Back to drafting board" destination={mission.destination}
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
        onReady={() => api.practiceLaunch(mission.slug, picks, cls?.code, bonus).then(setResult)}
        readyLabel="TEST LAUNCH"
        quiz={cls ? null : (
          <>
            <QuizPanel questions={quizQs} idx={quizIdx} correct={quizRight} bonus={bonus} perQuestion={quizPer}
                       feedback={quizFb} onAnswer={(q, choice) => answer(q.id, choice)} onDismiss={() => setQuizFb(null)} />
            {quizIdx >= quizQs.length && quizQs.length > 0 && !quizFb && (
              <div className="center"><button className="link" onClick={newQuiz}>🔁 New set of challenges (resets the bonus)</button></div>
            )}
          </>
        )}
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
