import * as THREE from "three";
import type { BrainNetwork } from "./network";
import { createParticleMaterial, type BrainUniforms } from "./materials";
import type { PulseSystem } from "./pulses";

interface Particle {
  from: number;
  to: number;
  t: number;
  speed: number;
  curveOffset: THREE.Vector3;
  active: number; // 0..1 baseline visibility; breathing pushes more particles toward 1
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpMid = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpRepel = new THREE.Vector3();

const CURSOR_RADIUS = 0.65; // world units, in the brain group's local space
const CURSOR_STRENGTH = 0.22;

/** Mirrors the GLSL `breathe()` in materials.ts so CPU-side particle paths track the breathing nodes. */
function breathe(out: THREE.Vector3, network: BrainNetwork, index: number, time: number, amp: number): THREE.Vector3 {
  const px = network.positions[index * 3];
  const py = network.positions[index * 3 + 1];
  const pz = network.positions[index * 3 + 2];
  out.set(px, py, pz);

  const len = Math.max(out.length(), 0.0001);
  const phase = network.phase[index];
  const weight = network.weight[index];
  const wobble = Math.sin(time * 0.35 + phase) * 0.6 + Math.sin(time * 0.13 + phase * 1.7) * 0.4;
  const offset = (wobble * amp * weight) / len;

  out.x += out.x * offset;
  out.y += out.y * offset;
  out.z += out.z * offset;
  return out;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private progressAttr: THREE.BufferAttribute;
  private activeAttr: THREE.BufferAttribute;
  private particles: Particle[];
  private network: BrainNetwork;
  private uniforms: BrainUniforms;
  private pulses: PulseSystem | null;
  private cursor: THREE.Vector3 | null = null;

  constructor(network: BrainNetwork, uniforms: BrainUniforms, count: number, pulses: PulseSystem | null = null) {
    this.network = network;
    this.uniforms = uniforms;
    this.pulses = pulses;

    this.particles = Array.from({ length: count }, () => this.spawnParticle(Math.random()));

    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const progress = new Float32Array(count);
    const active = new Float32Array(count);
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.progressAttr = new THREE.BufferAttribute(progress, 1);
    this.activeAttr = new THREE.BufferAttribute(active, 1);
    this.geometry.setAttribute("position", this.posAttr);
    this.geometry.setAttribute("aProgress", this.progressAttr);
    this.geometry.setAttribute("aActive", this.activeAttr);

    const material = createParticleMaterial(uniforms);
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  private spawnParticle(initialT = 0): Particle {
    const from = Math.floor(Math.random() * this.network.count);
    const neighbors = this.network.adjacency[from];
    const to = neighbors.length > 0 ? neighbors[Math.floor(Math.random() * neighbors.length)] : from;

    tmpMid.set(0, 0, 1);
    return {
      from,
      to,
      t: initialT,
      speed: 0.25 + Math.random() * 0.35,
      curveOffset: new THREE.Vector3(
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.08,
      ),
      active: 0.35 + Math.random() * 0.4,
    };
  }

  private advance(p: Particle): void {
    const neighbors = this.network.adjacency[p.to];
    const next = neighbors.length > 0 ? neighbors[Math.floor(Math.random() * neighbors.length)] : p.from;
    this.pulses?.ignite(p.to, 0.5);
    p.from = p.to;
    p.to = next;
    p.t = 0;
    p.speed = 0.25 + Math.random() * 0.35;
  }

  /** World cursor position already converted into the brain group's local space, or null when off-plane. */
  setCursor(local: THREE.Vector3 | null): void {
    this.cursor = local;
  }

  update(dt: number): void {
    const time = this.uniforms.uTime.value;
    const amp = this.uniforms.uBreatheAmp.value;
    const positions = this.posAttr.array as Float32Array;
    const progress = this.progressAttr.array as Float32Array;
    const active = this.activeAttr.array as Float32Array;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.t += dt * p.speed;
      if (p.t >= 1) {
        this.advance(p);
      }

      breathe(tmpA, this.network, p.from, time, amp);
      breathe(tmpB, this.network, p.to, time, amp);

      tmpMid.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      tmpNormal.copy(p.curveOffset);
      tmpMid.add(tmpNormal);

      const t = p.t;
      const mt = 1 - t;
      tmpC.set(
        mt * mt * tmpA.x + 2 * mt * t * tmpMid.x + t * t * tmpB.x,
        mt * mt * tmpA.y + 2 * mt * t * tmpMid.y + t * t * tmpB.y,
        mt * mt * tmpA.z + 2 * mt * t * tmpMid.z + t * t * tmpB.z,
      );

      if (this.cursor) {
        const dist = tmpC.distanceTo(this.cursor);
        if (dist < CURSOR_RADIUS) {
          const falloff = 1 - dist / CURSOR_RADIUS;
          tmpRepel.copy(tmpC).sub(this.cursor);
          if (dist > 0.0001) tmpRepel.normalize();
          tmpC.addScaledVector(tmpRepel, falloff * falloff * CURSOR_STRENGTH);
        }
      }

      positions[i * 3] = tmpC.x;
      positions[i * 3 + 1] = tmpC.y;
      positions[i * 3 + 2] = tmpC.z;
      progress[i] = t;
      active[i] = p.active;
    }

    this.posAttr.needsUpdate = true;
    this.progressAttr.needsUpdate = true;
    this.activeAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
