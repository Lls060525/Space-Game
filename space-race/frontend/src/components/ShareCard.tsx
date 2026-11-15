import { useEffect, useState } from "react";
import { sfx } from "../lib/sfx";

/**
 * Shareable result card: renders a 1200×630 image (the size social networks preview) with the
 * player's result, plus Share / Download / Copy buttons. Pure canvas, no server needed.
 */
export interface ResultShare {
  mode: string;                       // "MISSION DESIGN" | "ROVER EXPEDITION"
  planet: string;
  headline: string;                   // "Reached Mars orbit" / "Ran out of Δv"
  good: boolean;
  score: number;
  stats: { label: string; value: string }[];
  text: string;                       // the message that goes with the image
  player: string;
}

const PLANET: Record<string, [string, string]> = {
  Mars: ["#f08a5d", "#7c2d12"], Venus: ["#f8dfa0", "#a16207"], Moon: ["#e5e7eb", "#4b5563"], Earth: ["#60a5fa", "#1e3a8a"],
};
const W = 1200, H = 630;

async function render(d: ResultShare): Promise<Blob> {
  try { await document.fonts?.ready; } catch { /* fonts optional */ }
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  // background + nebula + stars
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#04061a"); bg.addColorStop(1, "#160b33");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const neb = x.createRadialGradient(260, 120, 0, 260, 120, 420);
  neb.addColorStop(0, "rgba(125,211,252,0.18)"); neb.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = neb; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    x.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.7})`;
    const s = Math.random() < 0.1 ? 2 : 1;
    x.fillRect(Math.random() * W, Math.random() * H, s, s);
  }
  // planet with atmosphere glow + orbit ring
  const [c1, c2] = PLANET[d.planet] ?? PLANET.Earth;
  const px = 1010, py = 330, pr = 230;
  const glow = x.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.35);
  glow.addColorStop(0, c1 + "66"); glow.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = glow; x.beginPath(); x.arc(px, py, pr * 1.35, 0, 7); x.fill();
  const pg = x.createRadialGradient(px - 80, py - 80, 20, px, py, pr);
  pg.addColorStop(0, c1); pg.addColorStop(1, c2);
  x.fillStyle = pg; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
  x.strokeStyle = "rgba(251,191,36,0.55)"; x.setLineDash([10, 8]); x.lineWidth = 3;
  x.beginPath(); x.ellipse(px, py, pr * 1.25, pr * 0.42, -0.3, 0, 7); x.stroke(); x.setLineDash([]);
  // fade so text stays readable
  const fade = x.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, "rgba(4,6,26,0.95)"); fade.addColorStop(0.62, "rgba(4,6,26,0.55)"); fade.addColorStop(1, "rgba(4,6,26,0)");
  x.fillStyle = fade; x.fillRect(0, 0, W, H);

  const font = (w: number, s: number, mono = false) => `${w} ${s}px ${mono ? "'JetBrains Mono', monospace" : "'Space Grotesk', system-ui, sans-serif"}`;
  // header
  x.fillStyle = "#7dd3fc"; x.font = font(700, 22); x.fillText("T H E   S P A C E   R A C E", 64, 76);
  x.fillStyle = "#94a3c8"; x.font = font(600, 18, true); x.fillText(`${d.mode} · ${d.planet.toUpperCase()}`, 64, 108);
  // headline
  x.fillStyle = d.good ? "#34d399" : "#f87171"; x.font = font(700, 54);
  wrap(x, d.headline, 64, 190, 660, 60);
  // score
  const sg = x.createLinearGradient(64, 0, 600, 0);
  sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.5, "#7dd3fc"); sg.addColorStop(1, "#f472b6");
  x.fillStyle = sg; x.font = font(700, 128);
  x.fillText(d.score.toLocaleString(), 60, 375);
  const sw = x.measureText(d.score.toLocaleString()).width;
  x.fillStyle = "#94a3c8"; x.font = font(600, 30); x.fillText("pts", 74 + sw, 375);
  // stat chips
  let cx = 64;
  for (const s of d.stats.slice(0, 4)) {
    x.font = font(700, 26, true);
    const vw = x.measureText(s.value).width;
    x.font = font(600, 13);
    const lw = x.measureText(s.label.toUpperCase()).width;
    const w = Math.max(vw, lw) + 32;
    if (cx + w > 760) break;
    x.fillStyle = "rgba(125,211,252,0.08)"; x.strokeStyle = "rgba(125,211,252,0.45)"; x.lineWidth = 1.5;
    roundRect(x, cx, 420, w, 78, 10); x.fill(); x.stroke();
    x.fillStyle = "#94a3c8"; x.fillText(s.label.toUpperCase(), cx + 16, 446);
    x.fillStyle = "#e6f6ff"; x.font = font(700, 26, true); x.fillText(s.value, cx + 16, 482);
    cx += w + 12;
  }
  // footer
  x.fillStyle = "#fbbf24"; x.font = font(700, 26); x.fillText("Can you beat it?", 64, 566);
  x.fillStyle = "#94a3c8"; x.font = font(600, 18, true);
  x.fillText(`${d.player} · ${location.host}`, 64, 598);
  x.textAlign = "right"; x.fillStyle = "#7dd3fc"; x.font = font(600, 16);
  x.fillText("NASA Space Apps Challenge 2026", W - 40, H - 32);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

function wrap(x: CanvasRenderingContext2D, text: string, tx: number, ty: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "", y = ty, lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (x.measureText(test).width > maxW && line) { x.fillText(line, tx, y); line = w; y += lh; if (++lines >= 1) break; }
    else line = test;
  }
  if (line) x.fillText(line, tx, y);
}
function roundRect(x: CanvasRenderingContext2D, rx: number, ry: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(rx + r, ry); x.arcTo(rx + w, ry, rx + w, ry + h, r); x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r); x.arcTo(rx, ry, rx + w, ry, r); x.closePath();
}

export function ShareCard({ data }: { data: ResultShare }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const fullText = `${data.text}\n${location.origin}`;

  useEffect(() => {
    let u: string | null = null;
    render(data).then((b) => { setBlob(b); u = URL.createObjectURL(b); setUrl(u); });
    return () => { if (u) URL.revokeObjectURL(u); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.text, data.score]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2200); };
  const fileName = `space-race-${data.planet.toLowerCase()}-${data.score}.png`;

  const share = async () => {
    sfx.click();
    try {
      const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
      const nav = navigator as Navigator & { canShare?: (d: object) => boolean };
      if (file && nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "The Space Race", text: fullText });
      } else if (nav.share) {
        await nav.share({ title: "The Space Race", text: data.text, url: location.origin });
      } else {
        await navigator.clipboard.writeText(fullText);
        flash("Copied! Paste it anywhere.");
      }
    } catch { /* user cancelled */ }
  };
  const download = () => {
    if (!url) return;
    sfx.click();
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    flash("Image saved.");
  };
  const copy = async () => {
    sfx.click();
    try { await navigator.clipboard.writeText(fullText); flash("Text copied!"); } catch { flash("Couldn't copy: select the text below."); }
  };

  return (
    <section className="share-card">
      <div className="share-head">📣 <b>Share your result</b> <span className="muted small">challenge your friends</span></div>
      {url ? <img src={url} alt={data.text} className="share-preview" /> : <div className="share-preview loading">Rendering card…</div>}
      <p className="share-text small">{data.text}</p>
      <div className="row share-actions">
        <button className="primary" onClick={share} disabled={!blob}>📤 Share</button>
        <button onClick={download} disabled={!url}>⬇ Download image</button>
        <button onClick={copy}>📋 Copy text</button>
        {msg && <span className="good-text small">{msg}</span>}
      </div>
    </section>
  );
}
