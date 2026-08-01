import { SimplexNoise3D } from "./noise";

/**
 * Procedural shaping for the brain's point cloud — no meshes, no textures, no
 * downloaded assets. This only defines a silhouette that *suggests* a brain
 * (two hemisphere-like masses, a lower cerebellum-like bump, a stem) for
 * network.ts to scatter nodes across. It is deliberately not an anatomical
 * model: the goal is an abstract, glowing AI-network read, not a medical one.
 */

export type Region = "cerebrum" | "cerebellum" | "brainstem" | "callosum";

export interface ShapedPoint {
  position: [number, number, number];
  normal: [number, number, number];
  foldDepth: number; // negative = valley (denser, shadowed), positive = ridge (brighter)
  region: Region;
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export class BrainAnatomy {
  private noise: SimplexNoise3D;
  private warpNoise: SimplexNoise3D;

  readonly cerebrum = { semiX: 0.72, semiY: 0.52, semiZ: 0.94, gap: 0.055 };
  readonly cerebellum = { semiX: 0.4, semiY: 0.3, semiZ: 0.36, gap: 0.04, center: [0, -0.68, -0.8] as [number, number, number] };
  readonly brainstem = { topY: -0.42, bottomY: -1.06, topR: 0.165, bottomR: 0.1, z: -0.18 };

  constructor(seed = 1337) {
    this.noise = new SimplexNoise3D(seed);
    this.warpNoise = new SimplexNoise3D(seed + 999);
  }

  private ridge(x: number, y: number, z: number): number {
    return 1 - Math.abs(this.noise.noise(x, y, z));
  }

  private warp(x: number, y: number, z: number, amp: number): [number, number, number] {
    const wx = this.warpNoise.noise(x * 1.1, y * 1.1, z * 1.1 + 4.1);
    const wy = this.warpNoise.noise(x * 1.1 + 9.3, y * 1.1, z * 1.1);
    const wz = this.warpNoise.noise(x * 1.1, y * 1.1 + 2.7, z * 1.1);
    return [x + wx * amp, y + wy * amp, z + wz * amp];
  }

  foldField(x: number, y: number, z: number, freqMul = 1): number {
    const [wx, wy, wz] = this.warp(x * freqMul, y * freqMul, z * freqMul, 0.4);
    const n1 = this.ridge(wx * 2.1, wy * 2.1, wz * 2.1);
    const n2 = this.ridge(wx * 4.6 + 5.2, wy * 4.6 + 5.2, wz * 4.6 + 5.2);
    const n3 = this.ridge(wx * 9.3 + 1.7, wy * 9.3 + 1.7, wz * 9.3 + 1.7);
    return n1 * 0.5 + n2 * 0.32 + n3 * 0.18 - 0.5;
  }

  private cerebrumRadiusMul(dx: number, dy: number, dz: number): number {
    const ax = Math.abs(dx);
    const front = 1 - smoothstep(0.55, 1.0, dz) * 0.16;
    const back = 1 - smoothstep(0.5, 1.0, -dz) * 0.22;
    const top = 1 - smoothstep(0.72, 1.0, dy) * 0.12;

    const tdy = (dy + 0.5) / 0.36;
    const tdz = (dz - 0.18) / 0.58;
    const temporalBump = smoothstep(0.4, 0.8, ax) * Math.exp(-(tdy * tdy + tdz * tdz)) * 0.44;

    const sdy = (dy + 0.15) / 0.1;
    const sdz = (dz - 0.05) / 0.58;
    const sylvianGroove = smoothstep(0.35, 0.75, ax) * Math.exp(-(sdy * sdy + sdz * sdz)) * -0.24;

    const medialPull = -(1 - smoothstep(0.1, 0.5, ax)) * smoothstep(0.15, 0.9, dy) * 0.28;

    const ndy = (dy + 0.55) / 0.5;
    const ndz = (dz + 0.75) / 0.45;
    const cerebellarNotch = Math.exp(-(ndy * ndy + ndz * ndz)) * -0.22;

    return front * back * top * (1 + temporalBump + sylvianGroove + medialPull + cerebellarNotch);
  }

  private cerebellumRadiusMul(dx: number, dy: number, dz: number): number {
    const front = 1 - smoothstep(0.6, 1.0, dz) * 0.2;
    const back = 1 - smoothstep(0.6, 1.0, -dz) * 0.28;
    const bottom = 1 - smoothstep(0.6, 1.0, -dy) * 0.22;
    return front * back * bottom;
  }

  cerebrumPoint(dir: [number, number, number], hemisphereSign: 1 | -1): ShapedPoint {
    const { semiX, semiY, semiZ, gap } = this.cerebrum;
    const evalAt = (d: [number, number, number]): [number, number, number] => {
      const ax = Math.abs(d[0]);
      const mul = this.cerebrumRadiusMul(ax, d[1], d[2]);
      const px = ax * semiX * mul;
      const py = d[1] * semiY * mul;
      const pz = d[2] * semiZ * mul;
      const fold = this.foldField(d[0] * 3, d[1] * 3, d[2] * 3) * 0.062 * mul;
      const len = Math.max(Math.hypot(px, py, pz), 1e-4);
      const nx = px / len, ny = py / len, nz = pz / len;
      return [px + nx * fold, py + ny * fold, pz + nz * fold];
    };

    const p0 = evalAt(dir);
    const normal = estimateNormal(dir, evalAt);
    const foldDepth = this.foldField(dir[0] * 3, dir[1] * 3, dir[2] * 3);

    return {
      position: [hemisphereSign * (p0[0] + gap), p0[1], p0[2]],
      normal: [hemisphereSign * normal[0], normal[1], normal[2]],
      foldDepth,
      region: "cerebrum",
    };
  }

  cerebellumPoint(dir: [number, number, number], hemisphereSign: 1 | -1): ShapedPoint {
    const { semiX, semiY, semiZ, gap, center } = this.cerebellum;
    const evalAt = (d: [number, number, number]): [number, number, number] => {
      const ax = Math.abs(d[0]);
      const mul = this.cerebellumRadiusMul(ax, d[1], d[2]);
      const px = ax * semiX * mul;
      const py = d[1] * semiY * mul;
      const pz = d[2] * semiZ * mul;
      const fold = this.foldField(d[0] * 6 + 40, d[1] * 6 + 40, d[2] * 6 + 40, 2.3) * 0.03 * mul;
      const len = Math.max(Math.hypot(px, py, pz), 1e-4);
      const nx = px / len, ny = py / len, nz = pz / len;
      return [px + nx * fold, py + ny * fold, pz + nz * fold];
    };

    const p0 = evalAt(dir);
    const normal = estimateNormal(dir, evalAt);
    const foldDepth = this.foldField(dir[0] * 6 + 40, dir[1] * 6 + 40, dir[2] * 6 + 40, 2.3);

    return {
      position: [hemisphereSign * (p0[0] + gap) + center[0], p0[1] + center[1], p0[2] + center[2]],
      normal: [hemisphereSign * normal[0], normal[1], normal[2]],
      foldDepth,
      region: "cerebellum",
    };
  }

  brainstemPoint(ringT: number, angle: number): ShapedPoint {
    const { topY, bottomY, topR, bottomR, z } = this.brainstem;
    const y = topY + (bottomY - topY) * ringT;
    const r = topR + (bottomR - topR) * ringT;
    const wobble = this.noise.noise(Math.cos(angle) * 2 + ringT * 3, Math.sin(angle) * 2, ringT * 5) * 0.012;
    const x = Math.cos(angle) * (r + wobble);
    const zOff = Math.sin(angle) * (r + wobble) * 0.6 + z;
    const normal = normalize3([Math.cos(angle), 0.15, Math.sin(angle) * 0.6]);
    return { position: [x, y, zOff], normal, foldDepth: 0, region: "brainstem" };
  }

  callosumPoint(t: number, s: number): ShapedPoint {
    const spanX = 0.46;
    const baseY = 0.14;
    const archHeight = 0.13;
    const x = s * spanX;
    const y = baseY + archHeight * (1 - s * s);
    const z = -0.5 + t * 1.05;
    const normal = normalize3([0, 1, 0.15]);
    return { position: [x, y, z], normal, foldDepth: 0, region: "callosum" };
  }
}

function estimateNormal(
  dir: [number, number, number],
  evalAt: (d: [number, number, number]) => [number, number, number],
): [number, number, number] {
  const eps = 0.01;
  const up: [number, number, number] = Math.abs(dir[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const t1 = normalize3(cross3(dir, up));
  const t2 = normalize3(cross3(dir, t1));

  const p0 = evalAt(dir);
  const d1 = normalize3([dir[0] + t1[0] * eps, dir[1] + t1[1] * eps, dir[2] + t1[2] * eps]);
  const d2 = normalize3([dir[0] + t2[0] * eps, dir[1] + t2[1] * eps, dir[2] + t2[2] * eps]);
  const p1 = evalAt(d1);
  const p2 = evalAt(d2);

  const v1: [number, number, number] = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v2: [number, number, number] = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  let n = cross3(v1, v2);
  if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) {
    n = [-n[0], -n[1], -n[2]];
  }
  return normalize3(n);
}

function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.max(Math.hypot(v[0], v[1], v[2]), 1e-6);
  return [v[0] / len, v[1] / len, v[2] / len];
}
