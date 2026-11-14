import * as THREE from "three";
import { partsOf, type Build } from "./parts";

export interface RoverRig {
  root: THREE.Group;          // origin = ground contact point, +z = forward
  body: THREE.Group;
  wheels: THREE.Object3D[];
  wheelR: number;
  jetFlames: THREE.Mesh[];
  drillBit: THREE.Object3D | null;
  laserTip: THREE.Object3D | null;
  dish: THREE.Object3D | null;
}

const mat = (color: number, metal = 0.5, rough = 0.5, emissive = 0) =>
  new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive, emissiveIntensity: emissive ? 1.5 : 0 });

export function buildRover(build: Build, accent = "#7dd3fc"): RoverRig {
  const parts = partsOf(build);
  const has = (id: string) => parts.some((p) => p.id === id);
  const wheelsPart = parts.find((p) => p.slot === "wheels");
  const r = wheelsPart?.wheelR ?? 0.4;
  const ch = parts.find((p) => p.slot === "chassis")?.id ?? "ch-alu";
  const dims = ch === "ch-carbon" ? [2.0, 0.35, 2.8] : ch === "ch-ti" ? [2.5, 0.7, 3.3] : [2.3, 0.5, 3.0];
  const bodyColor = ch === "ch-carbon" ? 0x23262e : ch === "ch-ti" ? 0xb8a26a : 0xd7dbe3;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const deckY = r * 1.4 + 0.35;
  body.position.y = deckY;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), mat(bodyColor, 0.6, 0.4));
  chassis.castShadow = true;
  body.add(chassis);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(dims[0] + 0.02, dims[1] * 0.25, dims[2] * 0.7),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.4 }));
  body.add(stripe);
  // headlights
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), mat(0xffffff, 0, 0.2, 0xffffee));
    hl.position.set(s * dims[0] * 0.32, 0, dims[2] / 2 + 0.03);
    body.add(hl);
  }

  // ---- wheels / tracks ----
  const wheels: THREE.Object3D[] = [];
  const wx = dims[0] / 2 + 0.35;
  if (wheelsPart?.tracks) {
    for (const s of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.55, r * 2, dims[2] + 0.6), mat(0x1a1a1a, 0.2, 0.9));
      track.position.set(s * wx, r, 0);
      track.castShadow = true;
      root.add(track);
      for (const z of [-1, 0, 1]) {
        const cog = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.6, 10), mat(0x555555, 0.8, 0.4));
        cog.rotation.z = Math.PI / 2;
        cog.position.set(s * wx, r, z * dims[2] * 0.4);
        root.add(cog);
        wheels.push(cog);
      }
    }
  } else {
    const tireMat = mat(0x202020, 0.1, 0.95);
    const hubMat = mat(0xc0c4cc, 0.9, 0.3);
    for (const s of [-1, 1]) {
      for (const z of [-1, 0, 1]) {
        const w = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.42, 18), tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        const hub = new THREE.Mesh(new THREE.BoxGeometry(0.44, r * 1.2, 0.12), hubMat); // visible spoke so spinning reads
        w.add(tire, hub);
        w.position.set(s * wx, r, z * dims[2] * 0.42);
        root.add(w);
        wheels.push(w);
      }
      // rocker arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, dims[2] * 0.9), hubMat);
      arm.position.set(s * (wx - 0.1), r + (deckY - r) * 0.55, 0);
      root.add(arm);
    }
  }

  // ---- power ----
  if (has("pw-solar") || has("pw-solar-xl")) {
    const xl = has("pw-solar-xl");
    const panel = new THREE.Mesh(new THREE.BoxGeometry(xl ? dims[0] * 2.3 : dims[0] * 1.1, 0.05, dims[2] * (xl ? 1.0 : 0.9)),
      new THREE.MeshStandardMaterial({ color: 0x1b3a8c, metalness: 0.7, roughness: 0.25, emissive: 0x0a1a55, emissiveIntensity: 0.5 }));
    panel.position.y = dims[1] / 2 + 0.12;
    panel.castShadow = true;
    body.add(panel);
  }
  if (has("pw-rtg")) {
    const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 12), mat(0x2a2e3a, 0.6, 0.5));
    rtg.rotation.x = Math.PI / 2.6;
    rtg.position.set(0, dims[1] / 2 + 0.1, -dims[2] / 2 - 0.25);
    const hot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), mat(0xff4a1c, 0, 0.4, 0xff4a1c));
    hot.position.set(0, dims[1] / 2 + 0.35, -dims[2] / 2 - 0.55);
    body.add(rtg, hot);
  }

  // ---- instruments ----
  let laserTip: THREE.Object3D | null = null;
  if (has("in-navcam") || has("in-laser")) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4), mat(0xd7dbe3, 0.7, 0.3));
    mast.position.set(dims[0] * 0.3, dims[1] / 2 + 0.7, dims[2] * 0.3);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), mat(0xeeeeee, 0.3, 0.5));
    head.position.set(dims[0] * 0.3, dims[1] / 2 + 1.45, dims[2] * 0.3);
    body.add(mast, head);
    if (has("in-navcam")) {
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), mat(0x111111, 0.2, 0.1, 0x3355ff));
        eye.position.set(dims[0] * 0.3 + s * 0.12, dims[1] / 2 + 1.45, dims[2] * 0.3 + 0.16);
        body.add(eye);
      }
    }
    if (has("in-laser")) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), mat(0xff3030, 0, 0.3, 0xff2020));
      tip.rotation.x = Math.PI / 2;
      tip.position.set(dims[0] * 0.3, dims[1] / 2 + 1.62, dims[2] * 0.3 + 0.1);
      body.add(tip);
      laserTip = tip;
    }
  }
  let drillBit: THREE.Object3D | null = null;
  if (has("in-drill")) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.1), mat(0xd7dbe3, 0.7, 0.3));
    arm.position.set(-dims[0] * 0.25, 0, dims[2] / 2 + 0.5);
    const bit = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 10), mat(0x888888, 0.9, 0.3));
    bit.rotation.x = Math.PI;
    bit.position.set(-dims[0] * 0.25, -0.4, dims[2] / 2 + 1.0);
    body.add(arm, bit);
    drillBit = bit;
  }

  // ---- extras ----
  let dish: THREE.Object3D | null = null;
  if (has("ex-antenna")) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 8, 0, Math.PI * 2, 0, Math.PI / 4),
      new THREE.MeshStandardMaterial({ color: 0xf2f4f8, side: THREE.DoubleSide, roughness: 0.4 }));
    d.rotation.x = Math.PI * 0.8;
    d.position.set(-dims[0] * 0.3, dims[1] / 2 + 0.9, -dims[2] * 0.25);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), mat(0xc0c4cc));
    pole.position.set(-dims[0] * 0.3, dims[1] / 2 + 0.35, -dims[2] * 0.25);
    body.add(pole, d);
    dish = d;
  }
  if (has("ex-cooling")) {
    for (const s of [-1, 1]) {
      const rad = new THREE.Mesh(new THREE.BoxGeometry(0.04, dims[1] + 0.3, dims[2] * 0.6), mat(0xffffff, 0.1, 0.6));
      rad.position.set(s * (dims[0] / 2 + 0.06), 0.1, -dims[2] * 0.1);
      body.add(rad);
    }
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.05, 6, 16), mat(0x7dd3fc, 0.2, 0.3, 0x2288ff));
    coil.position.set(0, dims[1] / 2 + 0.1, -dims[2] * 0.35);
    coil.rotation.x = Math.PI / 2;
    body.add(coil);
  }
  const jetFlames: THREE.Mesh[] = [];
  if (has("ex-jets")) {
    for (const s of [-1, 1]) {
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.3, 10), mat(0x444444, 0.9, 0.3));
      noz.position.set(s * dims[0] * 0.3, -dims[1] / 2 - 0.15, -dims[2] * 0.3);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.2, 10),
        new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
      flame.rotation.x = Math.PI;
      flame.position.set(s * dims[0] * 0.3, -dims[1] / 2 - 0.9, -dims[2] * 0.3);
      flame.visible = false;
      body.add(noz, flame);
      jetFlames.push(flame);
    }
  }
  return { root, body, wheels, wheelR: r, jetFlames, drillBit, laserTip, dish };
}
