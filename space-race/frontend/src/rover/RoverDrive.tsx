import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { sfx } from "../lib/sfx";
import { disposeObject, makeStars, planetTexture } from "../three/models";
import { Particles } from "../three/particles";
import {
  CDA, ENERGY_K, G0, HOP_HEIGHT, JET_ISP, MISSION_SECONDS, MOTOR_EFF, NIGHT_HEATER_W, PLANETS, TIME_COMPRESSION,
  DATA_MB, HGA_TX_W, NAVCAM_DATA, NAVCAM_VALUE, RELAY_RANGE,
  earthElevation, fmtTime, partsOf, roverStats, siteTime, sunElevation, sunOnDeck,
  type Build, type LiveSun, type RoverPlanet, type RoverSite,
} from "./parts";
import { buildRover } from "./roverModel";
import { HALF, Terrain } from "./terrain";

export interface DriveResult {
  score: number; banked: number; lostCargo: number; collected: number; legendary: number;
  reason: string; survived: boolean; distance: number; maxAir: number;
}

interface Hud {
  time: number; energy: number; hp: number; speed: number; carried: number; banked: number; collected: number;
  storm: boolean; drill: number; onPad: boolean; air: boolean; lowBattery: boolean; hot: boolean;
  slip: boolean; slope: number; powerKW: number; force: number; gas: number;
  localTime: number | null; sunEl: number | null; genW: number;
  queueMB: number; inflight: number; earthUp: boolean; earthEl: number; tx: boolean; autonav: boolean;
  sampleHint: string;
}
interface Pop { id: number; text: string; color: string; big?: boolean }

const KIND_COLOR = { common: 0x4fd1ff, rare: 0xc084fc, legendary: 0xffd166 } as const;
const LANDER_R = 8;

