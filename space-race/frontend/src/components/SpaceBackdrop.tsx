import { useEffect, useRef } from "react";
import * as THREE from "three";
import { disposeObject, makeStars, planetTexture } from "../three/models";

/**
 * Animated 3D backdrop for the main menu / login: Earth with a glowing atmosphere, satellites on
 * orbit rings, a live Earth→Mars transfer arc with a probe flying it, a holographic grid and
 * mouse parallax. Pure Three.js, no assets.
 */
const atmoVert = `
  varying vec3 vNormal;
  void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const atmoFrag = `
  uniform vec3 glow; uniform float power;
  varying vec3 vNormal;
  void main() { float i = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), power); gl_FragColor = vec4(glow, 1.0) * i; }`;

function atmosphere(radius: number, color: number, power = 3) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), new THREE.ShaderMaterial({
    vertexShader: atmoVert, fragmentShader: atmoFrag,
    uniforms: { glow: { value: new THREE.Color(color) }, power: { value: power } },
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
}

export function SpaceBackdrop({ intensity = 1 }: { intensity?: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02030a);
    scene.fog = new THREE.Fog(0x02030a, 80, 260);
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 2000);
    camera.position.set(0, 0, 70);

    scene.add(new THREE.AmbientLight(0x334466, 0.6));
    const sun = new THREE.DirectionalLight(0xfff3e0, 3);
    sun.position.set(80, 30, 60);
    scene.add(sun);

    // starfield (two layers for depth)
    const farStars = makeStars(6000, 900);
    const nearStars = makeStars(900, 300);
    (nearStars.material as THREE.PointsMaterial).size = 2;
    scene.add(farStars, nearStars);

    // nebula glow sprites
    const nebula = (color: string, x: number, y: number, s: number) => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d")!; const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, color); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35 * intensity, depthWrite: false, fog: false }));
      sp.position.set(x, y, -300); sp.scale.setScalar(s);
      scene.add(sp);
    };
    nebula("rgba(80,60,200,0.9)", -160, 90, 420);
    nebula("rgba(220,60,140,0.7)", 200, -60, 380);
    nebula("rgba(40,160,220,0.6)", 40, 140, 300);

    // Earth
    const earthGroup = new THREE.Group();
    earthGroup.position.set(-30, -10, 0);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(15, 96, 96), new THREE.MeshStandardMaterial({ map: planetTexture("Earth"), roughness: 0.85 }));
    earth.rotation.z = 0.41;
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(15.25, 64, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
    earthGroup.add(earth, clouds, atmosphere(17, 0x4aa8ff, 2.6));
    scene.add(earthGroup);

    // orbit rings + satellites
    const sats: { mesh: THREE.Object3D; curve: THREE.EllipseCurve; speed: number; tilt: THREE.Euler; phase: number }[] = [];
    const ringColors = [0x7dd3fc, 0xf472b6, 0x34d399];
    [22, 27, 33].forEach((r, i) => {
      const curve = new THREE.EllipseCurve(0, 0, r, r * 0.92, 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y));
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: ringColors[i], dashSize: 1.2, gapSize: 0.9, transparent: true, opacity: 0.45 }));
      ring.computeLineDistances();
      const tilt = new THREE.Euler(0.35 + i * 0.25, 0, -0.2 + i * 0.3);
      ring.rotation.copy(tilt);
      earthGroup.add(ring);
      const sat = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xd4a72c, metalness: 0.9, roughness: 0.3 }));
      const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.9), new THREE.MeshStandardMaterial({ color: 0x1b3a8c, emissive: 0x0a1a55, metalness: 0.7, roughness: 0.3 }));
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshBasicMaterial({ color: ringColors[i] }));
      blink.position.y = 0.6;
      sat.add(body, wing, blink);
      earthGroup.add(sat);
      sats.push({ mesh: sat, curve, speed: 0.05 - i * 0.012, tilt, phase: i * 2 });
    });

    // Moon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 48), new THREE.MeshStandardMaterial({ map: planetTexture("Moon"), roughness: 1 }));
    scene.add(moon);

    // Mars, far away top-right
    const marsGroup = new THREE.Group();
    marsGroup.position.set(52, 20, -60);
    const mars = new THREE.Mesh(new THREE.SphereGeometry(6, 64, 64), new THREE.MeshStandardMaterial({ map: planetTexture("Mars"), roughness: 0.95 }));
    marsGroup.add(mars, atmosphere(6.8, 0xff7a45, 3.5));
    scene.add(marsGroup);

    // transfer arc Earth → Mars with a probe flying it
    const arc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-12, -2, 6), new THREE.Vector3(20, 34, 0), new THREE.Vector3(45, 22, -54));
    const arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc.getPoints(120)),
      new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 1.5, gapSize: 1.2, transparent: true, opacity: 0.6 }));
    arcLine.computeLineDistances();
    scene.add(arcLine);
    const probe = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    scene.add(probe);
    const trailN = 40;
    const trailPos = new Float32Array(trailN * 3);
    for (let i = 0; i < trailN; i++) trailPos.set([-12, -2, 6], i * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: 0xffc94d, size: 0.6, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(trail);

    // holographic grid floor
    const grid = new THREE.GridHelper(600, 120, 0x7dd3fc, 0x1c2a55);
    grid.position.y = -38;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35 * intensity;
    scene.add(grid);

    // input: mouse parallax
    const mouse = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { mouse.x = e.clientX / window.innerWidth - 0.5; mouse.y = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      earth.rotation.y = t * 0.05;
      clouds.rotation.y = t * 0.065;
      mars.rotation.y = t * 0.04;
      moon.position.set(-30 + Math.cos(t * 0.12) * 42, -10 + Math.sin(t * 0.12) * 8, Math.sin(t * 0.12) * 30);
      for (const s of sats) {
        const p = s.curve.getPoint(((t * s.speed + s.phase) % 1 + 1) % 1);
        s.mesh.position.set(p.x, 0, p.y).applyEuler(s.tilt);
        s.mesh.rotation.y = t;
      }
      const k = (t * 0.06) % 1;
      const pp = arc.getPoint(k);
      probe.position.copy(pp);
      for (let i = trailN - 1; i > 0; i--) trailPos.copyWithin(i * 3, (i - 1) * 3, i * 3);
      trailPos.set([pp.x, pp.y, pp.z], 0);
      trailGeo.attributes.position.needsUpdate = true;
      grid.position.z = (t * 4) % 5;           // grid scrolls toward the viewer
      nearStars.rotation.y = t * 0.004;
      camera.position.x += (mouse.x * 8 - camera.position.x) * 0.04;
      camera.position.y += (-mouse.y * 5 - camera.position.y) * 0.04;
      camera.lookAt(0, 2, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      scene.traverse(disposeObject);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [intensity]);

  return <div ref={host} className="space-backdrop" aria-hidden />;
}
