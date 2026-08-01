import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { BrainScene } from "../brain/scene";

gsap.registerPlugin(ScrollTrigger);

interface BrainKeyframe {
  yaw: number;
  pitch: number;
  dolly: number;
  mood: number;
}

// One keyframe per section, in document order. Interpolated continuously by
// scroll progress (see art direction §3.6) instead of snapping section to section.
const KEYFRAMES: BrainKeyframe[] = [
  { yaw: 0, pitch: 0, dolly: 0, mood: 0 }, // hero
  { yaw: 0.04, pitch: 0.015, dolly: -0.15, mood: 0.12 }, // trust marquee
  { yaw: -0.09, pitch: 0.01, dolly: 0.1, mood: 0.22 }, // process
  { yaw: 0.12, pitch: -0.04, dolly: 0.35, mood: 0.45 }, // solutions
  { yaw: -0.06, pitch: 0.05, dolly: 0.15, mood: 0.65 }, // impact
  { yaw: 0.07, pitch: 0, dolly: 0.05, mood: 0.5 }, // tech marquee
  { yaw: 0, pitch: -0.01, dolly: -0.35, mood: 0.3 }, // cta — brain pulls back toward camera
  { yaw: 0, pitch: -0.01, dolly: -0.35, mood: 0.3 }, // footer, same resting state as cta
];

function sampleKeyframes(progress: number): BrainKeyframe {
  const scaled = progress * (KEYFRAMES.length - 1);
  const index = Math.min(Math.floor(scaled), KEYFRAMES.length - 2);
  const t = scaled - index;
  const a = KEYFRAMES[index];
  const b = KEYFRAMES[index + 1];
  return {
    yaw: gsap.utils.interpolate(a.yaw, b.yaw, t),
    pitch: gsap.utils.interpolate(a.pitch, b.pitch, t),
    dolly: gsap.utils.interpolate(a.dolly, b.dolly, t),
    mood: gsap.utils.interpolate(a.mood, b.mood, t),
  };
}

/**
 * Binds the brain's camera yaw/pitch/dolly and color mood to a single global
 * scroll progress (document top to bottom), so the organism keeps evolving
 * continuously across sections instead of resetting at each boundary.
 */
export function initScrollController(brain: BrainScene): () => void {
  const trigger = ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    scrub: 0.6,
    onUpdate: (self) => {
      const frame = sampleKeyframes(self.progress);
      brain.setScrollTarget(frame.yaw, frame.pitch, frame.dolly, frame.mood);
    },
  });

  return () => trigger.kill();
}
