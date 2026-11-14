import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { sfx } from "../lib/sfx";
import type { Component, SimResult, TimelineEvent } from "../lib/types";
import { buildCraft, buildRocket, disposeObject, makeStars, planetTexture } from "../three/models";
import { Particles } from "../three/particles";

export interface Lane { label: string; result: SimResult; color: string; parts: Component[] }

/* ---------------- timing ----------------
 * The server's timeline uses t = 0..1. We stretch it non-linearly so the
 * exciting bits (liftoff, insertion burn) get more screen time.           */
const COUNTDOWN = 4;                                    // T-3, 2, 1, LIFTOFF
const SEGMENTS: [number, number, number][] = [          // [t0, t1, seconds]
  [0, 0.15, 6.5],     // ascent
  [0.15, 0.55, 6],    // transfer
  [0.55, 0.62, 3],    // insertion
  [0.62, 1, 7.5],     // science ops
];
const TOTAL = SEGMENTS.reduce((s, x) => s + x[2], 0);

function tAt(sec: number): number {
  let acc = 0;
  for (const [a, b, d] of SEGMENTS) {
    if (sec <= acc + d) return a + ((sec - acc) / d) * (b - a);
    acc += d;
  }
  return 1;
}

const PHASE_TITLE = (t: number, dest: string) =>
  t < 0.15 ? "ASCENT" : t < 0.55 ? `TRANS-${dest.toUpperCase()} INJECTION` : t < 0.62 ? "ORBIT INSERTION BURN"
    : t < 1 ? "SCIENCE OPERATIONS" : "MISSION COMPLETE";

const PLANET_R: Record<string, number> = { Mars: 4, Venus: 5, Moon: 2.6 };

interface Toast { id: number; text: string; status: TimelineEvent["status"]; color: string; who: string }
interface Hud {
  title: string; clock: string; countdown: string | null;
  lanes: { status: string; tone: string; science: number }[];
}

