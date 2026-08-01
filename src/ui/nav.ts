/** Toggles the compact/glass state of the nav once the hero has scrolled past. */
export function initNav(): void {
  const nav = document.querySelector<HTMLElement>("[data-nav]");
  if (!nav) return;

  const THRESHOLD = 40;
  const update = () => {
    nav.classList.toggle("nav--compact", window.scrollY > THRESHOLD);
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}
