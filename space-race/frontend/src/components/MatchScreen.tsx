import { useRef, useState } from "react";
import { sfx } from "../lib/sfx";
import { wsUrl } from "../lib/api";
import type { Component, MatchState, SimResult, User } from "../lib/types";
import { useSocket } from "../lib/useSocket";
import { DraftBoard } from "./DraftBoard";
import { Launch3D } from "./Launch3D";
import { QuizPanel, type QuizFeedback } from "./QuizPanel";
import { Results } from "./Results";

const ME = "#7dd3fc";
const RIVAL = "#f472b6";

export function MatchScreen({ matchId, me, components, onExit }:
  { matchId: string; me: User; components: Component[]; onExit: () => void }) {
  const [state, setState] = useState<MatchState | null>(null);
  const [results, setResults] = useState<Record<string, SimResult> | null>(null);
  const [forfeitBy, setForfeitBy] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);
  const [error, setError] = useState("");
  const [rivalOnline, setRivalOnline] = useState(true);
  const [quizFb, setQuizFb] = useState<QuizFeedback | null>(null);
  const clockOffset = useRef(0); // server_time - client_time
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([]);
  const prevRival = useRef<number[] | null>(null);
  const feedId = useRef(0);
  const byId = new Map(components.map((c) => [c.id, c]));

  // diff the rival's picks to build a live "they just grabbed X" feed
  function trackRival(s: MatchState) {
    const rid = Object.keys(s.players).find((k) => k !== String(me.id));
    if (!rid) return;
    const now = s.players[rid].picks;
    const before = prevRival.current;
    prevRival.current = [...now];
    if (!before) return;
    const added = now.filter((id, i) => now.slice(0, i + 1).filter((x) => x === id).length > before.filter((x) => x === id).length);
    for (const id of added) {
      const c = byId.get(id);
      if (!c) continue;
      const last = (s.pool[String(id)] ?? 0) === 0;
      if (last) sfx.steal();
      const text = last ? `⚡ took the LAST ${c.name}!` : `grabbed ${c.name}`;
      const fid = ++feedId.current;
      setFeed((f) => [{ id: fid, text }, ...f].slice(0, 5));
    }
  }

  const { send } = useSocket(wsUrl(`/ws/match/${matchId}/`), (msg) => {
    if (msg.type === "state" || msg.type === "result") {
      clockOffset.current = msg.state.server_time - Date.now() / 1000;
      trackRival(msg.state);
      setState(msg.state);
      setError("");
    }
    if (msg.type === "quiz_result") {
      setQuizFb(msg);
      msg.correct ? sfx.ready() : sfx.error();
    }
    if (msg.type === "result") {
      const { forfeit_by, ...rest } = msg.results;
      if (forfeit_by) setForfeitBy(forfeit_by);
      else setResults(rest as Record<string, SimResult>);
      setWinnerId(msg.winner_id);
    }
    if (msg.type === "error") { sfx.error(); setError(msg.message); setTimeout(() => setError(""), 3000); }
    if (msg.type === "opponent_status") setRivalOnline(msg.online);
  });

  if (!state) return <div className="center muted">Docking with match {matchId.slice(0, 8)}…</div>;

  const myId = String(me.id);
  const rivalId = Object.keys(state.players).find((k) => k !== myId)!;
  const mine = state.players[myId];
  const rival = state.players[rivalId];

  if (forfeitBy) {
    return (
      <div className="center panel">
        <h2>{forfeitBy === myId ? "You abandoned the mission." : `${rival.username} scrubbed their launch. You win!`}</h2>
        <button className="primary" onClick={onExit}>Back to lobby</button>
      </div>
    );
  }

  if (results) {
    const partsOf = (ids: number[]) => ids.map((id) => byId.get(id)).filter((c): c is Component => !!c);
    const lanes = [
      { label: `${mine.username} (you)`, result: results[myId], color: ME, parts: partsOf(mine.picks) },
      { label: rival.username, result: results[rivalId], color: RIVAL, parts: partsOf(rival.picks) },
    ];
    return (
      <div className="launch-screen">
        {animDone
          ? <>
              <h2 className="center">{state.mission.name}</h2>
              <Results onBack={onExit} myResultWon={winnerId === me.id} destination={state.mission.destination} player={me.username}
                       rows={lanes.map((l, i) => ({
                ...l, winner: winnerId === (i === 0 ? me.id : Number(rivalId)) }))} />
            </>
          : <>
              <Launch3D lanes={lanes} destination={state.mission.destination} onDone={() => setAnimDone(true)} />
              <div className="center"><button onClick={() => setAnimDone(true)}>Skip to results</button></div>
            </>}
      </div>
    );
  }

  return (
    <>
      {error && <div className="toast">{error}</div>}
      <DraftBoard
        mission={state.mission}
        components={components}
        pool={state.pool}
        myPicks={mine.picks}
        myStats={mine.stats}
        nasa={state.nasa}
        ready={mine.ready}
        opponent={{ ...rival, online: rivalOnline, feed }}
        deadline={state.deadline - clockOffset.current}
        onPick={(id) => send({ type: "pick", component_id: id })}
        onRelease={(id) => send({ type: "release", component_id: id })}
        onReady={() => send({ type: "ready" })}
        onUnready={() => send({ type: "unready" })}
        onTimeout={() => send({ type: "tick" })}
        quiz={state.quiz?.length ? (
          <QuizPanel questions={state.quiz} idx={mine.quiz?.idx ?? 0} correct={mine.quiz?.correct ?? 0}
                     bonus={mine.quiz?.bonus ?? 0} perQuestion={state.quiz_bonus ?? 10} feedback={quizFb}
                     onAnswer={(q, choice) => send({ type: "quiz", question_id: q.id, choice })}
                     onDismiss={() => setQuizFb(null)} />
        ) : null}
      />
      <div className="center"><button className="link" onClick={() => { send({ type: "forfeit" }); }}>Abandon mission</button></div>
    </>
  );
}
