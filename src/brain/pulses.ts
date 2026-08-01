import * as THREE from "three";
import type { BrainNetwork } from "./network";

interface PendingPulse {
  node: number;
  delay: number;
  strength: number;
  depth: number;
}

const MAX_DEPTH = 2;
const DECAY_TAU = 0.5; // seconds; heat fades exponentially with this time constant
const PROPAGATION_DELAY = 0.12; // seconds between a node lighting up and its neighbors catching it
const FIRE_INTERVAL_MIN = 0.35;
const FIRE_INTERVAL_MAX = 0.85;

/**
 * Drives the "thinking" feel of the network: random nodes flash and briefly light
 * their immediate neighbors, decaying quickly, independent of the particle flow.
 */
export class PulseSystem {
  private network: BrainNetwork;
  private nodeHeat: Float32Array;
  private pending: PendingPulse[] = [];
  private nextFireIn: number;
  private nodeHeatAttr: THREE.BufferAttribute;
  private lineHeatAttr: THREE.BufferAttribute;

  constructor(network: BrainNetwork, nodeGeometry: THREE.BufferGeometry, lineGeometry: THREE.BufferGeometry) {
    this.network = network;
    this.nodeHeat = new Float32Array(network.count);
    this.nodeHeatAttr = nodeGeometry.getAttribute("aHeat") as THREE.BufferAttribute;
    this.lineHeatAttr = lineGeometry.getAttribute("aHeat") as THREE.BufferAttribute;
    this.nextFireIn = randomInterval();
  }

  /** External trigger (e.g. a particle arriving at a node) — feeds the same decay/propagation pipeline. */
  ignite(node: number, strength = 0.6): void {
    this.pending.push({ node, delay: 0, strength, depth: MAX_DEPTH });
  }

  update(dt: number): void {
    const decay = Math.exp(-dt / DECAY_TAU);
    for (let i = 0; i < this.nodeHeat.length; i++) {
      this.nodeHeat[i] *= decay;
    }

    this.nextFireIn -= dt;
    if (this.nextFireIn <= 0) {
      this.nextFireIn = randomInterval();
      const node = Math.floor(Math.random() * this.network.count);
      this.pending.push({ node, delay: 0, strength: 1, depth: 0 });
    }

    const stillPending: PendingPulse[] = [];
    for (const p of this.pending) {
      p.delay -= dt;
      if (p.delay > 0) {
        stillPending.push(p);
        continue;
      }
      this.nodeHeat[p.node] = Math.max(this.nodeHeat[p.node], p.strength);

      if (p.depth < MAX_DEPTH && p.strength > 0.12) {
        for (const neighbor of this.network.adjacency[p.node]) {
          this.pending.push({
            node: neighbor,
            delay: PROPAGATION_DELAY * (0.8 + Math.random() * 0.4),
            strength: p.strength * 0.55,
            depth: p.depth + 1,
          });
        }
      }
    }
    this.pending = stillPending;

    this.writeAttributes();
  }

  private writeAttributes(): void {
    const nodeArr = this.nodeHeatAttr.array as Float32Array;
    nodeArr.set(this.nodeHeat);
    this.nodeHeatAttr.needsUpdate = true;

    const edges = this.network.edges;
    const lineArr = this.lineHeatAttr.array as Float32Array;
    for (let e = 0; e < edges.length / 2; e++) {
      const a = edges[e * 2];
      const b = edges[e * 2 + 1];
      lineArr[e * 2] = this.nodeHeat[a];
      lineArr[e * 2 + 1] = this.nodeHeat[b];
    }
    this.lineHeatAttr.needsUpdate = true;
  }
}

function randomInterval(): number {
  return FIRE_INTERVAL_MIN + Math.random() * (FIRE_INTERVAL_MAX - FIRE_INTERVAL_MIN);
}
