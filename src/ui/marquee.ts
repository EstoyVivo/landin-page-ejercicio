/**
 * Duplicates each marquee track once so the CSS `translateX(-50%)` loop
 * (see layout.css `marquee-scroll`) has no visible seam.
 */
export function initMarquees(): void {
  document.querySelectorAll<HTMLElement>("[data-marquee]").forEach((root) => {
    const track = root.querySelector<HTMLElement>(".marquee__track");
    if (!track) return;
    const clone = track.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    track.after(clone);

    // wrap both halves so the 50% translate applies to the pair as a unit
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.width = "max-content";
    track.replaceWith(wrapper);
    wrapper.append(track, clone);
    wrapper.classList.add("marquee__track");
    track.classList.remove("marquee__track");
    clone.classList.remove("marquee__track");
    track.style.display = clone.style.display = "flex";
    track.style.gap = clone.style.gap = "4rem";
  });
}
