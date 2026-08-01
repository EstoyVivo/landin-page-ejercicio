import { BrainAnatomy, type ShapedPoint } from "./anatomy";

export interface BrainNetwork {
  count: number;
  /** flattened xyz positions, one entry set per node (the "rest" position before breathing) */
  positions: Float32Array;
  /** approximate outward normal per node, used for the lighting term */
  normals: Float32Array;
  /** per-node random phase offset (0..TAU) so breathing/pulses never look synchronized */
  phase: Float32Array;
  /** per-node scalar in [0.55, 1.0] — region-based prominence (cerebrum > cerebellum > stem) */
  weight: Float32Array;
  /** negative = valley (denser + shadowed), positive = ridge (brighter) */
  foldDepth: Float32Array;
  /** unique edges as index pairs into positions, deduplicated */
  edges: Uint32Array;
  /** adjacency list per node, used by the pulse propagation + particle routing */
  adjacency: number[][];
}

interface NetworkOptions {
  count?: number;
  neighbors?: number;
  seed?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function fibonacciDir(i: number, n: number): [number, number, number] {
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * i;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

/** Oversample a bilateral (mirrored) region and reject candidates toward valleys, so the
 * final density is visibly higher there and thinner on the ridges/rim. */
function sampleBilateral(
  pointFn: (dir: [number, number, number], sign: 1 | -1) => ShapedPoint,
  targetTotal: number,
): ShapedPoint[] {
  const results: ShapedPoint[] = [];
  const targetPerSide = Math.ceil(targetTotal / 2);
  const oversample = Math.ceil(targetPerSide * 2.8);

  for (const sign of [1, -1] as const) {
    let kept = 0;
    for (let i = 0; i < oversample; i++) {
      if (kept >= targetPerSide) break;
      const dir = fibonacciDir(i, oversample);
      const sp = pointFn(dir, sign);
      const remaining = oversample - i;
      const stillNeeded = targetPerSide - kept;
      const forceKeep = remaining <= stillNeeded;
      const p = 0.3 + Math.max(0, -sp.foldDepth) * 1.4;
      if (forceKeep || Math.random() < Math.min(0.95, p)) {
        results.push(sp);
        kept++;
      }
    }
  }
  return results;
}

interface BrainstemLayout {
  startIndex: number;
  rings: number;
  perRing: number;
}

function sampleBrainstem(anatomy: BrainAnatomy, target: number, startIndex: number): { points: ShapedPoint[]; layout: BrainstemLayout } {
  const rings = Math.max(7, Math.round(Math.sqrt(target * 1.3)));
  const perRing = Math.max(5, Math.round(target / rings));
  const points: ShapedPoint[] = [];
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    for (let a = 0; a < perRing; a++) {
      const angle = (a / perRing) * Math.PI * 2 + (r % 2) * (Math.PI / perRing);
      points.push(anatomy.brainstemPoint(t, angle));
    }
  }
  return { points, layout: { startIndex, rings, perRing } };
}

interface CallosumLayout {
  startIndex: number;
  tSteps: number;
  sSteps: number;
}

function sampleCallosum(anatomy: BrainAnatomy, target: number, startIndex: number): { points: ShapedPoint[]; layout: CallosumLayout } {
  const tSteps = Math.max(9, Math.round(Math.sqrt(target * 1.7)));
  const sSteps = Math.max(5, Math.round(target / tSteps));
  const points: ShapedPoint[] = [];
  for (let ti = 0; ti < tSteps; ti++) {
    const t = ti / (tSteps - 1);
    for (let si = 0; si < sSteps; si++) {
      const s = (si / (sSteps - 1)) * 2 - 1;
      points.push(anatomy.callosumPoint(t, s));
    }
  }
  return { points, layout: { startIndex, tSteps, sSteps } };
}

function regionWeight(region: ShapedPoint["region"]): number {
  switch (region) {
    case "cerebrum": return 0.82 + Math.random() * 0.18;
    case "cerebellum": return 0.68 + Math.random() * 0.16;
    case "callosum": return 0.42 + Math.random() * 0.1;
    case "brainstem": return 0.5 + Math.random() * 0.12;
  }
}

export function generateBrainNetwork(options: NetworkOptions = {}): BrainNetwork {
  const { count = 2400, neighbors = 5, seed = 1337 } = options;
  const anatomy = new BrainAnatomy(seed);

  const cerebrumTarget = Math.round(count * 0.7);
  const cerebellumTarget = Math.round(count * 0.16);
  const brainstemTarget = Math.round(count * 0.07);
  const callosumTarget = Math.max(24, count - cerebrumTarget - cerebellumTarget - brainstemTarget);

  const cerebrumPts = sampleBilateral((dir, sign) => anatomy.cerebrumPoint(dir, sign), cerebrumTarget);
  const cerebellumPts = sampleBilateral((dir, sign) => anatomy.cerebellumPoint(dir, sign), cerebellumTarget);
  const { points: brainstemPts, layout: brainstemLayout } = sampleBrainstem(anatomy, brainstemTarget, cerebrumPts.length + cerebellumPts.length);
  const { points: callosumPts, layout: callosumLayout } = sampleCallosum(
    anatomy,
    callosumTarget,
    brainstemLayout.startIndex + brainstemPts.length,
  );

  const allPoints = [...cerebrumPts, ...cerebellumPts, ...brainstemPts, ...callosumPts];
  const n = allPoints.length;

  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const weight = new Float32Array(n);
  const foldDepth = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = allPoints[i];
    positions[i * 3] = p.position[0];
    positions[i * 3 + 1] = p.position[1];
    positions[i * 3 + 2] = p.position[2];
    normals[i * 3] = p.normal[0];
    normals[i * 3 + 1] = p.normal[1];
    normals[i * 3 + 2] = p.normal[2];
    foldDepth[i] = p.foldDepth;
    phase[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % (Math.PI * 2);
    weight[i] = regionWeight(p.region);
  }

  const structuralEdges = buildStructuralEdges(brainstemLayout, callosumLayout);
  const { edges, adjacency } = buildAdjacencySpatial(positions, n, neighbors, structuralEdges);

  return { count: n, positions, normals, phase, weight, foldDepth, edges, adjacency };
}

function buildStructuralEdges(brainstem: BrainstemLayout, callosum: CallosumLayout): [number, number][] {
  const edges: [number, number][] = [];

  for (let r = 0; r < brainstem.rings; r++) {
    for (let a = 0; a < brainstem.perRing; a++) {
      const i = brainstem.startIndex + r * brainstem.perRing + a;
      const next = brainstem.startIndex + r * brainstem.perRing + ((a + 1) % brainstem.perRing);
      edges.push([i, next]);
      if (r < brainstem.rings - 1) {
        const below = brainstem.startIndex + (r + 1) * brainstem.perRing + a;
        edges.push([i, below]);
      }
    }
  }

  for (let ti = 0; ti < callosum.tSteps; ti++) {
    for (let si = 0; si < callosum.sSteps; si++) {
      const i = callosum.startIndex + ti * callosum.sSteps + si;
      if (si < callosum.sSteps - 1) edges.push([i, i + 1]);
      if (ti < callosum.tSteps - 1) edges.push([i, i + callosum.sSteps]);
    }
  }

  return edges;
}

/** Uniform spatial grid so nearest-neighbor lookups stay ~O(n) instead of the O(n^2 log n)
 * a brute-force sort would cost once the node count reaches the thousands. */
function buildAdjacencySpatial(
  positions: Float32Array,
  count: number,
  k: number,
  structuralEdges: [number, number][],
): { edges: Uint32Array; adjacency: number[][] } {
  const adjacency: number[][] = Array.from({ length: count }, () => []);
  const edgeSet = new Set<number>();
  const edgeList: number[] = [];
  const key = (i: number, j: number) => (i < j ? i * count + j : j * count + i);

  const addEdge = (i: number, j: number) => {
    if (i === j) return;
    const k2 = key(i, j);
    if (edgeSet.has(k2)) return;
    edgeSet.add(k2);
    edgeList.push(i, j);
    adjacency[i].push(j);
    adjacency[j].push(i);
  };

  for (const [i, j] of structuralEdges) addEdge(i, j);

  const cellSize = 0.17;
  const BIAS = 1024;
  const packKey = (x: number, y: number, z: number) => (x + BIAS) * 4194304 + (y + BIAS) * 2048 + (z + BIAS);

  const cellCoord = (i: number): [number, number, number] => [
    Math.floor(positions[i * 3] / cellSize),
    Math.floor(positions[i * 3 + 1] / cellSize),
    Math.floor(positions[i * 3 + 2] / cellSize),
  ];

  const grid = new Map<number, number[]>();
  const coords = new Int32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [cx, cy, cz] = cellCoord(i);
    coords[i * 3] = cx;
    coords[i * 3 + 1] = cy;
    coords[i * 3 + 2] = cz;
    const key2 = packKey(cx, cy, cz);
    let bucket = grid.get(key2);
    if (!bucket) {
      bucket = [];
      grid.set(key2, bucket);
    }
    bucket.push(i);
  }

  const distSq = (a: number, b: number) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
  };

  const candidates: number[] = [];
  const scored: { j: number; d: number }[] = [];

  for (let i = 0; i < count; i++) {
    const cx = coords[i * 3], cy = coords[i * 3 + 1], cz = coords[i * 3 + 2];
    const kk = k + (i % 2);
    const wanted = kk + 6;

    candidates.length = 0;
    let radius = 1;
    while (candidates.length < wanted && radius <= 3) {
      candidates.length = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dz = -radius; dz <= radius; dz++) {
            const bucket = grid.get(packKey(cx + dx, cy + dy, cz + dz));
            if (bucket) for (const idx of bucket) candidates.push(idx);
          }
        }
      }
      radius++;
    }

    scored.length = 0;
    for (const j of candidates) {
      if (j === i) continue;
      scored.push({ j, d: distSq(i, j) });
    }
    scored.sort((a, b) => a.d - b.d);

    const maxDistSq = 0.4 * 0.4;
    for (let n = 0; n < kk && n < scored.length; n++) {
      if (scored[n].d > maxDistSq) break;
      addEdge(i, scored[n].j);
    }
  }

  return { edges: new Uint32Array(edgeList), adjacency };
}
