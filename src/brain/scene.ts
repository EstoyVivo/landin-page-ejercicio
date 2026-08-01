import * as THREE from "three";
import { generateBrainNetwork, type BrainNetwork } from "./network";
import { createNodeMaterial, createLineMaterial, createSharedUniforms, type BrainUniforms } from "./materials";
import { PulseSystem } from "./pulses";
import { ParticleSystem } from "./particles";

export type Quality = "high" | "medium" | "low";

const QUALITY_SETTINGS: Record<Quality, { nodeCount: number; neighbors: number; particleCount: number }> = {
  high: { nodeCount: 3400, neighbors: 6, particleCount: 1900 },
  medium: { nodeCount: 2000, neighbors: 5, particleCount: 1000 },
  low: { nodeCount: 1100, neighbors: 4, particleCount: 500 },
};

const MAX_YAW = 0.22; // radians of parallax rotation available to mouse + scroll combined
const MAX_PITCH = 0.14;
const DAMPING = 0.045; // how quickly rotation/pointer targets are approached each frame

/**
 * Slow organic breathing envelope — inhale, hold, exhale, hold — instead of a
 * heartbeat or a plain CSS-style scale() pulse. A single eased 0..1 value
 * drives scale, per-node wobble amplitude, shader light intensity/highlight
 * bloom and particle visibility/speed all at once, so the whole network
 * seems to inflate and settle as one living thing rather than looping a
 * single animated property.
 */
class BreathCycle {
  private clock = 0;
  private readonly inhale: number;
  private readonly hold1: number;
  private readonly exhale: number;
  private readonly hold2: number;
  private readonly total: number;

  constructor() {
    this.total = 8 + Math.random() * 4; // 8-12s per the brief
    this.inhale = this.total * 0.33;
    this.hold1 = this.total * 0.12;
    this.exhale = this.total * 0.38;
    this.hold2 = this.total - this.inhale - this.hold1 - this.exhale;
  }

  update(dt: number): number {
    this.clock = (this.clock + dt) % this.total;
    const t = this.clock;

    if (t < this.inhale) {
      const p = t / this.inhale;
      return 0.5 - 0.5 * Math.cos(Math.PI * p); // eased 0 -> 1
    }
    if (t < this.inhale + this.hold1) {
      return 1;
    }
    if (t < this.inhale + this.hold1 + this.exhale) {
      const p = (t - this.inhale - this.hold1) / this.exhale;
      return 0.5 + 0.5 * Math.cos(Math.PI * p); // eased 1 -> 0
    }
    return 0;
  }
}