export function RoverDrive({ planet, build, onEnd, live, activity = 1.5, site, offsetH = 0 }:
  { planet: RoverPlanet; build: Build; onEnd: (r: DriveResult) => void; live?: LiveSun; activity?: number;
    site?: RoverSite; offsetH?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<() => void>(() => {});
  const [hud, setHud] = useState<Hud | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [banner, setBanner] = useState<{ text: string; tone: string } | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const P = PLANETS[planet];
    const elAt = (driveS: number) => sunElevation(site, siteTime(site, driveS * TIME_COMPRESSION, offsetH));
    const S = roverStats(build, planet, live, elAt(0));
    const hasRtg = partsOf(build).some((p) => p.slot === "power" && !p.solar);
    const stormSeason = site?.dust_season ?? true;     // real Mars season from the Mars24 solar longitude
    const hasLaser = S.scan > 5;
    const g = P.gravity;
    const m = S.mass, mEff = 1.05 * m;          // +5 % rotating inertia (wheels, gears)
    const hopV = Math.sqrt(2 * g * HOP_HEIGHT);
    const solarPowered = partsOf(build).some((p) => p.solar);

    /* ---------------- renderer / scene ---------------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(P.sky);
    const fog = new THREE.FogExp2(new THREE.Color(P.fog).getHex(), P.fogDensity);
    scene.fog = fog;
    const camera = new THREE.PerspectiveCamera(62, el.clientWidth / el.clientHeight, 0.1, 3000);

    scene.add(new THREE.HemisphereLight(new THREE.Color(P.sky).lerp(new THREE.Color(0xffffff), 0.5), 0x201510, planet === "Moon" ? 0.35 : 0.8));
    const sun = new THREE.DirectionalLight(planet === "Venus" ? 0xffd9a0 : 0xffffff, planet === "Venus" ? 1.4 : 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
    scene.add(sun, sun.target);

    if (planet === "Moon") {
      scene.add(makeStars(4000, 1500));
      const earth = new THREE.Mesh(new THREE.SphereGeometry(60, 40, 40),
        new THREE.MeshBasicMaterial({ map: planetTexture("Earth"), fog: false }));
      earth.position.set(-700, 380, -900);
      scene.add(earth);
    }

    const terrain = new Terrain(planet);
    const ground = terrain.buildMesh();
    scene.add(ground);
    const H = (x: number, z: number) => terrain.height(x, z);

    // lander + charging pad
    const lander = new THREE.Group();
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xd4a72c, metalness: 0.9, roughness: 0.3 }));
    lb.position.y = 3.2; lb.castShadow = true;
    lander.add(lb);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6), new THREE.MeshStandardMaterial({ color: 0xc0c4cc, metalness: 0.8 }));
      leg.position.set(Math.cos(a) * 2.6, 1.4, Math.sin(a) * 2.6);
      leg.rotation.z = Math.cos(a) * 0.4; leg.rotation.x = -Math.sin(a) * 0.4;
      lander.add(leg);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
    beacon.position.y = 4.7;
    lander.add(beacon);
    const pad = new THREE.Mesh(new THREE.RingGeometry(LANDER_R - 0.6, LANDER_R, 48),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.15;
    lander.add(pad);
    const landerBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 140, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    landerBeam.position.y = 70;
    lander.add(landerBeam);
    lander.position.set(0, H(0, 0), 0);
    scene.add(lander);

    // boulders (solid) + decorative pebbles
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.ground[0]).multiplyScalar(0.8), roughness: 1, flatShading: true });
    for (const b of terrain.boulders) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(b.r, 0), rockMat);
      m.position.set(b.x, H(b.x, b.z) + b.r * 0.45, b.z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
    const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.35, 0), rockMat, 700);
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
    for (let i = 0; i < 700; i++) {
      const x = (Math.random() - 0.5) * 2 * HALF, z = (Math.random() - 0.5) * 2 * HALF;
      tmpQ.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0));
      tmpS.setScalar(0.4 + Math.random() * 1.4);
      tmpM.compose(new THREE.Vector3(x, H(x, z), z), tmpQ, tmpS);
      pebbles.setMatrixAt(i, tmpM);
    }
    pebbles.receiveShadow = true;
    scene.add(pebbles);

    // samples
    const sampleMeshes = terrain.samples.map((s) => {
      const grp = new THREE.Group();
      const size = s.kind === "legendary" ? 1.1 : s.kind === "rare" ? 0.75 : 0.5;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0),
        new THREE.MeshStandardMaterial({ color: KIND_COLOR[s.kind], emissive: KIND_COLOR[s.kind], emissiveIntensity: 1.4, roughness: 0.2 }));
      gem.position.y = size + 0.6;
      grp.add(gem);
      if (s.kind !== "common") {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(s.kind === "legendary" ? 0.7 : 0.25, 0.25, s.kind === "legendary" ? 120 : 18, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: KIND_COLOR[s.kind], transparent: true, opacity: s.kind === "legendary" ? 0.35 : 0.2,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = s.kind === "legendary" ? 60 : 9;
        grp.add(beam);
      }
      grp.position.set(s.x, H(s.x, s.z), s.z);
      scene.add(grp);
      return { s, grp, gem, taken: false, beam: grp.children[1] as THREE.Object3D | undefined };
    });

    // rover
    const rig = buildRover(build);
    rig.root.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    scene.add(rig.root);

    const dust = new Particles(3000, 1.6, 0.94, 0.6);
    const sparks = new Particles(1500, 0.9, 0.92, 2);
    const storm = new Particles(2500, 1.2, 1.0);
    scene.add(dust.points, sparks.points, storm.points);
    const dustCol = new THREE.Color(P.dust);
    const laserLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0 }));
    scene.add(laserLine);

    /* ---------------- input ---------------- */
    const keys = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      keys.add(k);
    };
    const onUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    /* ---------------- game state ---------------- */
    const st = {
      pos: new THREE.Vector3(0, 0, LANDER_R + 3), heading: 0, speed: 0, y: H(0, LANDER_R + 3), vy: 0, grounded: true,
      lastGround: H(0, LANDER_R + 3), energy: S.capacity, hp: S.hp, time: 0, carried: 0, banked: 0, collected: 0,
      legendary: 0, drill: 0, drillTarget: -1, jetT: 0, jumpCd: 0, deadT: 0, ended: false, storm: false,
      airT: 0, maxAir: 0, distance: 0, beepT: 0, shake: 0, laserT: 0, stormAnnounced: false, stormOver: false,
      gas: S.gasKg, slip: false, slope: 0, pElec: 0, force: 0, sunEl: null as number | null, gen: 0,
      sampleHint: "",
      carriedMB: 0, inflight: [] as { at: number; value: number }[], tx: false, earthEl: 45, autonavT: 0, autonavMsgT: 0,
    };
    const lightGameS = S.lightS / TIME_COMPRESSION;   // real light-time, compressed like everything else
    let popId = 0;
    const pop = (text: string, color: string, big = false) => {
      const id = ++popId;
      setPops((p) => [...p.slice(-5), { id, text, color, big }]);
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1600);
    };
    const announce = (text: string, tone: string, ms = 2600) => {
      setBanner({ text, tone });
      setTimeout(() => setBanner((b) => (b?.text === text ? null : b)), ms);
    };
    const hit = (amount: number) => {
      st.hp -= amount;
      st.shake = Math.min(1.5, 0.3 + amount / 20);
      sfx.thud();
      setShake(true); setTimeout(() => setShake(false), 300);
      if (amount > 4) pop(`-${Math.round(amount)} HP`, "#f87171");
    };
    let engine: ReturnType<typeof sfx.engine> | null = null;

    const end = (reason: string, survived: boolean) => {
      if (st.ended) return;
      st.ended = true;
      engine?.stop();
      // data already on its way at light speed still arrives; data never sent is lost with the rover
      const arriving = st.inflight.reduce((a, f) => a + f.value, 0);
      const lost = st.carried;
      const banked = st.banked + arriving;
      const score = Math.round(banked + (survived ? 50 : 0) + (survived ? Math.max(0, st.hp) * 0.3 : 0));
      if (!survived) sfx.explosion();
      announce(reason, survived ? "ok" : "fail", 4000);
      setTimeout(() => onEnd({
        score, banked: Math.round(banked), lostCargo: Math.round(lost), collected: st.collected, legendary: st.legendary,
        reason, survived, distance: Math.round(st.distance), maxAir: Math.round(st.maxAir * 10) / 10,
      }), 2200);
    };
    abortRef.current = () => end("Mission aborted", true);

    announce(S.uplink
      ? `Touchdown on ${planet}! Collect samples: the antenna sends their data to Earth (${lightGameS.toFixed(1)} s light-time).`
      : `Touchdown on ${planet}! Collect samples and bring their data back to the lander's relay.`, "info", 3500);

    /* ---------------- loop ---------------- */
    const dir = new THREE.Vector3(), n = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const basis = new THREE.Matrix4(), qTarget = new THREE.Quaternion();
    const camPos = new THREE.Vector3(0, 10, -10);
    let prev = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;
      if (!st.ended) {
        st.time += dt;
        const up = keys.has("w") || keys.has("arrowup");
        const down = keys.has("s") || keys.has("arrowdown");
        const left = keys.has("a") || keys.has("arrowleft");
        const rightK = keys.has("d") || keys.has("arrowright");
        const boost = keys.has("shift");
        if ((up || down) && !engine) engine = sfx.engine();

        // Mars dust storm event
        if (P.storm && stormSeason) {
          st.storm = st.time > 70 && st.time < 110;
          if (st.storm && !st.stormAnnounced) { st.stormAnnounced = true; announce(`⚠ DUST STORM! Optical depth spikes, solar power down ${Math.round((1 - P.stormTransmission / P.transmission) * 100)}%`, "warn", 3500); sfx.warn(); }
          if (!st.storm && st.stormAnnounced && !st.stormOver) { st.stormOver = true; announce("Storm clearing", "ok"); }
        }
        fog.density += ((st.storm ? P.fogDensity * 4.5 : P.fogDensity) - fog.density) * dt;

        let throttle = up ? 1 : down ? -0.6 : 0;
        if (st.energy <= 0) throttle = 0;
        const steer = (left ? 1 : 0) - (rightK ? 1 : 0);
        st.heading += steer * 1.9 * dt * (st.speed >= -0.1 ? 1 : -1) * Math.min(1, 0.35 + Math.abs(st.speed) / 8);
        dir.set(Math.sin(st.heading), 0, Math.cos(st.heading));

        // ---- drive force: real Newtonian forces on a rover of S.mass kg ----
        const boosting = boost && throttle > 0 && st.energy > 0;
        st.slip = false;
        let pMechUsed = 0;
        if (st.grounded) {
          const ahead = (H(st.pos.x + dir.x * 1.2, st.pos.z + dir.z * 1.2) - H(st.pos.x - dir.x * 1.2, st.pos.z - dir.z * 1.2)) / 2.4;
          const th = Math.atan(ahead);
          st.slope = th * 180 / Math.PI;
          const N = m * g * Math.cos(th);                         // normal force
          const traction = S.mu * N;                              // max force the ground can take
          const Fg = -m * g * Math.sin(th);                       // gravity along the slope
          const v = st.speed, av = Math.abs(v), sgn = Math.sign(v);
          const Frr = S.crr * N;                                  // rolling resistance (with sinkage)
          const Fdrag = -0.5 * P.airDensity * CDA * v * av;
          let Fdrive = 0;
          if (throttle !== 0) {
            const dirSign = Math.sign(throttle);
            const pMech = S.powerW * (boosting ? 1.4 : 1);
            const vmax = S.vmax * (boosting ? 1.25 : 1) * (dirSign < 0 ? 0.4 : 1);
            if (v * dirSign < -0.2) {
              Fdrive = dirSign * traction;                        // braking against motion
            } else {
              Fdrive = Math.min(S.forceN * (boosting ? 1.3 : 1), pMech / Math.max(av, 0.4)) * Math.abs(throttle);
              if (av >= vmax) Fdrive = 0;
              Fdrive *= dirSign;
            }
          } else if (av > 0.05) {
            Fdrive = -sgn * Math.min(traction * 0.6, (mEff * av) / dt); // brakes hold when you let go
          }
          if (Math.abs(Fdrive) > traction) { Fdrive = Math.sign(Fdrive) * traction; st.slip = throttle !== 0; }
          pMechUsed = Math.max(0, Fdrive * v);
          st.force = Fdrive;
          // static case: brakes / rolling resistance can hold the rover still on gentle slopes
          if (av < 0.05 && throttle === 0 && Math.abs(Fg) <= traction) {
            st.speed = 0;
          } else {
            const Fres = av < 0.05 ? -Math.sign(Fdrive + Fg) * Math.min(Frr, Math.abs(Fdrive + Fg)) : -sgn * Frr;
            st.speed += ((Fdrive + Fg + Fdrag + Fres) / mEff) * dt;
            if (Math.abs(Fg) > traction && throttle === 0) st.slip = true;   // sliding down a steep slope
          }
          const slipping = st.slip;
          // wheel dust
          if (Math.abs(st.speed) > 1 || slipping) {
            const nDust = Math.min(8, Math.floor(Math.abs(st.speed)) + (slipping ? 6 : 0));
            for (let i = 0; i < nDust; i++) {
              dust.emit(new THREE.Vector3(st.pos.x - dir.x * 1.5 + (Math.random() - 0.5) * 2.5, st.y + 0.3, st.pos.z - dir.z * 1.5 + (Math.random() - 0.5) * 2.5),
                new THREE.Vector3((Math.random() - 0.5) * 2 - dir.x * st.speed * 0.3, Math.random() * 2.5 * (3 / g + 0.4), (Math.random() - 0.5) * 2 - dir.z * st.speed * 0.3),
                1 + Math.random() * 1.5, dustCol.clone().multiplyScalar(0.35));
            }
          }
        } else {
          st.speed -= (0.5 * P.airDensity * CDA * st.speed * Math.abs(st.speed) / mEff) * dt;
        }

        // ---- energy ----
        // real local solar time at the landing site advances with mission time
        const elNow = elAt(st.time);
        st.sunEl = elNow;
        const deck = sunOnDeck(planet, elNow);
        const gen = (solarPowered ? S.genNoonW * deck : S.genNoonW) * (st.storm && solarPowered ? P.stormTransmission / P.transmission : 1);
        st.gen = gen;
        const nightNow = elNow !== null && elNow < 0 && planet !== "Venus";
        const heater = nightNow && !hasRtg ? NIGHT_HEATER_W[planet] : 0;
        const light = Math.max(0.06, planet === "Venus" ? 1 : deck ** 0.5);
        sun.intensity = (planet === "Venus" ? 1.4 : 2.6) * light;
        // electrical draw = idle + heaters + wheel power / efficiency + copper losses while the motors push
        const draw = S.drawIdle - S.heaterW + heater + pMechUsed / MOTOR_EFF + 0.12 * S.powerW * Math.abs(throttle) * (boosting ? 1.6 : 1)
          + (st.tx ? HGA_TX_W : 0);
        st.pElec = draw;
        st.energy = Math.min(S.capacity, st.energy + (gen - draw) * ENERGY_K * dt);
        const dLander = Math.hypot(st.pos.x, st.pos.z);
        const onPad = dLander < LANDER_R && Math.abs(st.speed) < 3;
        if (onPad) st.energy = Math.min(S.capacity, st.energy + S.capacity * 0.35 * dt);
        if (st.energy <= 0) {
          st.energy = 0;
          st.deadT = gen < S.drawIdle && !onPad ? st.deadT + dt : 0;
          if (st.deadT > 4) end("Battery flat - rover stranded", false);
        }
        st.beepT -= dt;
        if (st.energy < S.capacity * 0.15 && st.beepT <= 0) { sfx.tick(); st.beepT = 1.1; }
        if (P.heat && !S.cooling) st.hp -= 1.6 * dt;
        st.hp -= P.radiation * activity * dt;   // NASA DONKI solar activity -> radiation dose

        // ---- AutoNav (navcams): stereo hazard detection brakes before rocks, like Perseverance ----
        st.autonavT -= dt;
        if (S.navcam && st.grounded && st.speed > 1.2) {
          for (const b of terrain.boulders) {
            const dx = b.x - st.pos.x, dz = b.z - st.pos.z;
            const along = dx * dir.x + dz * dir.z;
            const lat = Math.abs(dx * dir.z - dz * dir.x);
            if (along > 0 && along < 4 + st.speed * 1.2 && lat < b.r + 1.4) {
              st.speed = Math.max(0, st.speed - S.mu * g * 1.2 * dt);   // brake at the traction limit
              st.autonavT = 0.4;
              if (st.autonavMsgT <= 0) { pop("AutoNav: hazard ahead, braking", "#7dd3fc"); st.autonavMsgT = 4; }
              break;
            }
          }
        }
        st.autonavMsgT -= dt;

        // ---- move + world bounds + boulders ----
        const step = st.speed * dt;
        st.pos.x += dir.x * step; st.pos.z += dir.z * step;
        st.distance += Math.abs(step);
        if (Math.abs(st.pos.x) > HALF || Math.abs(st.pos.z) > HALF) {
          st.pos.x = THREE.MathUtils.clamp(st.pos.x, -HALF, HALF);
          st.pos.z = THREE.MathUtils.clamp(st.pos.z, -HALF, HALF);
          st.speed *= -0.3;
          announce("Edge of the mapped zone", "warn", 1200);
        }
        for (const b of terrain.boulders) {
          const dx = st.pos.x - b.x, dz = st.pos.z - b.z;
          const d = Math.hypot(dx, dz), min = b.r + 1.3;
          if (d < min && st.y < H(b.x, b.z) + b.r * 1.3) {
            st.pos.x = b.x + (dx / d) * min; st.pos.z = b.z + (dz / d) * min;
            const v = Math.abs(st.speed);
            if (v > 1.5) hit((0.5 * m * (v - 1.5) ** 2) / 120);   // crash energy (J) / chassis toughness
            st.speed *= -0.35;
          }
        }

        // ---- vertical: terrain following, crest launches, jets, landings ----
        const gNow = H(st.pos.x, st.pos.z);
        st.jumpCd -= dt;
        if (st.grounded) {
          const follow = THREE.MathUtils.clamp((gNow - st.lastGround) / dt, -40, 40);
          if (follow < st.vy - g * dt * 1.5 && Math.abs(st.speed) > 3) st.grounded = false;  // launched off a crest
          else { st.vy = follow; st.y = gNow; }
        }
        if (keys.has(" ") && S.jets && st.grounded && st.jumpCd <= 0) {
          // rocket equation for a hop: gas = m·Δv / (Isp·g0); heavier rovers burn more gas
          const gasNeed = (m * hopV) / (JET_ISP * G0);
          if (st.gas >= gasNeed) {
            st.vy = hopV; st.grounded = false; st.gas -= gasNeed; st.jumpCd = 0.8; st.jetT = 0.45;
            sfx.whoosh();
          } else if (st.jumpCd <= 0) { st.jumpCd = 1.5; pop("Jet gas empty", "#f87171"); }
        }
        if (!st.grounded) {
          st.vy -= g * dt;
          st.y += st.vy * dt;
          st.airT += dt;
          if (st.y <= gNow) {
            const impact = -st.vy;
            if (st.airT > 0.6) {
              st.maxAir = Math.max(st.maxAir, st.airT);
              if (st.airT > 1.2) pop(`AIR ${st.airT.toFixed(1)}s!`, "#fbbf24", true);
              for (let i = 0; i < 40; i++) dust.emit(new THREE.Vector3(st.pos.x, gNow + 0.3, st.pos.z),
                new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 3, (Math.random() - 0.5) * 8), 1.5, dustCol.clone().multiplyScalar(0.4));
            }
            const safe = 2.5 + S.wheelR * 4;                 // suspension stroke absorbs this much
            if (impact > safe) hit((0.5 * m * (impact - safe) ** 2) / 120);
            st.y = gNow; st.vy = 0; st.grounded = true; st.airT = 0;
          }
        }
        st.lastGround = gNow;
        st.jetT -= dt;
        rig.jetFlames.forEach((f) => { f.visible = st.jetT > 0; f.scale.y = 0.6 + Math.random() * 0.6; });

        // reset if stuck / flipped
        if (keys.has("r")) { keys.delete("r"); st.y = gNow + 2; st.vy = 0; st.speed = 0; st.grounded = false; }

        // ---- orientation ----
        if (st.grounded) terrain.normal(st.pos.x, st.pos.z, n); else n.lerp(new THREE.Vector3(0, 1, 0), dt * 0.5).normalize();
        fwd.copy(dir).addScaledVector(n, -dir.dot(n)).normalize();
        right.crossVectors(n, fwd).normalize();
        basis.makeBasis(right, n, fwd);
        qTarget.setFromRotationMatrix(basis);
        rig.root.quaternion.slerp(qTarget, 1 - Math.exp(-dt * 10));
        rig.root.position.set(st.pos.x, st.y, st.pos.z);
        for (const w of rig.wheels) w.rotation.x += (st.speed * dt) / rig.wheelR;
        if (rig.dish) rig.dish.rotation.z += dt * 0.6;

        // ---- sampling ----
        // laser: zaps within 9 m below 6 m/s (needs a steady aim); drill: within 4.5 m, below 3 m/s, wheels down, 0.9 s
        const LASER_MAX = 6, DRILL_MAX = 3, DRILL_REACH = 4.5;
        const vAbs = Math.abs(st.speed);
        let drilling = false;
        let nearest = Infinity;
        st.sampleHint = "";
        for (let i = 0; i < sampleMeshes.length; i++) {
          const sm = sampleMeshes[i];
          if (sm.taken) continue;
          sm.gem.rotation.y += dt * 1.5;
          sm.gem.position.y += Math.sin(now / 300 + i) * 0.004;
          const d = Math.hypot(sm.s.x - st.pos.x, sm.s.z - st.pos.z);
          if (sm.beam) sm.beam.visible = sm.s.kind === "legendary" || d < S.radar;   // you can only spot what your cameras see
          sm.gem.visible = d < S.radar * 1.6;
          if (d < nearest && d < 15) {
            nearest = d;
            st.sampleHint = !S.canSample ? "No laser or drill on board: can't sample"
              : hasLaser ? (d > S.scan + 0.5 ? `Laser range is 9 m (sample ${d.toFixed(0)} m away)`
                : vAbs >= LASER_MAX ? "Too fast for the laser: slow below 22 km/h" : "")
              : (!st.grounded ? "Land first to drill" : d > DRILL_REACH ? `Drive within ${DRILL_REACH} m to drill (${d.toFixed(1)} m)`
                : st.slip ? "Sliding on the slope: can't hold still to drill"
                : vAbs >= DRILL_MAX ? "Slow below 11 km/h to drill" : "");
          }
          if (!S.canSample || d > Math.max(S.scan + 0.5, DRILL_REACH)) continue;
          let collect = false, drilled = false;
          const canDrill = S.drill && st.grounded && vAbs < DRILL_MAX && d < DRILL_REACH && !st.slip;
          if (canDrill) {
            drilling = true;
            if (st.drillTarget !== i) { st.drillTarget = i; st.drill = 0; }
            st.drill += dt / 0.9;
            for (let k = 0; k < 3; k++) sparks.emit(sm.grp.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
              new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6), 0.4, new THREE.Color(0xffd166));
            if (st.drill >= 1) { collect = true; drilled = true; }
          } else if (hasLaser && vAbs < LASER_MAX && d <= S.scan + 0.5) {
            collect = true;
            st.laserT = 0.25;
            const arr = laserLine.geometry.attributes.position.array as Float32Array;
            const tip = new THREE.Vector3(); (rig.laserTip ?? rig.root).getWorldPosition(tip);
            arr.set([tip.x, tip.y, tip.z, sm.s.x, sm.grp.position.y + 1, sm.s.z]);
            laserLine.geometry.attributes.position.needsUpdate = true;
          }
          if (collect) {
            sm.taken = true; sm.grp.visible = false;
            const value = Math.round(sm.s.value * (drilled ? 1.6 : 1) * (S.navcam ? NAVCAM_VALUE : 1));
            const mb = DATA_MB[sm.s.kind] * (S.navcam ? NAVCAM_DATA : 1) * (drilled ? 1.5 : 1);
            st.collected++;
            st.carried += value; st.carriedMB += mb;      // science only counts once its data reaches Earth
            if (sm.s.kind === "legendary") { st.legendary++; sfx.fanfare(); pop(`LEGENDARY +${value} (${Math.round(mb)} MB)`, "#ffd166", true); }
            else { sm.s.kind === "rare" ? sfx.ready() : sfx.chime(); pop(`+${value} · ${Math.round(mb)} MB`, sm.s.kind === "rare" ? "#c084fc" : "#4fd1ff"); }
            sparks.burst(sm.grp.position.clone().add(new THREE.Vector3(0, 1, 0)), sm.s.kind === "legendary" ? 300 : 90, 9, 0.9,
              [new THREE.Color(KIND_COLOR[sm.s.kind]), new THREE.Color(0xffffff)]);
            st.drill = 0; st.drillTarget = -1;
          }
        }
        if (!drilling && st.drillTarget !== -1) { st.drill = Math.max(0, st.drill - dt); }
        st.laserT -= dt;
        (laserLine.material as THREE.LineBasicMaterial).opacity = st.laserT > 0 ? 0.9 : 0;
        if (rig.drillBit) rig.drillBit.rotation.y += drilling ? dt * 30 : 0;

        // ---- telecom: UHF relay at the lander, or the high-gain antenna direct to Earth ----
        const lt = siteTime(site, st.time * TIME_COMPRESSION, offsetH);
        st.earthEl = earthElevation(site, lt);
        st.tx = false;
        if (st.carried > 0 && dLander < RELAY_RANGE) {
          st.inflight.push({ at: st.time + lightGameS, value: st.carried });   // relay via orbiter
          pop(`RELAYED ${Math.round(st.carriedMB)} MB via lander`, "#34d399", true);
          sfx.matchFound();
          st.carried = 0; st.carriedMB = 0;
        } else if (S.uplink && st.carriedMB > 0 && st.earthEl > 2 && st.energy > 0) {
          st.tx = true;
          const sent = Math.min(st.carriedMB, S.uplinkMBs * (st.storm ? 0.6 : 1) * dt);
          const value = st.carried * (sent / st.carriedMB);
          st.carried -= value; st.carriedMB -= sent;
          const last = st.inflight[st.inflight.length - 1];
          if (last && st.time + lightGameS - last.at < 0.25) last.value += value;
          else st.inflight.push({ at: st.time + lightGameS, value });
          if (st.carriedMB < 1e-3) { st.carried = 0; st.carriedMB = 0; }
        }
        while (st.inflight.length && st.inflight[0].at <= st.time) {
          const f = st.inflight.shift()!;
          st.banked += f.value;
          if (f.value >= 5) pop(`📡 Earth received +${Math.round(f.value)}`, "#34d399");
        }

        // storm streaks
        if (st.storm) for (let i = 0; i < 25; i++) storm.emit(
          new THREE.Vector3(st.pos.x - 40 + Math.random() * 20, st.y + Math.random() * 12, st.pos.z + (Math.random() - 0.5) * 60),
          new THREE.Vector3(30 + Math.random() * 10, -1, 4), 2.5, dustCol.clone().multiplyScalar(0.5));

        engine?.set(Math.abs(st.speed) / Math.max(1, S.topSpeed), Math.abs(throttle) * (boosting ? 1.5 : 1));

        if (st.hp <= 0) end(P.heat && !S.cooling ? "Electronics cooked by Venus heat" : "Rover destroyed", false);
        else if (st.time >= MISSION_SECONDS) end("Mission time complete!", true);
      }

      // ---- camera ----
      const behind = new THREE.Vector3(Math.sin(st.heading), 0, Math.cos(st.heading)).multiplyScalar(-11);
      const desired = new THREE.Vector3(st.pos.x, st.y, st.pos.z).add(behind).add(new THREE.Vector3(0, 4.8, 0));
      desired.y = Math.max(desired.y, H(desired.x, desired.z) + 2);
      camPos.lerp(desired, 1 - Math.exp(-dt * 4));
      camera.position.copy(camPos);
      if (st.shake > 0.01) { camera.position.add(new THREE.Vector3((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake, 0)); st.shake *= 0.88; }
      camera.lookAt(st.pos.x, st.y + 1.6, st.pos.z);
      camera.fov += ((62 + Math.abs(st.speed) * 0.7) - camera.fov) * dt * 3;
      camera.updateProjectionMatrix();
      sun.position.set(st.pos.x + 40, st.y + 80, st.pos.z + 25);
      sun.target.position.set(st.pos.x, st.y, st.pos.z);

      dust.update(dt); sparks.update(dt); storm.update(dt);
      beacon.scale.setScalar(1 + Math.sin(now / 200) * 0.3);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    /* ---------------- HUD + radar @10 Hz ---------------- */
    const hudTimer = setInterval(() => {
      setHud({
        time: Math.max(0, MISSION_SECONDS - st.time), energy: S.capacity ? st.energy / S.capacity : 0, hp: st.hp / S.hp,
        speed: Math.abs(st.speed) * 3.6, carried: st.carried, banked: st.banked, collected: st.collected, storm: st.storm,
        drill: st.drillTarget >= 0 ? st.drill : 0, onPad: Math.hypot(st.pos.x, st.pos.z) < LANDER_R,
        air: !st.grounded && st.airT > 0.4, lowBattery: st.energy < S.capacity * 0.15, hot: P.heat && !S.cooling,
        slip: st.slip, slope: st.slope, powerKW: st.pElec / 1000, force: st.force, gas: S.gasKg ? st.gas / S.gasKg : 0,
        localTime: siteTime(site, st.time * TIME_COMPRESSION, offsetH), sunEl: st.sunEl, genW: st.gen,
        queueMB: st.carriedMB, inflight: st.inflight.reduce((a, f) => a + f.value, 0), earthUp: st.earthEl > 2,
        earthEl: st.earthEl, tx: st.tx, autonav: st.autonavT > 0, sampleHint: st.sampleHint,
      });
      const cv = map.current;
      if (!cv) return;
      const c = cv.getContext("2d")!;
      const W = cv.width, R = S.radar * 1.15, k = W / 2 / R;
      c.clearRect(0, 0, W, W);
      c.fillStyle = "rgba(5,6,15,0.75)"; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, 7); c.fill();
      c.strokeStyle = "rgba(125,211,252,0.35)"; c.beginPath(); c.arc(W / 2, W / 2, S.radar * k, 0, 7); c.stroke();
      const toMap = (x: number, z: number) => {
        // rotate so the rover always points up
        const dx = x - st.pos.x, dz = z - st.pos.z;
        const cs = Math.cos(-st.heading), sn = Math.sin(-st.heading);
        const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
        return [W / 2 - rx * k, W / 2 - rz * k] as const;
      };
      for (const sm of sampleMeshes) {
        if (sm.taken) continue;
        const d = Math.hypot(sm.s.x - st.pos.x, sm.s.z - st.pos.z);
        if (d > S.radar && sm.s.kind !== "legendary") continue;
        let [mx, my] = toMap(sm.s.x, sm.s.z);
        const dd = Math.hypot(mx - W / 2, my - W / 2);
        if (dd > W / 2 - 4) { mx = W / 2 + (mx - W / 2) * (W / 2 - 4) / dd; my = W / 2 + (my - W / 2) * (W / 2 - 4) / dd; }
        c.fillStyle = "#" + KIND_COLOR[sm.s.kind].toString(16).padStart(6, "0");
        c.beginPath(); c.arc(mx, my, sm.s.kind === "legendary" ? 4 : 2.5, 0, 7); c.fill();
      }
      if (S.navcam || S.uplink) {
        c.fillStyle = "rgba(160,160,170,0.8)";
        for (const b of terrain.boulders) {
          const d = Math.hypot(b.x - st.pos.x, b.z - st.pos.z);
          if (d > R || (!S.uplink && d > 40)) continue;     // navcams see ~40 m; orbital (HiRISE) maps via the HGA see all
          const [bx, by] = toMap(b.x, b.z);
          c.beginPath(); c.arc(bx, by, Math.max(1.5, b.r * k), 0, 7); c.fill();
        }
      }
      let [lx, ly] = toMap(0, 0);
      const ld = Math.hypot(lx - W / 2, ly - W / 2);
      if (ld > W / 2 - 6) { lx = W / 2 + (lx - W / 2) * (W / 2 - 6) / ld; ly = W / 2 + (ly - W / 2) * (W / 2 - 6) / ld; }
      c.fillStyle = "#34d399"; c.fillRect(lx - 4, ly - 4, 8, 8);
      c.fillStyle = "#fff"; c.beginPath(); c.moveTo(W / 2, W / 2 - 7); c.lineTo(W / 2 - 5, W / 2 + 5); c.lineTo(W / 2 + 5, W / 2 + 5); c.fill();
    }, 100);

    const onResize = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener("resize", onResize);
    el.focus();

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudTimer);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("resize", onResize);
      engine?.stop();
      dust.dispose(); sparks.dispose(); storm.dispose();
      scene.traverse(disposeObject);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const S0 = roverStats(build, planet, live, sunElevation(site, siteTime(site, 0, offsetH)));
  const pct = (v: number) => `${Math.max(0, Math.min(100, v * 100))}%`;
  return (
    <div className={`rover-drive ${shake ? "shake" : ""} ${hud?.storm ? "stormy" : ""}`}>
      <div ref={host} className="launch3d-canvas" tabIndex={0} />
      {hud && (
        <>
          <div className="rv-top">
            <div className={`rv-timer mono ${hud.time < 20 ? "urgent" : ""}`}>
              {Math.floor(hud.time / 60)}:{String(Math.floor(hud.time % 60)).padStart(2, "0")}
            </div>
            <div className="rv-score">
              <span>BANKED <b>{Math.round(hud.banked)}</b></span>
              {hud.carried > 0 && (
                <span className="carry">
                  UNSENT <b>{Math.round(hud.carried)}</b> ({Math.round(hud.queueMB)} MB)
                  {S0.uplink ? (hud.earthUp ? (hud.tx ? ` · 📡 sending ${S0.uplinkMBs.toFixed(0)} MB/s` : "") : " · Earth below horizon → go to lander relay")
                             : " → drive to the lander relay"}
                </span>
              )}
              {hud.inflight > 0 && <span className="muted">⚡ {Math.round(hud.inflight)} in flight to Earth ({(S0.lightS / TIME_COMPRESSION).toFixed(1)} s)</span>}
              <span className="muted">samples {hud.collected}</span>
            </div>
          </div>
          <div className="rv-gauges">
            <div className="rv-g"><span>⚡ BATTERY</span><div className="rv-bar"><div style={{ width: pct(hud.energy), background: hud.lowBattery ? "var(--bad)" : "var(--good)" }} /></div></div>
            <div className="rv-g"><span>🛡 HULL</span><div className="rv-bar"><div style={{ width: pct(hud.hp), background: hud.hp < 0.3 ? "var(--bad)" : "var(--accent)" }} /></div></div>
            <div className="rv-speed mono">{hud.speed.toFixed(0)}<small> km/h</small></div>
            {hud.onPad && <div className="rv-tag good">CHARGING ON PAD</div>}
            {hud.air && <div className="rv-tag warn">AIRBORNE</div>}
            {hud.storm && <div className="rv-tag warn">DUST STORM</div>}
            {hud.hot && <div className="rv-tag bad">OVERHEATING</div>}
            {hud.slip && <div className="rv-tag warn">WHEEL SLIP</div>}
            {hud.autonav && <div className="rv-tag good">AUTONAV BRAKING</div>}
            {hud.sampleHint && <div className="rv-tag warn">🔬 {hud.sampleHint}</div>}
            {hud.tx && <div className="rv-tag good">TX → EARTH</div>}
            <div className="rv-phys mono small">
              {S0.mass} kg · {Math.round(S0.weightN)} N · slope {hud.slope.toFixed(0)}° · drive {Math.round(hud.force)} N · {hud.powerKW.toFixed(2)} kW
              {S0.jets && <> · gas {Math.round(hud.gas * 100)}%</>}
            </div>
            {site && hud.localTime !== null && (
              <div className="rv-phys mono small">
                {site.name} · local solar time {fmtTime(hud.localTime)} · Sun {hud.sunEl !== null ? `${hud.sunEl.toFixed(0)}°` : "-"}
                {" "}· solar {Math.round(hud.genW)} W{hud.sunEl !== null && hud.sunEl < 0 ? " · NIGHT" : ""}
                {" "}· Earth {hud.earthEl.toFixed(0)}° {hud.earthUp ? "up" : "set"}
              </div>
            )}
            {hud.drill > 0 && <div className="rv-drill"><div style={{ width: pct(hud.drill) }} /></div>}
          </div>
        </>
      )}
      <canvas ref={map} width={170} height={170} className="rv-map" />
      {banner && <div className={`rv-banner ${banner.tone}`}>{banner.text}</div>}
      <div className="rv-pops">{pops.map((p) => <div key={p.id} className={`rv-pop ${p.big ? "big" : ""}`} style={{ color: p.color }}>{p.text}</div>)}</div>
      <button className="rv-abort" onClick={() => abortRef.current()}>End mission</button>
      <div className="rv-help small">W/S drive · A/D steer · SHIFT boost · SPACE jets · R unstuck</div>
    </div>
  );
}
