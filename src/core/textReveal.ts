const SELECTOR = "[data-reveal], [data-reveal-delay], [data-reveal-card]";
const STAGGER_MS = 90;

/**
 * One IntersectionObserver drives every reveal in the page — title lines,
 * lead paragraphs and glass cards alike. Elements only need the right data
 * attribute (see typography.css / glass.css for the corresponding transition).
 * Siblings sharing a parent are staggered automatically by DOM order.
 */
export function initTextReveal(): void {
  const groups = new Map<Element, Element[]>();

  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    const parent = el.parentElement;
    if (!parent) return;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent)!.push(el);
  });

  groups.forEach((children) => {
    children.forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = `${i * STAGGER_MS}ms`;
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
  );

  document.querySelectorAll(SELECTOR).forEach((el) => observer.observe(el));
}