export class BrainScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private group: THREE.Group;
  private uniforms: BrainUniforms;
  private network: BrainNetwork;
  private pulses: PulseSystem;
  private particles: ParticleSystem;
  private breath: BreathCycle;

  private pointerTarget = { x: 0, y: 0 };
  private scrollTarget = { yaw: 0, pitch: 0, dolly: 0, mood: 0 };
  private currentRotation = { x: 0, y: 0 };
  private reducedMotion: boolean;
  private baseScale = 1;
  private restCameraZ = 4.4;
  private currentBreath = 0;

  private raycaster = new THREE.Raycaster();
  private cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private cursorWorld = new THREE.Vector3();
  private cursorLocal = new THREE.Vector3();
  private ndc = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement, quality: Quality = "high", reducedMotion = false) {
    this.reducedMotion = reducedMotion;
    const settings = QUALITY_SETTINGS[quality];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05070a, 0.12);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 4.4);

    this.uniforms = createSharedUniforms();
    if (this.reducedMotion) this.uniforms.uBreatheAmp.value = 0.02;

    this.network = generateBrainNetwork({ count: settings.nodeCount, neighbors: settings.neighbors });
    this.group = new THREE.Group();

    const nodeGeometry = this.buildNodeGeometry(this.network);
    const lineGeometry = this.buildLineGeometry(this.network);

    const nodeMaterial = createNodeMaterial(this.uniforms);
    const lineMaterial = createLineMaterial(this.uniforms);

    const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    nodePoints.frustumCulled = false;
    lineSegments.frustumCulled = false;

    this.pulses = new PulseSystem(this.network, nodeGeometry, lineGeometry);
    this.particles = new ParticleSystem(
      this.network,
      this.uniforms,
      this.reducedMotion ? Math.round(settings.particleCount * 0.4) : settings.particleCount,
      this.pulses,
    );

    this.group.add(lineSegments, nodePoints, this.particles.points);
    this.group.rotation.y = 0.15;
    this.applyComposition();
    this.scene.add(this.group);

    this.breath = new BreathCycle();

    window.addEventListener("resize", this.handleResize);
  }

  private buildNodeGeometry(network: BrainNetwork): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(network.positions.slice(), 3));
    geometry.setAttribute("aNormal", new THREE.BufferAttribute(network.normals.slice(), 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(network.phase.slice(), 1));
    geometry.setAttribute("aWeight", new THREE.BufferAttribute(network.weight.slice(), 1));
    geometry.setAttribute("aFold", new THREE.BufferAttribute(network.foldDepth.slice(), 1));
    geometry.setAttribute("aHeat", new THREE.BufferAttribute(new Float32Array(network.count), 1));
    return geometry;
  }

  private buildLineGeometry(network: BrainNetwork): THREE.BufferGeometry {
    const edgeCount = network.edges.length / 2;
    const positions = new Float32Array(edgeCount * 2 * 3);
    const normals = new Float32Array(edgeCount * 2 * 3);
    const phase = new Float32Array(edgeCount * 2);
    const weight = new Float32Array(edgeCount * 2);
    const fold = new Float32Array(edgeCount * 2);

    for (let e = 0; e < edgeCount; e++) {
      const a = network.edges[e * 2];
      const b = network.edges[e * 2 + 1];
      positions[e * 6 + 0] = network.positions[a * 3 + 0];
      positions[e * 6 + 1] = network.positions[a * 3 + 1];
      positions[e * 6 + 2] = network.positions[a * 3 + 2];
      positions[e * 6 + 3] = network.positions[b * 3 + 0];
      positions[e * 6 + 4] = network.positions[b * 3 + 1];
      positions[e * 6 + 5] = network.positions[b * 3 + 2];
      normals[e * 6 + 0] = network.normals[a * 3 + 0];
      normals[e * 6 + 1] = network.normals[a * 3 + 1];
      normals[e * 6 + 2] = network.normals[a * 3 + 2];
      normals[e * 6 + 3] = network.normals[b * 3 + 0];
      normals[e * 6 + 4] = network.normals[b * 3 + 1];
      normals[e * 6 + 5] = network.normals[b * 3 + 2];
      phase[e * 2] = network.phase[a];
      phase[e * 2 + 1] = network.phase[b];
      weight[e * 2] = network.weight[a];
      weight[e * 2 + 1] = network.weight[b];
      fold[e * 2] = network.foldDepth[a];
      fold[e * 2 + 1] = network.foldDepth[b];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geometry.setAttribute("aWeight", new THREE.BufferAttribute(weight, 1));
    geometry.setAttribute("aFold", new THREE.BufferAttribute(fold, 1));
    geometry.setAttribute("aHeat", new THREE.BufferAttribute(new Float32Array(edgeCount * 2), 1));
    return geometry;
  }

  /**
   * Off-center composition: the brain sits right-of-center on wide viewports
   * so the hero's left-anchored text column has clean space beside it. Below
   * ~720px the frustum is too narrow for that lateral shift to clear a
   * nearly full-width text column, so narrow viewports nudge the brain up
   * and pull the camera back instead (vertical separation over horizontal).
   */
  private applyComposition(): void {
    const narrow = window.innerWidth < 720;
    if (narrow) {
      this.group.position.set(0.22, 0.4, 0);
      this.baseScale = 0.8;
      this.restCameraZ = 5.2;
    } else {
      this.group.position.set(0.78, 0, 0);
      this.baseScale = 1;
      this.restCameraZ = 4.4;
    }
    this.group.scale.setScalar(this.baseScale);
    this.camera.position.z = this.restCameraZ;
  }

  /** Normalized pointer position in [-1, 1]; called by core/mouse.ts on every pointermove. */
  setPointer(nx: number, ny: number): void {
    this.pointerTarget.x = nx;
    this.pointerTarget.y = ny;
  }

  /** Called by scrollBinding.ts with values already eased/interpolated over the scroll timeline. */
  setScrollTarget(yaw: number, pitch: number, dolly: number, mood: number): void {
    this.scrollTarget = { yaw, pitch, dolly, mood };
  }

  /** 0..1 breathing envelope as of the last update() — lets DOM/CSS (the glass
   * CTA button's glow) stay in lockstep with the brain's own breathing. */
  getBreathIntensity(): number {
    return this.currentBreath;
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.applyComposition();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  };

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uMoodMix.value += (this.scrollTarget.mood - this.uniforms.uMoodMix.value) * 0.03;

    const breath = this.reducedMotion ? 0 : this.breath.update(dt);
    this.currentBreath = breath;
    this.uniforms.uBreathIntensity.value = breath;
    this.uniforms.uBreatheAmp.value = this.reducedMotion ? 0.02 : 0.018 + breath * 0.016;

    this.pulses.update(dt);

    if (!this.reducedMotion) {
      this.ndc.set(this.pointerTarget.x, -this.pointerTarget.y);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.cursorPlane, this.cursorWorld);
      if (hit) {
        this.group.worldToLocal(this.cursorLocal.copy(this.cursorWorld));
        this.particles.setCursor(this.cursorLocal);
      } else {
        this.particles.setCursor(null);
      }
    }
    // particles ease their travel speed down on the exhale, up on the inhale —
    // "las partículas reducen ligeramente su velocidad" during exhale/rest.
    this.particles.update(dt * (this.reducedMotion ? 1 : 0.88 + breath * 0.24));

    this.group.scale.setScalar(this.baseScale * (1 + (this.reducedMotion ? 0 : breath * 0.016)));

    const pointerYaw = this.reducedMotion ? 0 : this.pointerTarget.x * MAX_YAW;
    const pointerPitch = this.reducedMotion ? 0 : -this.pointerTarget.y * MAX_PITCH;

    const targetY = 0.15 + pointerYaw + this.scrollTarget.yaw;
    const targetX = pointerPitch + this.scrollTarget.pitch;

    this.currentRotation.y += (targetY - this.currentRotation.y) * DAMPING;
    this.currentRotation.x += (targetX - this.currentRotation.x) * DAMPING;
    this.group.rotation.y = this.currentRotation.y;
    this.group.rotation.x = this.currentRotation.x;

    this.camera.position.z += (this.restCameraZ + this.scrollTarget.dolly - this.camera.position.z) * DAMPING;

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.particles.dispose();
    this.renderer.dispose();
  }
}
