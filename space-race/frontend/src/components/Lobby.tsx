import { useEffect, useRef, useState } from "react";
import { api, wsUrl } from "../lib/api";
import type { User } from "../lib/types";
import { sfx } from "../lib/sfx";
import { useSocket } from "../lib/useSocket";
import { useNasa } from "./NasaLive";
import { SpaceBackdrop } from "./SpaceBackdrop";

type Board = Awaited<ReturnType<typeof api.leaderboard>>;

const TAGLINES = [
  "Design a spacecraft. Draft against a rival. Survive real physics.",
  "Every kilogram costs you three times over.",
  "Live NASA data: today's real planets, launch windows and space weather.",
  "Δv = Isp · g₀ · ln(m_wet / m_dry). Learn it, or miss orbit.",
];

const FACTS = [
  "Light takes about 3 to 22 minutes to travel between Earth and Mars",
  "Opportunity was built for 90 sols and worked for over 14 years",
  "Voyager 1 has been flying since 1977 and is now in interstellar space",
  "Mars launch windows open about every 26 months",
  "Venera 13 survived 127 minutes on the 465 °C surface of Venus",
  "Juno flies on solar power at Jupiter, where sunlight is under 4% of Earth's",
  "Cassini needed four gravity assists to reach Saturn",
];

/** Smoothly count up to a number (for the telemetry readouts). */
function useCountUp(target: number | undefined, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === undefined || !Number.isFinite(target)) return;
    let raf = 0; const t0 = performance.now(); const from = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms); const e = 1 - (1 - k) ** 3;
      setV(from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Typewriter({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    const full = lines[i];
    const t = setTimeout(() => {
      if (n < full.length) setN(n + 1);
      else { setI((i + 1) % lines.length); setN(0); }
    }, n < full.length ? 28 : 2600);
    return () => clearTimeout(t);
  }, [i, n, lines]);
  return <p className="menu-type mono">{lines[i].slice(0, n)}<span className="caret">▌</span></p>;
}

function UtcClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="mono">{now.toISOString().slice(11, 19)} UTC</span>;
}

function Boot({ onDone }: { onDone: () => void }) {
  const steps = ["MISSION CONTROL OS v2026.11", "Linking JPL Horizons ephemeris…", "Querying NASA DONKI space weather…",
    "Loading launch vehicle catalogue…", "Arming flight dynamics simulator…", "ALL SYSTEMS GO"];
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= steps.length) { const t = setTimeout(onDone, 350); return () => clearTimeout(t); }
    const t = setTimeout(() => { setK(k + 1); if (k > 0) sfx.tick(); }, k === 0 ? 250 : 230);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return (
    <div className="boot" onClick={onDone}>
      <div className="boot-box mono">
        {steps.slice(0, k).map((s, i) => (
          <div key={i} className={i === steps.length - 1 ? "go" : ""}>{i === steps.length - 1 ? "▶ " : "› "}{s}{i < steps.length - 1 && <span className="ok"> [OK]</span>}</div>
        ))}
        <div className="boot-bar"><div style={{ width: `${(k / steps.length) * 100}%` }} /></div>
        <div className="muted small">click to skip</div>
      </div>
    </div>
  );
}

interface Mode { key: string; icon: string; title: string; desc: string; tag?: string; accent: string; run: () => void; disabled?: boolean; hero?: boolean }

