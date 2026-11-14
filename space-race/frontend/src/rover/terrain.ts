import * as THREE from "three";
import { PLANETS, type RoverPlanet } from "./parts";

/* ---------------- deterministic noise ---------------- */
function hash2(ix: number, iz: number, seed: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number, seed: number, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * (vnoise(x * f, z * f, seed + i * 17) - 0.5); amp *= 0.5; f *= 2.03; }
  return s;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Crater { x: number; z: number; r: number; depth: number }
export interface Sample { x: number; z: number; value: number; kind: "common" | "rare" | "legendary" }
export interface Boulder { x: number; z: number; r: number }

const SIZE = 600;
export const HALF = SIZE / 2 - 20;

const PROFILE: Record<RoverPlanet, { amp: number; detail: number; craters: number; depth: number }> = {
  Mars: { amp: 26, detail: 2.4, craters: 14, depth: 9 },
  Moon: { amp: 12, detail: 1.6, craters: 34, depth: 11 },
  Venus: { amp: 16, detail: 3.2, craters: 6, depth: 6 },
};

export class Terrain {
  readonly craters: Crater[] = [];
  readonly samples: Sample[] = [];
  readonly boulders: Boulder[] = [];
  private seed: number;
  private prof: (typeof PROFILE)[RoverPlanet];
  private h0 = 0;

  constructor(readonly planet: RoverPlanet) {
    this.seed = PLANETS[planet].seed;
    this.prof = PROFILE[planet];
    const r = rng(this.seed);
    for (let i = 0; i < this.prof.craters; i++) {
      const ang = r() * Math.PI * 2, dist = 50 + r() * 220;
      this.craters.push({ x: Math.cos(ang) * dist, z: Math.sin(ang) * dist, r: 10 + r() * 28, depth: this.prof.depth * (0.5 + r()) });
    }
    this.h0 = this.raw(0, 0);
    // samples
    const place = (n: number, min: number, max: number, value: number, kind: Sample["kind"]) => {
      for (let i = 0; i < n; i++) {
        const ang = r() * Math.PI * 2, d = min + r() * (max - min);
        this.samples.push({ x: Math.cos(ang) * d, z: Math.sin(ang) * d, value, kind });
      }
    };
    place(32, 25, 240, 10, "common");
    place(12, 70, 260, 30, "rare");
    // legendaries sit at the bottom of the farthest craters - risky to reach
    const far = [...this.craters].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z)).slice(0, 4);
    for (const c of far) this.samples.push({ x: c.x, z: c.z, value: 80, kind: "legendary" });
    for (let i = 0; i < 34; i++) {
      const ang = r() * Math.PI * 2, d = 22 + r() * 250;
      this.boulders.push({ x: Math.cos(ang) * d, z: Math.sin(ang) * d, r: 1.2 + r() * 2.2 });
    }
  }

  private raw(x: number, z: number) {
    const p = this.prof;
    let h = fbm(x * 0.008, z * 0.008, this.seed) * p.amp * 2 + fbm(x * 0.06, z * 0.06, this.seed + 5, 3) * p.detail;
    if (this.planet === "Venus") h += Math.abs(fbm(x * 0.02, z * 0.02, this.seed + 9)) * 14; // volcanic ridges
    for (const c of this.craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r;
      if (d < 1.6) {
        if (d < 1) h -= c.depth * (1 - d * d);
        h += c.depth * 0.38 * Math.exp(-(((d - 1) / 0.17) ** 2));
      }
    }
    return h;
  }

  height(x: number, z: number) {
    const d = Math.hypot(x, z);
    const raw = this.raw(x, z);
    if (d > 40) return raw;
    const t = Math.max(0, Math.min(1, (d - 14) / 26));
    const s = t * t * (3 - 2 * t);
    return this.h0 + (raw - this.h0) * s;    // flat landing zone
  }

  normal(x: number, z: number, out = new THREE.Vector3()) {
    const e = 0.8;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  buildMesh(): THREE.Mesh {
    const P = PLANETS[this.planet];
    const seg = 220;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const [c0, c1, c2] = P.ground.map((c) => new THREE.Color(c));
    let min = Infinity, max = -Infinity;
    const hs = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const h = this.height(pos.getX(i), pos.getZ(i));
      hs[i] = h; min = Math.min(min, h); max = Math.max(max, h);
      pos.setY(i, h);
    }
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = (hs[i] - min) / (max - min || 1);
      const n = vnoise(pos.getX(i) * 0.15, pos.getZ(i) * 0.15, this.seed + 3) * 0.25;
      if (k < 0.5) tmp.copy(c0).lerp(c1, Math.min(1, k * 2 + n));
      else tmp.copy(c1).lerp(c2, Math.min(1, (k - 0.5) * 2 + n));
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    mesh.receiveShadow = true;
    return mesh;
  }
}
