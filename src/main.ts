import { BrainScene } from "./brain/scene";
import { detectPerfProfile } from "./core/perfProfile";
import { createMouseTracker } from "./core/mouse";
import { isWebGLAvailable } from "./core/webgl";
import { initIcons } from "./ui/icons";
import { initNav } from "./ui/nav";
import { initMarquees } from "./ui/marquee";
import { initGlassButtonRipple } from "./ui/ctaRipple";
import { initContactModal } from "./ui/contactModal";
import { initTextReveal } from "./core/textReveal";
import { initScrollController } from "./core/scrollController";

initIcons();
initNav();
initMarquees();
initGlassButtonRipple();
initContactModal();
initTextReveal();

const canvas = document.querySelector<HTMLCanvasElement>("#brain-canvas");

if (canvas && !isWebGLAvailable()) {
  // No WebGL: keep the page fully usable, swap the brain for a static
  // atmosphere so the layout never shows a blank/broken canvas.
  canvas.remove();
  document.body.classList.add("no-webgl");
} else if (canvas) {
  const profile = detectPerfProfile();
  const brain = new BrainScene(canvas, profile.quality, profile.reducedMotion);
  const mouse = createMouseTracker();

  mouse.subscribe(({ x, y }) => brain.setPointer(x, y));

  if (!profile.reducedMotion) {
    initScrollController(brain);
  }

  let lastTime = performance.now();
  let running = true;

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) lastTime = performance.now();
  });

  const root = document.documentElement;

  function tick(now: number) {
    if (running) {
      const dt = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      brain.update(dt);
      // Keeps DOM/CSS elements (the glass CTA button's glow) breathing in
      // lockstep with the brain instead of running an unrelated animation.
      root.style.setProperty("--breath-intensity", brain.getBreathIntensity().toFixed(3));
    } else {
      lastTime = now;
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
