import { useEffect, useRef, useState } from "react";
import type { SimResult, TimelineEvent } from "../lib/types";

/**
 * 2D "mission replay". The server already decided what happens; this just
 * animates the timeline (t = 0..1) for each player in its own lane:
 *   0.00-0.15 ascent · 0.15-0.55 transfer arc · 0.55-0.62 insertion · 0.62-1.00 orbit/science
 */
const DURATION_MS = 14000;
const PLANET_COLOR: Record<string, string> = { Mars: "#d9643a", Venus: "#e8c27a", Moon: "#c9c9c9" };

interface Lane { label: string; result: SimResult; color: string }

function failT(r: SimResult): number | null {
  const f = r.timeline.find((e) => e.status === "fail");
  return f ? f.t : null;
}

function craftPos(t: number, w: number, h: number, y0: number) {
  const earth = { x: 70, y: y0 + h / 2 };
  const planet = { x: w - 90, y: y0 + h / 2 };
  if (t < 0.15) { // ascent: straight up out of Earth
    const k = t / 0.15;
    return { x: earth.x + 26 * k, y: earth.y - 34 * Math.sin(k * Math.PI / 2), angle: -Math.PI / 2 + k * 1.1 };
  }
  if (t < 0.6) { // Hohmann-ish arc
    const k = (t - 0.15) / 0.45;
    const sx = earth.x + 26, sy = earth.y - 34;
    const cx = (sx + planet.x) / 2, cy = y0 + 8;
    const ex = planet.x - 34, ey = planet.y - 6;
    const x = (1 - k) ** 2 * sx + 2 * (1 - k) * k * cx + k ** 2 * ex;
    const y = (1 - k) ** 2 * sy + 2 * (1 - k) * k * cy + k ** 2 * ey;
    const dx = 2 * (1 - k) * (cx - sx) + 2 * k * (ex - cx);
    const dy = 2 * (1 - k) * (cy - sy) + 2 * k * (ey - cy);
    return { x, y, angle: Math.atan2(dy, dx) };
  }
  // orbit around planet
  const a = (t - 0.6) * 40;
  return { x: planet.x + Math.cos(a) * 34, y: planet.y + Math.sin(a) * 20, angle: a + Math.PI / 2 };
}

export function LaunchSim({ lanes, destination, onDone }: { lanes: Lane[]; destination: string; onDone?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0);
  const stars = useRef(Array.from({ length: 140 }, () => [Math.random(), Math.random(), Math.random()]));

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const k = Math.min(1, (now - start) / DURATION_MS);
      setT(k);
      if (k < 1) raf = requestAnimationFrame(loop);
      else onDone?.();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const W = cv.width, H = cv.height;
    const laneH = H / lanes.length;
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, W, H);
    for (const [sx, sy, b] of stars.current) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + b * 0.6})`;
      ctx.fillRect(sx * W, sy * H, 1.5, 1.5);
    }

    lanes.forEach((lane, i) => {
      const y0 = i * laneH;
      if (i > 0) { ctx.strokeStyle = "#1c2140"; ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke(); }

      // Earth
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath(); ctx.arc(70, y0 + laneH / 2, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath(); ctx.arc(64, y0 + laneH / 2 - 6, 8, 0, Math.PI * 2); ctx.fill();
      // destination
      ctx.fillStyle = PLANET_COLOR[destination] ?? "#d9643a";
      ctx.beginPath(); ctx.arc(W - 90, y0 + laneH / 2, 18, 0, Math.PI * 2); ctx.fill();

      // lane label
      ctx.fillStyle = lane.color;
      ctx.font = "600 14px 'Space Grotesk', sans-serif";
      ctx.fillText(lane.label, 12, y0 + 20);

      const ft = failT(lane.result);
      const tt = ft !== null ? Math.min(t, ft) : t;
      // trail
      ctx.strokeStyle = lane.color + "88";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      for (let s = 0; s <= tt; s += 0.005) {
        const p = craftPos(Math.min(s, 0.6), W, laneH, y0);
        if (s === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const pos = craftPos(tt, W, laneH, y0);
      if (ft !== null && t >= ft) {
        // explosion / lost-signal burst
        const age = Math.min(1, (t - ft) * 12);
        ctx.fillStyle = `rgba(255,${120 - age * 100},40,${1 - age * 0.7})`;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 6 + age * 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff6b6b";
        ctx.font = "700 13px 'JetBrains Mono', monospace";
        ctx.fillText("✕ " + lane.result.outcome.toUpperCase(), pos.x - 60, pos.y - 26);
      } else {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(pos.angle);
        ctx.fillStyle = lane.color;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
        if (tt < 0.15) { ctx.fillStyle = "#ffb347"; ctx.fillRect(-12, -2, 6, 4); }
        ctx.restore();
        if (t > 0.62) { // data beam home
          ctx.strokeStyle = lane.color + "33";
          ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(70, y0 + laneH / 2); ctx.stroke();
        }
      }
    });
  }, [t, lanes, destination]);

  return (
    <div className="launch">
      <canvas ref={canvas} width={960} height={190 * lanes.length} />
      <div className="logs" style={{ gridTemplateColumns: `repeat(${lanes.length}, 1fr)` }}>
        {lanes.map((lane) => (
          <ol key={lane.label} className="log">
            <li className="log-head" style={{ color: lane.color }}>{lane.label}</li>
            {lane.result.timeline.filter((e: TimelineEvent) => e.t <= t + 0.001).map((e, i) => (
              <li key={i} className={e.status}><span className="mono">{e.phase}</span> {e.message}</li>
            ))}
          </ol>
        ))}
      </div>
    </div>
  );
}
