import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Category, Component, Mission, NasaSummary, Stats } from "../lib/types";
import { sfx } from "../lib/sfx";
import { Hangar3D } from "./Hangar3D";
import { EquationsPanel } from "./EquationsPanel";
import { NasaLive } from "./NasaLive";
import { StatsPanel } from "./StatsPanel";

const ORDER: Category[] = ["launch", "power", "battery", "instrument", "storage", "comms", "propulsion", "thermal"];
const ICON: Record<Category, string> = {
  launch: "🚀", power: "☀️", battery: "🔋", instrument: "🔭", storage: "💾", comms: "📡", propulsion: "🔥", thermal: "🌡️",
};

/** Estimated rocket price range for this expedition, from real launch prices and today's real C3. */
function LaunchRanges({ stats, destination }: { stats: Stats; destination: string }) {
  const opts = stats.launch_options;
  const range = (kg: number) => {
    const ok = opts.filter((o) => o.capacity_kg >= kg);
    return ok.length ? `$${Math.min(...ok.map((o) => o.price_low))}–${Math.max(...ok.map((o) => o.price_high))}M` : "no rocket can";
  };
  const mine = stats.launch_price_range;
  return (
    <div className="launch-ranges">
      <b>🚀 Rocket price to {destination} today:</b>
      <span>small probe 600 kg: {range(600)}</span>
      <span>orbiter 1.5 t: {range(1500)}</span>
      <span>large 4 t: {range(4000)}</span>
      {mine && stats.cost_breakdown.hardware > 0 && <span className="good-text">your {mine.mass_kg} kg: ${mine.low}–{mine.high}M ({mine.count} rockets)</span>}
    </div>
  );
}

function specLine(c: Component): string {
  const s = c.specs as Record<string, number | boolean | string | string[]>;
  switch (c.category) {
    case "launch": return `${s.thrust_kn} kN · ${s.payload_leo_kg} kg LEO · real price $${s.price_low}–${s.price_high}M`;
    case "power": return `${s.gen_w} W ${s.solar ? "@1 AU (solar)" : `constant + ${s.thermal_w} W heat (nuclear)`}`;
    case "battery": return `${s.battery_wh} Wh`;
    case "instrument": return `${s.data_gb_day} GB/day · ${(s.tags as string[]).join(", ")}`;
    case "storage": return `${s.storage_gb} GB`;
    case "comms": return `${s.downlink_mbps} Mbps @1 AU`;
    case "propulsion": return `Isp ${s.isp_s}s · ${s.propellant_kg} kg prop${s.cruise_power_w ? ` · ${s.cruise_power_w} W cruise` : ""}`;
    case "thermal": return s.insulation ? "insulation: blocks sun, stops heat leaking" : `rejects ${s.reject_w} W · cold leak ${s.cold_leak_w} W`;
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
  quiz?: ReactNode;
  onUnready?: () => void;
  onTimeout?: () => void;
  readyLabel?: string;
  nasa?: NasaSummary | null;
}

export function DraftBoard(p: Props) {
  const byId = useMemo(() => new Map(p.components.map((c) => [c.id, c])), [p.components]);
  const [now, setNow] = useState(Date.now() / 1000);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [showEq, setShowEq] = useState(true);

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
  const left = p.myStats ? p.myStats.budget_left : p.mission.budget - spent;
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
            <span className="chip" title="Total mission cost cap incl. launch, reserves and operations">Cost cap ${p.mission.budget}M</span>
            <span className="chip">{p.mission.days} days of ops</span>
            <span className="chip">Needs: {p.mission.required_tags.join(" or ")}</span>
            <span className="chip">Δv {p.mission.insertion_dv} m/s</span>
          </div>
          <NasaLive env={p.myStats?.env ?? p.opponent?.stats.env} destination={p.mission.destination} nasa={p.nasa} />
          {p.myStats?.launch_options?.length ? <LaunchRanges stats={p.myStats} destination={p.mission.destination} /> : null}
        </div>
        <div className="mission-right">
          {remaining !== null && (
            <div className={`timer ${remaining <= 20 ? "urgent" : ""}`}>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </div>
          )}
          <div className={`budget ${left < 0 ? "bad" : ""}`}>${left.toFixed(0)}M left</div>
          <button className={`launch-btn ${p.ready ? "armed" : ""}`}
                  onClick={() => { if (p.ready) { sfx.click(); p.onUnready?.(); } else { sfx.ready(); p.onReady(); } }}>
            {p.ready ? "Waiting… (click to edit)" : p.readyLabel ?? "LAUNCH"}
          </button>
        </div>
      </header>

      {p.quiz}
      <div className="center" style={{ margin: "8px 0" }}>
        <button className={showEq ? "on" : ""} onClick={() => setShowEq((v) => !v)}>
          📐 {showEq ? "Hide" : "Show"} the live equations (learn the real physics)
        </button>
      </div>
      {showEq && p.myStats && <EquationsPanel stats={p.myStats} mission={p.mission} />}

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
                            onClick={() => pick(c.id)} title={`${c.description}${c.specs.ref ? `\nSource: ${c.specs.ref}` : ""}`}>
                      <div className="card-top">
                        <span className="name">{c.name}</span>
                        <span className="cost" title={c.specs.ref === "estimate" ? "Our engineering estimate" : `Real figure: ${c.specs.ref ?? ""}`}>
                          ${c.cost < 10 ? c.cost.toFixed(1) : c.cost.toFixed(0)}M{c.specs.ref === "estimate" ? <small className="muted"> est.</small> : <small className="good-text"> ✓</small>}
                        </span>
                      </div>
                      <div className="spec mono">{specLine(c)}</div>
                      <div className="spec mono">
                        {c.mass > 0 ? `${c.mass} kg` : `${((c.specs.rocket_mass_t as number) ?? 0)} t rocket`}
                        {c.specs.mga ? ` (+${Math.round((c.specs.mga as number) * 100)}% MGA)` : ""}
                        {c.power_draw ? ` · ${c.power_draw} W` : ""} · {(c.reliability * 100).toFixed(1)}%
                      </div>
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