export function Launch3D({ lanes, destination, onDone }: { lanes: Lane[]; destination: string; onDone?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({ title: "", clock: "", countdown: "T-3", lanes: lanes.map(() => ({ status: "ON PAD", tone: "info", science: 0 })) });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const W = () => el.clientWidth, H = () => el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 2000);

    const n = lanes.length;
    const laneX = (i: number) => (n === 1 ? 0 : (i - (n - 1) / 2) * 10);
    const toDispose: { dispose: () => void }[] = [];

    /* =================== PAD SCENE =================== */
    const pad = new THREE.Scene();
    pad.fog = new THREE.Fog(0x1a2350, 40, 220);
    pad.background = new THREE.Color(0x1a2350);
    pad.add(new THREE.HemisphereLight(0x8fa8ff, 0x202020, 0.9));
    const moon = new THREE.DirectionalLight(0xc8d4ff, 1.6);
    moon.position.set(-20, 40, 30);
    pad.add(moon);
    const padStars = makeStars(2500, 600);
    pad.add(padStars);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64),
      new THREE.MeshStandardMaterial({ color: 0x1b2418, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    pad.add(ground);

    const rockets: THREE.Group[] = [];
    const glowLights: THREE.PointLight[] = [];
    lanes.forEach((lane, i) => {
      const concrete = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 0.6, 32),
        new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 }));
      concrete.position.set(laneX(i), 0.3, 0);
      pad.add(concrete);
      const rocket = buildRocket(lane.color, lane.parts.find((p) => p.category === "launch"));
      rocket.position.set(laneX(i), 0.6 + rocket.userData.radius * 0.6, 0);
      pad.add(rocket);
      rockets.push(rocket);
      // service tower
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1, rocket.userData.height + 3, 1),
        new THREE.MeshStandardMaterial({ color: 0x8b2c2c, wireframe: true }));
      tower.position.set(laneX(i) + 2.6, (rocket.userData.height + 3) / 2, 0);
      pad.add(tower);
      // floodlight + engine glow
      const flood = new THREE.SpotLight(0xffffff, 120, 60, 0.5, 0.6);
      flood.position.set(laneX(i) - 8, 12, 10);
      flood.target = rocket;
      pad.add(flood);
      const glow = new THREE.PointLight(0xff8a3d, 0, 40, 1.5);
      pad.add(glow);
      glowLights.push(glow);
    });
    const fire = new Particles(6000, 2.2, 0.94);
    const smoke = new Particles(4000, 5, 0.97, -1.5);
    const boom = new Particles(3000, 2.5, 0.93);
    pad.add(fire.points, smoke.points, boom.points);
    toDispose.push(fire, smoke, boom);

    /* =================== SPACE SCENE =================== */
    const space = new THREE.Scene();
    space.background = new THREE.Color(0x02030a);
    space.add(makeStars(5000, 800));
    space.add(new THREE.AmbientLight(0x404660, 0.5));
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sunLight.position.set(-100, 30, 60);
    space.add(sunLight);
    // the Sun
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    sunMesh.position.set(-260, 80, -300);
    space.add(sunMesh);

    const EARTH = new THREE.Vector3(-45, 0, 0);
    const PLANET = new THREE.Vector3(45, 0, 0);
    const pr = PLANET_R[destination] ?? 4;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(6, 48, 48), new THREE.MeshStandardMaterial({ map: planetTexture("Earth"), roughness: 0.8 }));
    earth.position.copy(EARTH);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(6.5, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x5aa0ff, transparent: true, opacity: 0.18, side: THREE.BackSide }));
    atmo.position.copy(EARTH);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(pr, 48, 48),
      new THREE.MeshStandardMaterial({ map: planetTexture(destination), roughness: 0.9 }));
    planet.position.copy(PLANET);
    space.add(earth, atmo, planet);
    if (destination === "Venus") {
      const haze = new THREE.Mesh(new THREE.SphereGeometry(pr * 1.08, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.2, side: THREE.BackSide }));
      haze.position.copy(PLANET);
      space.add(haze);
    }

    const crafts: THREE.Group[] = [];
    const curves: THREE.QuadraticBezierCurve3[] = [];
    const trails: THREE.Line[] = [];
    const beams: THREE.Line[] = [];
    const TRAIL_PTS = 200;
    lanes.forEach((lane, i) => {
      const z = n === 1 ? 0 : (i - (n - 1) / 2) * 5;
      const curve = new THREE.QuadraticBezierCurve3(
        EARTH.clone().add(new THREE.Vector3(7, 0, z)),
        new THREE.Vector3(0, 22 + i * 4, z * 3),
        PLANET.clone().add(new THREE.Vector3(-(pr + 2.5 + i * 1.4), 0, 0)));
      curves.push(curve);
      const craft = new THREE.Group();
      const model = buildCraft(lane.parts.filter((p) => p.category !== "launch"));
      model.scale.setScalar(0.45);
      craft.add(model);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12),
        new THREE.MeshBasicMaterial({ color: lane.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
      craft.add(beacon);
      craft.position.copy(curve.getPoint(0));
      space.add(craft);
      crafts.push(craft);
      const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(TRAIL_PTS)),
        new THREE.LineDashedMaterial({ color: lane.color, dashSize: 1, gapSize: 0.6, transparent: true, opacity: 0.8 }));
      trail.computeLineDistances();
      trail.geometry.setDrawRange(0, 0);
      space.add(trail);
      trails.push(trail);
      const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), EARTH.clone()]),
        new THREE.LineBasicMaterial({ color: lane.color, transparent: true, opacity: 0 }));
      space.add(beam);
      beams.push(beam);
    });
    const spaceFx = new Particles(5000, 1.4, 0.95);
    space.add(spaceFx.points);
    toDispose.push(spaceFx);

    /* =================== per-lane runtime state =================== */
    const failT = lanes.map((l) => l.result.timeline.find((e) => e.status === "fail")?.t ?? null);
    const failPhase = lanes.map((l) => l.result.failed_phase);
    const exploded = lanes.map(() => false);
    const fired = lanes.map(() => 0);
    const lastPos = lanes.map(() => new THREE.Vector3());
    const lastDir = lanes.map(() => new THREE.Vector3(1, 0, 0));
    let shake = 0;
    let rumble: { stop: () => void } | null = null;
    let lastCount = 99;
    let switched = false;
    let ended = false;
    let toastId = 0;
    const hudRef = { t: 0, sec: -COUNTDOWN };

    const col = (hex: string) => new THREE.Color(hex);
    const FIRE = [col("#ffdd88"), col("#ff9a3c"), col("#ff5a1f"), col("#ffffff")];
    const SMOKE = [col("#3a3a40"), col("#2a2a30"), col("#444450")];
    const BOOM = [col("#ffffff"), col("#ffd166"), col("#ff7a1f"), col("#ff3b1f")];

    const explode = (fx: Particles, p: THREE.Vector3, big = true) => {
      fx.burst(p, big ? 900 : 500, big ? 26 : 14, 1.6, BOOM);
      sfx.explosion();
      shake = 1.4;
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    };

    const fireEvents = (t: number) => {
      lanes.forEach((lane, i) => {
        const evs = lane.result.timeline;
        while (fired[i] < evs.length && evs[fired[i]].t <= t) {
          const e = evs[fired[i]++];
          if (e.status === "info" && e.phase === "review") continue;
          const id = ++toastId;
          setToasts((ts) => [...ts.slice(-4), { id, text: e.message, status: e.status, color: lane.color, who: lane.label }]);
          setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3200);
          if (e.status === "ok") sfx.chime();
          else if (e.status === "warn") sfx.warn();
        }
      });
    };

    /* =================== animation loop =================== */
    const start = performance.now();
    let prev = start;
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const sec = (now - start) / 1000 - COUNTDOWN;
      const t = sec < 0 ? 0 : tAt(sec);
      hudRef.t = t; hudRef.sec = sec;

      // countdown beeps
      if (sec < 0) {
        const c = Math.ceil(-sec);
        if (c !== lastCount && c <= 3) { lastCount = c; sfx.countdown(false); }
      } else if (lastCount !== 0) {
        lastCount = 0;
        sfx.countdown(true);
        rumble = sfx.rumble(7);
      }
      if (sec >= 0) fireEvents(t);

      if (t < 0.15) {
        /* ---------- ASCENT ---------- */
        const k = sec < 0 ? 0 : t / 0.15;
        let avgY = 0, alive = 0;
        rockets.forEach((r, i) => {
          if (!exploded[i]) { avgY += r.position.y; alive++; } // camera follows survivors
          if (failPhase[i] === "review") return; // scrubbed: never fuelled, stays on the pad
          const ft = failT[i];
          const stuck = failPhase[i] === "launch" && lanes[i].result.outcome.startsWith("Too heavy");
          const failedNow = ft !== null && t >= ft && failPhase[i] === "launch";
          const kk = ft !== null && failPhase[i] === "launch" ? Math.min(k, ft / 0.15) : k;
          const y = stuck ? 0 : 140 * Math.pow(kk, 2.3);
          r.position.y = 0.6 + r.userData.radius * 0.6 + y;
          r.rotation.z = -kk * 0.25 * (i % 2 ? -1 : 1) * (n > 1 ? 1 : 0.6);
          if (failedNow) {
            if (!exploded[i]) { exploded[i] = true; explode(boom, r.position.clone().add(new THREE.Vector3(0, r.userData.height / 2, 0))); r.visible = false; }
          } else {
            const ignite = sec > -0.6;
            if (ignite) {
              const nozzle = r.position.clone().add(new THREE.Vector3(0, -r.userData.radius, 0));
              for (let p = 0; p < 40; p++) {
                const spread = stuck ? 6 : 2.2;
                fire.emit(nozzle, new THREE.Vector3((Math.random() - 0.5) * spread, -18 - Math.random() * 14, (Math.random() - 0.5) * spread),
                  0.35 + Math.random() * 0.35, FIRE[p % FIRE.length]);
              }
              for (let p = 0; p < 6; p++) {
                smoke.emit(nozzle.clone().add(new THREE.Vector3(0, -2, 0)),
                  new THREE.Vector3((Math.random() - 0.5) * (y < 5 ? 30 : 4), -2 + Math.random() * 3, (Math.random() - 0.5) * (y < 5 ? 30 : 4)),
                  2 + Math.random() * 2, SMOKE[p % SMOKE.length]);
              }
              glowLights[i].position.copy(nozzle);
              glowLights[i].intensity = 400 + Math.random() * 200;
              shake = Math.max(shake, 0.35);
            }
          }
        });
        avgY = alive ? avgY / alive : 0;
        const sky = new THREE.Color(0x1a2350).lerp(new THREE.Color(0x000000), Math.min(1, avgY / 120));
        pad.background = sky;
        (pad.fog as THREE.Fog).color = sky;
        camera.position.set(0, Math.max(5, avgY - 6), 32 + n * 4 + avgY * 0.15);
        camera.lookAt(0, avgY + 6, 0);
      } else {
        /* ---------- SPACE ---------- */
        if (!switched) {
          switched = true;
          if (flash.current) { flash.current.style.opacity = "1"; setTimeout(() => flash.current && (flash.current.style.opacity = "0"), 80); }
          sfx.whoosh();
          rumble?.stop();
        }
        earth.rotation.y += dt * 0.15;
        planet.rotation.y += dt * 0.1;

        crafts.forEach((c, i) => {
          const ft = failT[i];
          const fp = failPhase[i];
          if (fp === "launch" || fp === "review") { c.visible = false; trails[i].visible = false; return; }
          const dead = ft !== null && t >= ft;
          let pos: THREE.Vector3;
          if (dead && fp === "insertion") {
            // missed the burn: sail past the planet into deep space
            pos = lastPos[i].clone().addScaledVector(lastDir[i], dt * 18);
          } else if (dead) {
            if (!exploded[i]) { exploded[i] = true; explode(spaceFx, c.position.clone(), false); c.visible = false; beams[i].visible = false; }
            return;
          } else if (t < 0.55) {
            const k = (t - 0.15) / 0.4;
            pos = curves[i].getPoint(k);
            trails[i].geometry.setDrawRange(0, Math.floor(k * TRAIL_PTS));
          } else if (t < 0.62) {
            pos = curves[i].getPoint(1);
            trails[i].geometry.setDrawRange(0, TRAIL_PTS);
            // retro-burn flame
            for (let p = 0; p < 18; p++) {
              spaceFx.emit(pos, lastDir[i].clone().multiplyScalar(8 + Math.random() * 6)
                .add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)),
                0.4, FIRE[p % FIRE.length]);
            }
            shake = Math.max(shake, 0.15);
          } else {
            const R = pr + 2.5 + i * 1.4;
            const a = Math.PI + (t - 0.62) * 22 * (1 + i * 0.1);
            pos = PLANET.clone().add(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R * 0.25, Math.sin(a) * R));
            const b = beams[i];
            const arr = b.geometry.attributes.position.array as Float32Array;
            arr[0] = pos.x; arr[1] = pos.y; arr[2] = pos.z;
            b.geometry.attributes.position.needsUpdate = true;
            (b.material as THREE.LineBasicMaterial).opacity = 0.25 + 0.35 * Math.abs(Math.sin(now / 120 + i));
          }
          if (!(dead && fp === "insertion")) {
            const dir = pos.clone().sub(c.position);
            if (dir.lengthSq() > 1e-6) lastDir[i].copy(dir.normalize());
          }
          lastPos[i].copy(pos);
          c.position.copy(pos);
          c.lookAt(pos.clone().add(lastDir[i]));
          c.rotateY(Math.PI / 2);
        });

        // cinematic camera: Earth departure -> wide transfer -> close orbit at destination
        const k = t < 0.55 ? (t - 0.15) / 0.4 : 1;
        const lead = crafts.find((c) => c.visible)?.position ?? PLANET;
        let camPos: THREE.Vector3, look: THREE.Vector3;
        if (t < 0.55) {
          camPos = new THREE.Vector3(-40, 14, 34).lerp(new THREE.Vector3(0, 46, 78), Math.sin(k * Math.PI / 2));
          look = EARTH.clone().lerp(lead, Math.min(1, k * 1.5));
        } else {
          const z = Math.min(1, (t - 0.55) / 0.15);
          camPos = new THREE.Vector3(0, 46, 78).lerp(PLANET.clone().add(new THREE.Vector3(-14, 9, 22)), z * z * (3 - 2 * z));
          look = lead.clone().lerp(PLANET, 0.6);
        }
        camera.position.copy(camPos);
        camera.lookAt(look);
      }

      if (shake > 0.01) {
        camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
        shake *= 0.9;
      }
      fire.update(dt); smoke.update(dt); boom.update(dt); spaceFx.update(dt);
      renderer.render(t < 0.15 ? pad : space, camera);

      if (sec >= TOTAL && !ended) {
        ended = true;
        setTimeout(() => onDone?.(), 1200);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // HUD refresh at 10 Hz (React doesn't need 60 fps)
    const hudTimer = setInterval(() => {
      const { t, sec } = hudRef;
      const clock = sec < 0 ? "" : `T+ ${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
      const countdown = sec < -3 ? "T-3" : sec < -2 ? "T-2" : sec < -1 ? "T-1" : sec < 0.6 ? (sec < 0 ? "IGNITION" : "LIFTOFF!") : null;
      setHud({
        title: sec < 0 ? "FINAL COUNTDOWN" : PHASE_TITLE(t, destination),
        clock, countdown,
        lanes: lanes.map((l, i) => {
          const ft = failT[i];
          const dead = ft !== null && t >= ft;
          const opsEnd = dead ? ft! : 1;
          const sciK = t < 0.62 || (ft !== null && ft < 0.62) ? 0 : Math.min(1, (t - 0.62) / Math.max(0.001, opsEnd - 0.62));
          const status = dead ? (failPhase[i] === "insertion" ? "LOST IN SPACE" : failPhase[i] === "review" ? "SCRUBBED" : "SIGNAL LOST")
            : sec < 0 ? "GO" : t < 0.15 ? "CLIMBING" : t < 0.55 ? "CRUISE" : t < 0.62 ? "BURNING" : t >= 1 ? "COMPLETE" : "IN ORBIT";
          return { status, tone: dead ? "fail" : t >= 0.62 ? "ok" : "info", science: l.result.science * sciK };
        }),
      });
    }, 100);

    const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudTimer);
      window.removeEventListener("resize", onResize);
      rumble?.stop();
      toDispose.forEach((d) => d.dispose());
      pad.traverse(disposeObject); space.traverse(disposeObject);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`launch3d ${shaking ? "shake" : ""}`}>
      <div ref={host} className="launch3d-canvas" />
      <div ref={flash} className="flash" />
      <div className="hud-top">
        <div className="hud-title">{hud.title}</div>
        <div className="hud-clock mono">{hud.clock}</div>
      </div>
      {hud.countdown && <div key={hud.countdown} className="countdown">{hud.countdown}</div>}
      <div className="hud-lanes">
        {lanes.map((l, i) => {
          const h = hud.lanes[i];
          const pct = Math.min(100, (h.science / l.result.stats.science_target) * 100);
          return (
            <div key={l.label} className={`hud-lane ${h.tone}`} style={{ borderColor: l.color }}>
              <div className="hud-name" style={{ color: l.color }}>{l.label}</div>
              <div className={`hud-status ${h.tone}`}>{h.status}</div>
              <div className="sci-bar"><div style={{ width: `${pct}%`, background: l.color }} /></div>
              <div className="mono small">SCIENCE {h.science.toFixed(0)} / {l.result.stats.science_target}</div>
            </div>
          );
        })}
      </div>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`event-toast ${t.status}`} style={{ borderColor: t.color }}>
            <b style={{ color: t.color }}>{t.who}</b> {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
