import * as THREE from "three";

let sprite: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (sprite) return sprite;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  sprite = new THREE.CanvasTexture(c);
  return sprite;
}

/**
 * One draw call for thousands of particles. Additive blending means a particle
 * whose colour has faded to black is invisible, so "dead" = colour 0.
 */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private base: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private next = 0;
  constructor(private max: number, size = 1.2, private drag = 0.96, private gravity = 0) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size, map: softDot(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, color: THREE.Color) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  /** Spherical burst, e.g. explosions. */
  burst(p: THREE.Vector3, n: number, speed: number, life: number, colors: THREE.Color[]) {
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.3 + Math.random()));
      this.emit(p, v, life * (0.5 + Math.random() * 0.8), colors[k % colors.length]);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= this.drag;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
        this.col[i * 3 + a] = this.base[i * 3 + a] * k;
      }
      this.vel[i * 3 + 1] -= this.gravity * dt;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
