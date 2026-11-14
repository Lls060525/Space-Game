import { useEffect, useMemo, useState } from "react";
import type { Category, Component, Mission, Stats } from "../lib/types";
import { sfx } from "../lib/sfx";
import { Hangar3D } from "./Hangar3D";
import { StatsPanel } from "./StatsPanel";

const ORDER: Category[] = ["launch", "power", "battery", "instrument", "storage", "comms", "propulsion", "thermal"];
const ICON: Record<Category, string> = {
  launch: "🚀", power: "☀️", battery: "🔋", instrument: "🔭", storage: "💾", comms: "📡", propulsion: "🔥", thermal: "🌡️",
};

function specLine(c: Component): string {
  const s = c.specs as Record<string, number | boolean | string[]>;
  switch (c.category) {
    case "launch": return `${s.thrust_kn} kN · ${s.payload_leo_kg} kg to LEO`;
    case "power": return `${s.gen_w} W ${s.solar ? "@1 AU (solar)" : "constant (nuclear)"}`;
    case "battery": return `${s.battery_wh} Wh`;
    case "instrument": return `${s.data_gb_day} GB/day · ${(s.tags as string[]).join(", ")}`;
    case "storage": return `${s.storage_gb} GB`;
    case "comms": return `${s.downlink_mbps} Mbps @1 AU`;
    case "propulsion": return `Isp ${s.isp_s}s · ${s.propellant_kg} kg prop${s.cruise_power_w ? ` · ${s.cruise_power_w} W cruise` : ""}`;
    case "thermal": return `rating ${s.thermal_rating}`;
  }
}

export interface Opponent { username: string; picks: number[]; ready: boolean; stats: Stats; online?: boolean; feed?: { id: number; text: string }[] }

interface Props {
  mission: Mission;
  components: Component[];
  pool: Record<string, number>;
  myPicks: number[];
  myStats: Stats | null;
  ready: boolean;
  opponent?: Opponent;
  deadline?: number;      // epoch seconds (client clock)
  onPick: (id: number) => void;
  onRelease: (id: number) => void;
  onReady: () => void;
  onUnready?: () => void;
  onTimeout?: () => void;
  readyLabel?: string;
}

export function DraftBoard(p: Props) {
  const byId = useMemo(() => new Map(p.components.map((c) => [c.id, c])), [p.components]);
  const [now, setNow] = useState(Date.now() / 1000);
  const [filter, setFilter] = useState<Category | "all">("all");

  useEffect(() => {
    if (!p.deadline) return;
    const t = setInterval(() => setNow(Date.now() / 1000), 250);
    return () => clearInterval(t);
  }, [p.deadline]);

  const remaining = p.deadline ? Math.max(0, Math.ceil(p.deadline - now)) : null;
  useEffect(() => {
    if (remaining !== null && remaining > 0 && remaining <= 10) sfx.tick();
  }, [remaining]);
  useEffect(() => {
    if (remaining === 0) p.onTimeout?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === 0]);

  const spent = p.myPicks.reduce((sum, id) => sum + (byId.get(id)?.cost ?? 0), 0);
  const left = p.mission.budget - spent;
  const opponentPicks = new Set(p.opponent?.picks ?? []);
  const myParts = useMemo(() => p.myPicks.map((id) => byId.get(id)).filter((c): c is Component => !!c), [p.myPicks, byId]);
  const pick = (id: number) => { sfx.pick(); p.onPick(id); };
  const release = (id: number) => { sfx.release(); p.onRelease(id); };

  return (
    <div className="draft">
      <header className="mission-card">
        <div>
          <div className="eyebrow">Mission · {p.mission.destination}</div>
          <h2>{p.mission.name}</h2>
          <p>{p.mission.objective}</p>
          <div className="chips">
            <span className="chip">Budget ${p.mission.budget}M</span>
            <span className="chip">{p.mission.days} days of ops</span>
            <span className="chip">Needs: {p.mission.required_tags.join(" or ")}</span>
            <span className="chip">Thermal ≥ {p.mission.thermal_req}</span>
            <span className="chip">Δv {p.mission.insertion_dv} m/s</span>
          </div>
        </div>
        <div className="mission-right">
          {remaining !== null && (
            <div className={`timer ${remaining <= 20 ? "urgent" : ""}`}>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </div>
          )}
          <div className={`budget ${left < 0 ? "bad" : ""}`}>${left}M left</div>
          <button className={`launch-btn ${p.ready ? "armed" : ""}`}
                  onClick={() => { if (p.ready) { sfx.click(); p.onUnready?.(); } else { sfx.ready(); p.onReady(); } }}>
            {p.ready ? "Waiting… (click to edit)" : p.readyLabel ?? "LAUNCH"}
          </button>
        </div>
      </header>

      <div className="draft-grid">
        {/* ---------- catalog / shared pool ---------- */}
        <section className="catalog">
          <div className="tabs">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
            {ORDER.map((c) => (
              <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>{ICON[c]}</button>
            ))}
          </div>
          {ORDER.filter((cat) => filter === "all" || filter === cat).map((cat) => (
            <div key={cat} className="cat-block">
              <h4>{ICON[cat]} {p.components.find((c) => c.category === cat)?.category_label}</h4>
              <div className="cards">
                {p.components.filter((c) => c.category === cat).map((c) => {
                  const stock = p.pool[String(c.id)] ?? 0;
                  const soldOut = stock <= 0;
                  const tooPricey = c.cost > left;
                  return (
                    <button key={c.id} className={`card ${soldOut ? "sold" : ""} ${opponentPicks.has(c.id) ? "rival" : ""}`}
                            disabled={soldOut || tooPricey || p.ready}
                            onClick={() => pick(c.id)} title={c.description}>
                      <div className="card-top">
                        <span className="name">{c.name}</span>
                        <span className="cost">${c.cost}M</span>
                      </div>
                      <div className="spec mono">{specLine(c)}</div>
                      <div className="spec mono">{c.mass} kg{c.power_draw ? ` · ${c.power_draw} W` : ""} · {(c.reliability * 100).toFixed(1)}%</div>
                      <div className="stock">{soldOut ? "SOLD OUT" : `${stock} left in pool`}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* ---------- my build ---------- */}
        <section className="build">
          <h3>Your spacecraft <span className="muted small">drag to rotate</span></h3>
          <Hangar3D parts={myParts} />
          <ul className="picks">
            {p.myPicks.length === 0 && <li className="muted">Pick parts from the pool →</li>}
            {p.myPicks.map((id, i) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <li key={`${id}-${i}`}>
                  <span>{ICON[c.category]} {c.name}</span>
                  <button disabled={p.ready} onClick={() => release(id)}>✕</button>
                </li>
              );
            })}
          </ul>
          {p.myStats && <StatsPanel stats={p.myStats} />}
        </section>

        {/* ---------- rival ---------- */}
        {p.opponent && (
          <section className="rival-panel">
            <h3>
              {p.opponent.username}
              {p.opponent.online === false && <span className="badge bad">offline</span>}
              {p.opponent.ready && <span className="badge good">READY</span>}
            </h3>
            {p.opponent.feed && p.opponent.feed.length > 0 && (
              <ul className="feed">
                {p.opponent.feed.map((f) => <li key={f.id}>{f.text}</li>)}
              </ul>
            )}
            <ul className="picks small">
              {p.opponent.picks.map((id, i) => {
                const c = byId.get(id);
                return c ? <li key={`${id}-${i}`}>{ICON[c.category]} {c.name}</li> : null;
              })}
            </ul>
            <StatsPanel stats={p.opponent.stats} compact />
          </section>
        )}
      </div>
    </div>
  );
}
