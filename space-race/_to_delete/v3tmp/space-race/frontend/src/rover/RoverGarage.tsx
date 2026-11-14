import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { sfx } from "../lib/sfx";
import { disposeObject } from "../three/models";
import {
  BUDGET, PLANETS, ROVER_PARTS, SINGLE, SLOT_LABEL, buildReady, roverStats,
  type Build, type RoverPlanet, type Slot,
} from "./parts";
import { buildRover } from "./roverModel";

function RoverPreview({ build }: { build: Build }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<((b: Build) => void) | null>(null);
  useEffect(() => {
    const el = host.current!;
    const H = 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, H);
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / H, 0.1, 200);
    camera.position.set(6, 4, 7);
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x302020, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(5, 9, 4);
    sun.castShadow = true;
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48),
      new THREE.MeshStandardMaterial({ color: 0x151a33, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.8, 64), new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
    scene.add(ring);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 2; controls.enablePan = false;
    let rover: THREE.Group | null = null;
    let pop = 1;
    api.current = (b) => {
      if (rover) { scene.remove(rover); disposeObject(rover); }
      rover = buildRover(b).root;
      rover.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
      scene.add(rover);
      pop = 0.8;
    };
    let raf = 0;
    const loop = () => {
      pop += (1 - pop) * 0.15;
      if (rover) rover.scale.setScalar(pop);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    const ro = new ResizeObserver(() => { camera.aspect = el.clientWidth / H; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, H); });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); scene.traverse(disposeObject); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);
  useEffect(() => { api.current?.(build); }, [build]);
  return <div ref={host} className="hangar" style={{ height: 300 }} />;
}

function Bar({ label, value, max, text, bad }: { label: string; value: number; max: number; text: string; bad?: boolean }) {
  const pct = Math.max(3, Math.min(100, (value / max) * 100));
  return (
    <div className="gauge">
      <div className="gauge-head"><span>{label}</span><span className="mono">{text}</span></div>
      <div className="bar"><div className="fill" style={{ width: `${pct}%`, background: bad ? "var(--bad)" : "var(--accent)" }} /></div>
    </div>
  );
}

const ORDER: Slot[] = ["chassis", "wheels", "motor", "battery", "power", "instrument", "extra"];

export function RoverGarage({ planet, setPlanet, build, setBuild, onDeploy, best }:
  { planet: RoverPlanet; setPlanet: (p: RoverPlanet) => void; build: Build; setBuild: (b: Build) => void; onDeploy: () => void; best: number }) {
  const s = useMemo(() => roverStats(build, planet), [build, planet]);
  const ready = buildReady(s);

  const toggle = (id: string, slot: Slot) => {
    const isSingle = SINGLE.includes(slot);
    const without = build.filter((x) => ROVER_PARTS.find((p) => p.id === x)?.slot !== slot || (!isSingle && x !== id));
    if (build.includes(id)) {
      if (slot === "power" || !isSingle) { sfx.release(); setBuild(build.filter((x) => x !== id)); }
      return;
    }
    const next = isSingle ? [...without, id] : [...build, id];
    if (roverStats(next, planet).cost > BUDGET) { sfx.error(); return; }
    sfx.pick();
    setBuild(next);
  };

  return (
    <div className="garage">
      <div className="planet-picker">
        {(Object.keys(PLANETS) as RoverPlanet[]).map((p) => (
          <button key={p} className={`planet-card ${p === planet ? "on" : ""} ${p.toLowerCase()}`}
                  onClick={() => { sfx.click(); setPlanet(p); }}>
            <div className="planet-orb" />
            <div>
              <b>{p}</b>
              <div className="small">{PLANETS[p].blurb}</div>
              <div className="small warn-text">⚠ {PLANETS[p].hazard}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="garage-grid">
        <section className="catalog">
          {ORDER.map((slot) => (
            <div key={slot} className="cat-block">
              <h4>{SLOT_LABEL[slot]}</h4>
              <div className="cards">
                {ROVER_PARTS.filter((p) => p.slot === slot).map((p) => {
                  const on = build.includes(p.id);
                  return (
                    <button key={p.id} className={`card ${on ? "picked" : ""}`} onClick={() => toggle(p.id, slot)}>
                      <div className="card-top"><span className="name">{p.icon} {p.name}</span><span className="cost">${p.cost}M</span></div>
                      <div className="spec">{p.desc}</div>
                      <div className="spec mono">{p.mass} kg</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="build">
          <h3>Your rover <span className="muted small">drag to rotate</span></h3>
          <RoverPreview build={build} />
          <div className={`budget ${s.cost > BUDGET ? "bad" : ""}`}>${BUDGET - s.cost}M left · {s.mass} kg</div>
          <div className="stats">
            <Bar label="Top speed" value={s.topSpeed} max={30} text={`${(s.topSpeed * 3.6).toFixed(0)} km/h`} />
            <Bar label="Acceleration" value={s.accel} max={14} text={`${s.accel.toFixed(1)} m/s²`} bad={s.accel < 2} />
            <Bar label="Climb" value={s.climb} max={45} text={`${s.climb}°`} />
            <Bar label="Durability" value={s.hp} max={170} text={`${s.hp} HP`} />
            <Bar label="Endurance (full throttle)" value={Math.min(s.endurance, 240)} max={240}
                 text={s.endurance === Infinity ? "∞ (power-positive!)" : `${Math.round(s.endurance)} s`} bad={s.endurance < 60} />
            <Bar label="Recharge" value={s.genW} max={200} text={`${s.genW.toFixed(0)} W`} />
            <Bar label="Radar range" value={s.radar} max={90} text={`${s.radar} m`} />
          </div>
          <ul className="warnings">
            {s.warnings.length === 0 && <li className="ok">Rover is go for landing.</li>}
            {s.warnings.map((w) => <li key={w} className={w.includes("can't") || w.includes("Missing") || w.includes("Over") ? "fail" : "warn"}>{w}</li>)}
          </ul>
          <button className="launch-btn" style={{ width: "100%", marginTop: 12 }} disabled={!ready}
                  onClick={() => { sfx.ready(); onDeploy(); }}>
            DEPLOY TO {planet.toUpperCase()}
          </button>
          {best > 0 && <p className="muted small center">Your best on {planet}: <b>{best}</b></p>}
          <div className="controls-hint small muted">
            <b>Controls:</b> W/S or ↑/↓ drive · A/D or ←/→ steer · SHIFT boost · SPACE jump jets · R reset if stuck
          </div>
        </section>
      </div>
    </div>
  );
}
