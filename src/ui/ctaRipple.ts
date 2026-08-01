/**
 * A single luminous pulse from the center of a `.btn--glass` on click — never
 * from the cursor position, per the brief ("onda luminosa desde el centro").
 * Toggling a class rather than JS-driven animation keeps the actual motion
 * in CSS (`@keyframes btn-ripple`), including the automatic reduced-motion
 * clamp already applied globally in base.css.
 */
export function initGlassButtonRipple(): void {
  document.querySelectorAll<HTMLElement>(".btn--glass").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.remove("is-clicked");
      void btn.offsetWidth; // force reflow so re-adding the class restarts the animation
      btn.classList.add("is-clicked");
    });

    btn.addEventListener("animationend", (e) => {
      if (e.animationName === "btn-ripple") {
        btn.classList.remove("is-clicked");
      }
    });
  });
}
