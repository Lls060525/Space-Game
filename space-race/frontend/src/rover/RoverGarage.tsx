import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { sfx } from "../lib/sfx";
import { disposeObject } from "../three/models";
import {
  BUDGET, PLANETS, ROVER_PARTS, SINGLE, SLOT_LABEL, TIME_COMPRESSION, buildReady, fmtTime, roverStats, siteTime, sunElevation,
  type Build, type LiveSun, type RoverPlanet, type RoverSite, type Slot,
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

export function RoverGarage({ planet, setPlanet, build, setBuild, onDeploy, best, live, nasaNote, site, offsetH = 0, schedule, setSchedule }:
  { planet: RoverPlanet; setPlanet: (p: RoverPlanet) => void; build: Build; setBuild: (b: Build) => void; onDeploy: () => void; best: number;
    live?: LiveSun; nasaNote?: string; site?: RoverSite; offsetH?: number;
    schedule?: "now" | "morning"; setSchedule?: (s: "now" | "morning") => void }) {
  const lt = siteTime(site, 0, offsetH);
  const el = sunElevation(site, lt);
  const s = useMemo(() => roverStats(build, planet, live, el), [build, planet, live, el]);
  const ready = buildReady(s);

  const toggle = (id: string, slot: Slot) => {
    const isSingle = SINGLE.includes(slot);
    const without = build.filter((x) => ROVER_PARTS.find((p) => p.id === x)?.slot !== slot || (!isSingle && x !== id));
    if (build.includes(id)) {
      if (slot === "power" || !isSingle) { sfx.release(); setBuild(build.filter((x) => x !== id)); }
      return;
    }
    const next = isSingle ? [...without, id] : [...build, id];
    if (roverStats(next, planet, live, el).cost > BUDGET) { sfx.error(); return; }
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
          <div className="live-sun small">
            <span className={`live-dot ${s.live ? "on" : ""}`} /> {s.live ? "Live JPL Horizons" : "Nominal orbit"}: {planet} is{" "}
            <b>{s.sunAU.toFixed(3)} AU</b> from the Sun → {Math.round(s.irradiance)} W/m² above the atmosphere,
            {" "}{Math.round(s.irradiance * PLANETS[planet].transmission)} W/m² on the ground.
            {nasaNote && <> {nasaNote}</>}
          </div>
          {site && (
            <div className="live-sun small">
              📍 <b>{site.name}</b> ({Math.abs(site.lat).toFixed(2)}°{site.lat >= 0 ? "N" : "S"}, {site.lon_e.toFixed(2)}°E)
              {lt !== null ? <> · local solar time <b>{fmtTime(lt)}</b> · Sun {el!.toFixed(0)}° {el! < 0 ? "(night)" : "above the horizon"}
                {" "}→ solar deck {Math.round(s.genW)} W of {Math.round(s.genNoonW)} W</> : <> · {site.source}</>}
              {site.season && <> · {site.season} (Ls {site.ls_deg?.toFixed(0)}°), {site.dust_season ? "DUST-STORM SEASON" : "not dust-storm season"}</>}
              {site.phase && <> · Moon phase: {site.phase}</>}
              {setSchedule && lt !== null && (
                <span className="row" style={{ marginLeft: 8, display: "inline-flex", gap: 4 }}>
                  <button className={schedule === "now" ? "on" : ""} onClick={() => setSchedule("now")}>Drive now (real time)</button>
                  <button className={schedule === "morning" ? "on" : ""} onClick={() => setSchedule("morning")}>Wait for 09:00 local</button>
                </span>
              )}
            </div>
          )}
          <div className="stats">
            <Bar label={`Weight on ${planet}`} value={s.weightN} max={4500}
                 text={`${Math.round(s.weightN)} N (${Math.round(s.earthWeightN)} N on Earth)`} />
            <Bar label="Ground pressure" value={s.groundKPa} max={40} text={`${s.groundKPa.toFixed(1)} kPa · Crr ${s.crr.toFixed(2)}`} bad={s.sinkage > 0.3} />
            <Bar label="Top speed (flat)" value={s.topSpeed} max={12} text={`${(s.topSpeed * 3.6).toFixed(1)} km/h`} />
            <Bar label="Acceleration" value={s.accel} max={5} text={`${s.accel.toFixed(2)} m/s²`} bad={s.accel < 0.3} />
            <Bar label="Max slope" value={s.climb} max={45} text={`${s.climb}°`} bad={s.climb < 15} />
            <Bar label="Durability" value={s.hp} max={170} text={`${s.hp} HP`} />
            <Bar label="Endurance (full throttle)" value={Math.min(s.endurance, 240)} max={240}
                 text={s.endurance === Infinity ? "∞ (power-positive!)" : `${Math.round(s.endurance)} s`} bad={s.endurance < 60} />
            <Bar label="Recharge (now)" value={s.genW} max={200} text={`${s.genW.toFixed(0)} W${s.heaterW ? ` · heaters −${s.heaterW} W` : ""}`} bad={s.night && s.heaterW > 0} />
            <Bar label="Camera sight range" value={s.radar} max={90} text={`${s.radar} m${s.navcam ? " · AutoNav · samples ×1.25" : " (no navcams)"}`} bad={!s.navcam} />
            <Bar label="Direct-to-Earth link" value={s.uplinkMBs} max={60}
                 text={s.uplink ? `${s.uplinkMBs.toFixed(1)} MB/s at ${s.earthAU.toFixed(3)} AU · light-time ${s.lightS < 60 ? `${s.lightS.toFixed(1)} s` : `${(s.lightS / 60).toFixed(1)} min`}` : "none: lander relay only"}
                 bad={!s.uplink} />
            {s.jets && <Bar label="Jump-jet hops" value={s.hops} max={12} text={`${s.hops} × ${s.hopGasKg.toFixed(2)} kg gas`} bad={s.hops < 3} />}
          </div>
          <div className="mass-budget small">
            <div className="muted">Mass budget</div>
            {s.massRows.map((r) => (
              <div key={r.label} className="mb-row">
                <span>{r.label}</span>
                <span className="mb-bar"><span style={{ width: `${r.pct}%` }} /></span>
                <span className="mono">{r.kg} kg · {r.pct.toFixed(0)}%</span>
              </div>
            ))}
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
            <br />Physics: F = ma with real gravity, traction, rolling resistance, grade and drag. Energy runs {TIME_COMPRESSION}× faster than real time.
          </div>
        </section>
      </div>
    </div>
  );
}
