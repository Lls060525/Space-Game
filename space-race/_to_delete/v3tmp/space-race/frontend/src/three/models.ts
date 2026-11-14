import * as THREE from "three";
import type { Component } from "../lib/types";

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
const M = {
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd4a72c, metalness: 0.9, roughness: 0.3 }),
  silver: () => new THREE.MeshStandardMaterial({ color: 0xc8ccd6, metalness: 0.85, roughness: 0.25 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.6, roughness: 0.5 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.1, roughness: 0.6 }),
  solar: () => new THREE.MeshStandardMaterial({
    color: 0x1b3a8c, metalness: 0.7, roughness: 0.25, emissive: 0x0a1a55, emissiveIntensity: 0.6,
  }),
  glow: (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.2, roughness: 0.1 }),
};

const num = (c: Component, k: string) => Number(c.specs[k] ?? 0);

/* ------------------------------------------------------------------ */
/* Spacecraft: every picked part becomes visible hardware              */
/* ------------------------------------------------------------------ */
export function buildCraft(parts: Component[]): THREE.Group {
  const g = new THREE.Group();
  const hasMLI = parts.some((p) => p.slug === "mli");

  // bus
  const bus = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), hasMLI ? M.gold() : M.silver());
  g.add(bus);

  const count: Record<string, number> = {};
  const slot = (cat: string) => (count[cat] = (count[cat] ?? 0) + 1) - 1;

  for (const p of parts) {
    const i = slot(p.category);
    switch (p.category) {
      case "power": {
        if (p.specs.solar) {
          const len = 1.2 + Math.sqrt(num(p, "gen_w") / 300) * 1.3;
          const y = 0.3 - i * 0.45;
          for (const side of [-1, 1]) {
            const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), M.silver());
            boom.rotation.z = Math.PI / 2;
            boom.position.set(side * 0.8, y, 0);
            const wing = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.9), M.solar());
            wing.position.set(side * (1.0 + len / 2), y, 0);
            // cell grid lines
            const grid = new THREE.LineSegments(
              new THREE.EdgesGeometry(new THREE.BoxGeometry(len, 0.031, 0.9, Math.ceil(len * 3), 1, 3)),
              new THREE.LineBasicMaterial({ color: 0x6b8cff, transparent: true, opacity: 0.35 }));
            grid.position.copy(wing.position);
            g.add(boom, wing, grid);
          }
        } else {
          // RTG on a boom, glowing hot
          const big = p.slug === "legacy-rtg";
          const rtg = new THREE.Group();
          const core = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.28 : 0.2, big ? 0.28 : 0.2, big ? 1.3 : 0.9, 16), M.dark());
          rtg.add(core);
          for (let f = 0; f < 6; f++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, big ? 1.2 : 0.8, 0.3), M.dark());
            const a = (f / 6) * Math.PI * 2;
            fin.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
            fin.rotation.y = -a;
            rtg.add(fin);
          }
          const hot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), M.glow(0xff4a1c));
          hot.position.y = (big ? 0.7 : 0.5);
          rtg.add(hot);
          const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0), M.silver());
          boom.rotation.x = Math.PI / 2;
          boom.position.set(-0.3 + i * 0.6, -0.2, -1.0);
          rtg.position.set(-0.3 + i * 0.6, -0.2, -1.7);
          rtg.rotation.x = Math.PI / 2;
          g.add(boom, rtg);
        }
        break;
      }
      case "battery": {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.08), M.dark());
        b.position.set(-0.35 + i * 0.35, -0.3, 0.64);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.01), M.glow(0x34d399));
        led.position.set(b.position.x, b.position.y + 0.07, 0.69);
        g.add(b, led);
        break;
      }
      case "instrument": {
        const tags = (p.specs.tags as string[]) ?? [];
        const x = -0.35 + (i % 2) * 0.7, z = -0.3 + Math.floor(i / 2) * 0.6;
        if (p.slug === "radar") {
          const ant = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 0.15), M.white());
          ant.position.set(0, -0.75, 0.3);
          g.add(ant);
        } else if (tags.includes("imaging")) {
          const big = p.slug === "hires-camera";
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.3 : 0.14, big ? 0.3 : 0.14, big ? 1.0 : 0.4, 20), M.white());
          tube.position.set(x, -0.6 - (big ? 0.5 : 0.2), z);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(big ? 0.26 : 0.11, 20), M.black());
          lens.rotation.x = Math.PI / 2;
          lens.position.set(x, tube.position.y - (big ? 0.51 : 0.21), z);
          g.add(tube, lens);
        } else {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), M.silver());
          box.position.set(x, -0.75, z);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 12), M.dark());
          cone.rotation.x = Math.PI;
          cone.position.set(x, -1.0, z);
          g.add(box, cone);
        }
        break;
      }
      case "storage": {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), M.dark());
        s.position.set(0.3, 0.2 - i * 0.18, 0.64);
        g.add(s);
        break;
      }
      case "comms": {
        const mbps = num(p, "downlink_mbps");
        if (p.slug === "uhf-lga") {
          const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2), M.silver());
          whip.position.set(0.45 - i * 0.3, 1.2, 0.45);
          g.add(whip);
        } else if (p.slug === "laser-comm") {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 16), M.silver());
          t.position.set(-0.4, 0.8, 0.4);
          const beam = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), M.glow(0x22ff88));
          beam.rotation.x = -Math.PI / 2;
          beam.position.set(-0.4, 1.01, 0.4);
          g.add(t, beam);
        } else {
          const r = 0.5 + Math.sqrt(mbps) * 0.35;
          const dish = new THREE.Mesh(
            new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 4),
            new THREE.MeshStandardMaterial({ color: 0xf2f4f8, side: THREE.DoubleSide, roughness: 0.4 }));
          dish.rotation.x = Math.PI; // concave up
          dish.position.set(0, 0.6 + r + 0.15 + i * 0.3, 0);
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5), M.silver());
          mast.position.set(0, 0.85 + i * 0.3, 0);
          const feed = new THREE.Mesh(new THREE.SphereGeometry(0.06), M.glow(mbps >= 8 ? 0xffaa00 : 0x7dd3fc));
          feed.position.set(0, dish.position.y - r * 0.55, 0);
          g.add(mast, dish, feed);
        }
        break;
      }
      case "propulsion": {
        const ion = p.slug === "ion";
        const bell = new THREE.Mesh(new THREE.ConeGeometry(ion ? 0.22 : 0.35, 0.55, 24, 1, true),
          new THREE.MeshStandardMaterial({ color: 0x555a66, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }));
        bell.position.set(i * 0.5 - (i ? 0.25 : 0), 0, -0.9);
        bell.rotation.x = -Math.PI / 2;
        g.add(bell);
        if (ion) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), M.glow(0x4f8cff));
          ring.position.set(bell.position.x, 0, -1.18);
          g.add(ring);
        }
        // propellant tanks sized by propellant mass
        const r = 0.15 + Math.cbrt(num(p, "propellant_kg")) * 0.04;
        for (const side of [-1, 1]) {
          const tank = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), ion ? M.dark() : M.silver());
          tank.position.set(side * (0.6 + r * 0.6), -0.45 - i * 0.2, -0.3);
          g.add(tank);
        }
        break;
      }
      case "thermal": {
        if (p.slug === "radiators") {
          for (const side of [-1, 1]) {
            const rad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.02), M.white());
            rad.position.set(0, 0, side * 0.75);
            g.add(rad);
          }
        } else if (p.slug === "active-cooling") {
          const shield = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 0.05), M.white());
          shield.position.set(0, 0, 1.25);
          g.add(shield);
        }
        break;
      }
    }
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return g;
}