export function Lobby({ me, onMatch, onPractice, onRover, onScience, onLogout, muted, onToggleMute }:
  { me: User; onMatch: (id: string) => void; onPractice: () => void; onRover: () => void; onScience: () => void;
    onLogout: () => void; muted: boolean; onToggleMute: () => void }) {
  const [online, setOnline] = useState<User[]>([]);
  const [queued, setQueued] = useState(false);
  const [board, setBoard] = useState<Board>([]);
  const [booting, setBooting] = useState(() => !sessionStorage.getItem("spacerace.booted"));
  const nasa = useNasa();

  const { send, connected } = useSocket(wsUrl("/ws/lobby/"), (msg) => {
    if (msg.type === "presence") setOnline(msg.users);
    if (msg.type === "queued") setQueued(true);
    if (msg.type === "cancelled") setQueued(false);
    if (msg.type === "match_found") { sfx.matchFound(); onMatch(msg.match_id); }
  });
  useEffect(() => { api.leaderboard().then(setBoard).catch(() => {}); }, []);

  const modes: Mode[] = [
    { key: "1", icon: "⚔️", title: queued ? "SEARCHING FOR RIVAL…" : "SPACE RACE · PvP", hero: true, accent: "#7dd3fc", tag: "LIVE",
      desc: queued ? "Click to cancel. Share your link so a friend can join!" : "Same mission, same budget, one shared pool of parts. Out-engineer a human rival.",
      disabled: !connected, run: () => { sfx.click(); send({ type: queued ? "cancel" : "find_match" }); } },
    { key: "2", icon: "🤖", title: "VS AI ENGINEER", accent: "#f472b6", desc: "A greedy AI drafts from the same pool and steals your last copies.",
      disabled: !connected || queued, run: () => { sfx.click(); send({ type: "play_ai" }); } },
    { key: "3", icon: "🚙", title: "ROVER EXPEDITION", accent: "#f97316", tag: "3D", desc: "Build a rover, then drive it on Mars, the Moon or Venus.",
      run: () => { sfx.click(); onRover(); } },
    { key: "4", icon: "🛰️", title: "SOLO LAB", accent: "#34d399", desc: "Practice freely, take Mission Control challenges, or join a class code.",
      run: () => { sfx.click(); onPractice(); } },
    { key: "5", icon: "🔬", title: "SCIENCE & DATA", accent: "#a78bfa", desc: "The real NASA data and the validation checks behind every equation.",
      run: () => { sfx.click(); onScience(); } },
  ];
  const modesRef = useRef(modes);
  modesRef.current = modes;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const m = modesRef.current.find((x) => x.key === e.key);
      if (m && !m.disabled) m.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wx = nasa?.space_weather;
  const mars = nasa?.planets?.Mars;
  const marsKm = useCountUp(mars?.earth_km);
  const lightMin = useCountUp(mars?.light_time_min);
  const sunMars = useCountUp(mars?.irradiance_w_m2);
  const ticker = [
    nasa ? `NASA DATA ${nasa.live ? "LIVE" : "CACHED"} · ${nasa.date}` : "CONNECTING TO NASA…",
    mars?.earth_km ? `EARTH → MARS ${(mars.earth_km / 1e6).toFixed(1)} MILLION KM` : null,
    wx ? `SPACE WEATHER ${wx.level.toUpperCase()}${wx.strongest_flare ? ` · STRONGEST FLARE ${wx.strongest_flare}` : ""}` : null,
    ...FACTS,
  ].filter(Boolean) as string[];

  return (
    <div className="menu">
      <SpaceBackdrop />
      <div className="menu-vignette" />
      <div className="menu-scan" />
      {booting && <Boot onDone={() => { sessionStorage.setItem("spacerace.booted", "1"); setBooting(false); sfx.chime(); }} />}

      <header className="menu-top">
        <div className="menu-brand"><span className="hex">⬡</span> MISSION CONTROL</div>
        <div className="menu-status">
          <span className={`chip-live ${nasa?.live ? "on" : ""}`}><i /> NASA {nasa ? (nasa.live ? "LIVE" : "CACHED") : "LINKING"}</span>
          <span className={`chip-live ${connected ? "on" : ""}`}><i /> UPLINK {connected ? "OK" : "…"}</span>
          <UtcClock />
        </div>
        <div className="menu-user">
          <span className="callsign">◉ {me.username}</span>
          <button className="ghost" onClick={onToggleMute} title="Sound">{muted ? "🔇" : "🔊"}</button>
          <button className="ghost" onClick={onLogout}>Log out</button>
        </div>
      </header>

      <main className="menu-main">
        <section className="menu-left">
          <div className="eyebrow-holo">NASA SPACE APPS 2026 · SPACE MISSION DESIGN GAME</div>
          <h1 className="glitch" data-text="THE SPACE RACE">THE SPACE RACE</h1>
          <Typewriter lines={TAGLINES} />
          <div className="mode-grid">
            {modes.map((m) => (
              <button key={m.key} className={`mode-card ${m.hero ? "hero" : ""} ${queued && m.hero ? "searching" : ""}`}
                      style={{ ["--mc" as string]: m.accent }} disabled={m.disabled}
                      onMouseEnter={() => !m.disabled && sfx.tick()} onClick={m.run}>
                <span className="mc-key mono">[{m.key}]</span>
                {m.tag && <span className="mc-tag">{m.tag}</span>}
                <span className="mc-icon">{queued && m.hero ? <span className="radar" /> : m.icon}</span>
                <span className="mc-title">{m.title}</span>
                <span className="mc-desc">{m.desc}</span>
                <span className="mc-go">ENGAGE →</span>
              </button>
            ))}
          </div>
          {!connected && <p className="muted small">Connecting to Mission Control…</p>}
        </section>

        <aside className="menu-right">
          <div className="holo">
            <div className="holo-title">📡 LIVE FROM NASA <span className="muted">· {nasa?.date ?? "—"}</span></div>
            <div className="telemetry">
              <div><span>EARTH ↔ MARS</span><b className="mono">{mars?.earth_km ? `${(marsKm / 1e6).toFixed(1)}M km` : "—"}</b></div>
              <div><span>SIGNAL DELAY</span><b className="mono">{mars?.light_time_min ? `${lightMin.toFixed(1)} min` : "—"}</b></div>
              <div><span>SUNLIGHT AT MARS</span><b className="mono">{mars?.irradiance_w_m2 ? `${sunMars.toFixed(0)} W/m²` : "—"}</b></div>
              <div><span>SPACE WEATHER</span><b className={`mono wx-${wx?.level ?? "na"}`}>{wx ? wx.level.toUpperCase() : "—"}</b></div>
              <div><span>SOLAR FLARES (X/M/C)</span><b className="mono">{wx ? `${wx.flares.X}/${wx.flares.M}/${wx.flares.C}` : "—"}</b></div>
              <div><span>Kp MAX</span><b className="mono">{wx ? wx.kp_max : "—"}</b></div>
            </div>
            <div className="muted small">Sources: JPL Horizons · NASA DONKI. Every match flies in today's real conditions.</div>
          </div>

          <div className="holo">
            <div className="holo-title">🛰 PILOTS ONLINE <span className="count">{online.length}</span></div>
            <ul className="pilots">
              {online.slice(0, 8).map((u) => <li key={u.id}><i className="dot" /> {u.username}{u.id === me.id && <span className="muted"> (you)</span>}</li>)}
              {online.length === 0 && <li className="muted">Scanning…</li>}
            </ul>
          </div>

          <div className="holo">
            <div className="holo-title">🏆 TOP ENGINEERS</div>
            <ol className="top-eng">
              {board.slice(0, 5).map((r, i) => (
                <li key={r.username}><span className={`rank r${i + 1}`}>{i + 1}</span><span className="name">{r.username}</span>
                  <span className="mono">{r.rating}</span></li>
              ))}
              {board.length === 0 && <li className="muted">No flights yet. Be the first legend.</li>}
            </ol>
          </div>
        </aside>
      </main>

      <footer className="menu-ticker">
        <div className="ticker-track mono">
          {[...ticker, ...ticker].map((t, i) => <span key={i}>◆ {t}</span>)}
        </div>
      </footer>
    </div>
  );
}
