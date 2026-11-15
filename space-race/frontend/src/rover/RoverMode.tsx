import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { sfx } from "../lib/sfx";
import {
  DEFAULT_BUILD, roverStats, siteTime, sunElevation, type Build, type LiveSun, type RoverPlanet, type RoverSite,
} from "./parts";
import { RoverDrive, type DriveResult } from "./RoverDrive";
import { RoverGarage } from "./RoverGarage";

type Phase = "garage" | "drive" | "result";
type Board = Awaited<ReturnType<typeof api.roverScores>>;

const bestKey = (p: RoverPlanet) => `spacerace.rover.best.${p}`;

export function RoverMode({ onExit }: { onExit: () => void }) {
  const [planet, setPlanet] = useState<RoverPlanet>("Mars");
  const [build, setBuild] = useState<Build>(() => {
    try { return JSON.parse(localStorage.getItem("spacerace.rover.build") ?? "") as Build; } catch { return DEFAULT_BUILD; }
  });
  const [phase, setPhase] = useState<Phase>("garage");
  const [result, setResult] = useState<DriveResult | null>(null);
  const [board, setBoard] = useState<Board>([]);
  const [run, setRun] = useState(0);
  const best = Number(localStorage.getItem(bestKey(planet)) ?? 0);
  const [live, setLive] = useState<LiveSun | undefined>();
  const [activity, setActivity] = useState(1.5);
  const [wxNote, setWxNote] = useState<string>();
  const [sites, setSites] = useState<Partial<Record<RoverPlanet, RoverSite>>>({});
  const [schedule, setSchedule] = useState<"now" | "morning">("now");
  const site = sites[planet];
  const nowT = siteTime(site);
  const offsetH = schedule === "morning" && nowT !== null ? (((9 - nowT) % 24) + 24) % 24 : 0;
  useEffect(() => {
    api.nasa().then((c) => {
      if (c.live) setLive(c.planets);
      if (c.sites) setSites(c.sites);
      setActivity(c.space_weather.activity_index);
      setWxNote(`Space weather (NASA DONKI, 30 days): ${c.space_weather.level}, ${c.space_weather.flares.X} X / ${c.space_weather.flares.M} M flares, ${c.space_weather.sep_events} SEP events.`);
    }).catch(() => {});
  }, []);
  const stats = useMemo(() => roverStats(build, planet, live, sunElevation(site, siteTime(site, 0, offsetH))),
    [build, planet, live, site, offsetH]);

  useEffect(() => { localStorage.setItem("spacerace.rover.build", JSON.stringify(build)); }, [build]);
  useEffect(() => { api.roverScores(planet).then(setBoard).catch(() => setBoard([])); }, [planet, phase]);

  const finish = (r: DriveResult) => {
    setResult(r);
    setPhase("result");
    const newBest = r.score > best;
    if (newBest) localStorage.setItem(bestKey(planet), String(r.score));
    if (r.score > 0) api.submitRover({ planet, score: r.score, samples: r.collected, build }).catch(() => {});
    r.survived ? sfx.fanfare() : sfx.sad();
  };

  if (phase === "drive") {
    return <RoverDrive key={run} planet={planet} build={build} onEnd={finish} live={live} activity={activity}
                       site={site} offsetH={offsetH} />;
  }

  if (phase === "result" && result) {
    const newBest = result.score >= best && result.score > 0;
    return (
      <div className="rover-result">
        <div className={`verdict ${result.survived ? "good" : "bad"}`}>{result.reason.toUpperCase()}</div>
        {newBest && <div className="new-best">★ NEW PERSONAL BEST ★</div>}
        <div className="result-cards">
          <div className="result-card" style={{ borderColor: "var(--accent)" }}>
            <h3>{planet} expedition</h3>
            <div className="score mono">{result.score} pts</div>
            <dl>
              <dt>Science banked</dt><dd>{result.banked}</dd>
              {result.lostCargo > 0 && <><dt>Lost (not delivered)</dt><dd className="bad-text">{result.lostCargo}</dd></>}
              <dt>Samples collected</dt><dd>{result.collected}</dd>
              <dt>Legendary finds</dt><dd>{result.legendary}</dd>
              <dt>Distance driven</dt><dd>{result.distance} m</dd>
              <dt>Longest air time</dt><dd>{result.maxAir}s</dd>
              <dt>Survival bonus</dt><dd>{result.survived ? "yes" : "no"}</dd>
            </dl>
            {result.lostCargo > 0 && <p className="muted small">Tip: science only counts when its data reaches Earth. A High-Gain Antenna sends it from anywhere while Earth is above the horizon; otherwise drive back to the lander relay.</p>}
            {!stats.cooling && planet === "Venus" && <p className="muted small">Tip: Venus needs a Cooling Loop.</p>}
          </div>
          <div className="result-card" style={{ borderColor: "var(--warn)" }}>
            <h3>🏆 {planet} leaderboard</h3>
            <table className="board">
              <tbody>
                {board.map((b, i) => <tr key={i}><td>{i + 1}</td><td>{b.username}</td><td className="mono">{b.score}</td></tr>)}
                {board.length === 0 && <tr><td className="muted">No scores yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="center row" style={{ justifyContent: "center" }}>
          <button className="primary big" onClick={() => { setRun((r) => r + 1); setPhase("drive"); }}>Drive again</button>
          <button className="big" onClick={() => setPhase("garage")}>Tune rover</button>
          <button className="big" onClick={onExit}>Lobby</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="practice-bar">
        <button className="link" onClick={onExit}>← Lobby</button>
        <h2 style={{ margin: 0 }}>🚙 Rover Expedition</h2>
      </div>
      <RoverGarage planet={planet} setPlanet={setPlanet} build={build} setBuild={setBuild} best={best} live={live} nasaNote={wxNote}
                   site={site} offsetH={offsetH} schedule={schedule} setSchedule={setSchedule}
                   onDeploy={() => { setRun((r) => r + 1); setPhase("drive"); }} />
    </>
  );
}