/* ------------------------------------------------------------------ */
/* Rocket                                                              */
/* ------------------------------------------------------------------ */
export function buildRocket(color: string, lv?: Component): THREE.Group {
  const leo = lv ? num(lv, "payload_leo_kg") : 5000;
  const h = 6 + Math.log10(leo / 1000 + 1) * 4;       // bigger rockets are taller
  const r = 0.45 + Math.log10(leo / 1000 + 1) * 0.25;
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), M.white());
  body.position.y = h / 2;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.08, 24), accent);
  stripe.position.y = h * 0.62;
  const fairing = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.6, 24), M.white());
  fairing.position.y = h + r * 1.3;
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(r * 0.7, r * 1.1, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, side: THREE.DoubleSide }));
  nozzle.position.y = -r * 0.4;
  g.add(body, stripe, fairing, nozzle);
  for (let f = 0; f < 4; f++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, h * 0.18, r * 1.4), accent);
    const a = (f / 4) * Math.PI * 2;
    fin.position.set(Math.cos(a) * r * 1.3, h * 0.1, Math.sin(a) * r * 1.3);
    fin.rotation.y = -a + Math.PI / 2;
    g.add(fin);
  }
  g.userData.height = h;
  g.userData.radius = r;
  return g;
}

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */
export function makeStars(count = 4000, radius = 400): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.6 + Math.random() * 0.4));
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false }));
}

/** Procedural planet textures - no image assets needed. */
export function planetTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const x = c.getContext("2d")!;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const blobs = (n: number, colors: string[], rmin: number, rmax: number) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = colors[i % colors.length];
      x.globalAlpha = rnd(0.3, 0.8);
      x.beginPath(); x.ellipse(rnd(0, 512), rnd(0, 256), rnd(rmin, rmax), rnd(rmin, rmax) * 0.6, rnd(0, 3), 0, 7); x.fill();
    }
    x.globalAlpha = 1;
  };
  if (name === "Earth") {
    x.fillStyle = "#1d4ed8"; x.fillRect(0, 0, 512, 256);
    blobs(40, ["#15803d", "#4d7c0f", "#a16207"], 10, 45);
    x.fillStyle = "#f8fafc"; x.fillRect(0, 0, 512, 14); x.fillRect(0, 242, 512, 14);
    blobs(60, ["#ffffff"], 6, 26);
  } else if (name === "Mars") {
    x.fillStyle = "#b4492a"; x.fillRect(0, 0, 512, 256);
    blobs(70, ["#7c2d12", "#d97745", "#9a3412"], 5, 40);
    x.fillStyle = "#fde7d9"; x.fillRect(0, 0, 512, 10);
  } else if (name === "Venus") {
    const grd = x.createLinearGradient(0, 0, 0, 256);
    ["#f5deb3", "#e8c27a", "#d8a657", "#f0d39a", "#e3b46b", "#f5deb3"].forEach((col, i, a) => grd.addColorStop(i / (a.length - 1), col));
    x.fillStyle = grd; x.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 30; i++) {
      x.strokeStyle = `rgba(255,255,255,${rnd(0.05, 0.2)})`; x.lineWidth = rnd(3, 12);
      x.beginPath(); const y = rnd(0, 256); x.moveTo(0, y);
      x.bezierCurveTo(170, y + rnd(-30, 30), 340, y + rnd(-30, 30), 512, y); x.stroke();
    }
  } else {
    x.fillStyle = "#9ca3af"; x.fillRect(0, 0, 512, 256);
    blobs(50, ["#6b7280", "#4b5563", "#d1d5db"], 4, 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
}
