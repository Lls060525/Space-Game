import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Component } from "../lib/types";
import { buildCraft, buildRocket, disposeObject, makeStars } from "../three/models";
import { Particles } from "../three/particles";

/** Live 3D preview: the spacecraft physically grows as you draft. Drag to rotate. */
export function Hangar3D({ parts, color = "#7dd3fc", height = 280 }: { parts: Component[]; color?: string; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setParts: (p: Component[]) => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, height);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(makeStars(1500, 200));
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / height, 0.1, 1000);
    camera.position.set(6, 3.5, 7);
    scene.add(new THREE.AmbientLight(0x8890b0, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 8, 6);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(new THREE.Color(color), 1.2);
    rim.position.set(-6, -2, -5);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 20;

    // holographic grid floor
    const grid = new THREE.PolarGridHelper(4, 12, 6, 48, new THREE.Color(color), 0x1c2140);
    grid.position.y = -2.2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);

    const sparks = new Particles(400, 0.25, 0.92);
    scene.add(sparks.points);

    let craft: THREE.Group | null = null;
    let lv: THREE.Group | null = null;
    let pop = 1;
    let lastCount = -1;

    const setParts = (p: Component[]) => {
      if (craft) { scene.remove(craft); disposeObject(craft); }
      if (lv) { scene.remove(lv); disposeObject(lv); lv = null; }
      craft = buildCraft(p.filter((c) => c.category !== "launch"));
      scene.add(craft);
      const rocket = p.find((c) => c.category === "launch");
      if (rocket) {
        // small rocket silhouette in the background for scale
        lv = buildRocket(color, rocket);
        lv.scale.setScalar(0.35);
        lv.position.set(-3.5, -2.2, -2.5);
        scene.add(lv);
      }
      if (lastCount !== -1 && p.length > lastCount) {
        pop = 0.75;   // bounce
        sparks.burst(new THREE.Vector3(0, 0, 0), 60, 5, 0.6,
          [new THREE.Color(color), new THREE.Color(0xffffff), new THREE.Color(0xffd166)]);
      }
      lastCount = p.length;
    };
    api.current = { setParts };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pop += (1 - pop) * 0.15;
      if (craft) {
        craft.scale.setScalar(pop + Math.sin(now / 90) * (1 - pop) * 0.3);
        craft.position.y = Math.sin(now / 900) * 0.15;
      }
      sparks.update(dt);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      camera.aspect = el.clientWidth / height;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, height);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      sparks.dispose();
      scene.traverse((o) => disposeObject(o));
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, [color, height]);

  useEffect(() => { api.current?.setParts(parts); }, [parts]);

  return <div ref={host} className="hangar" style={{ height }} />;
}
