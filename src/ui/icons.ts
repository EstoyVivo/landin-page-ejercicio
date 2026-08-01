import {
  createElement,
  ArrowLeft,
  ArrowRight,
  Globe,
  LayoutGrid,
  Zap,
  Link,
  Smartphone,
  Brain,
  MessageCircle,
  Mail,
  X,
  Send,
  CircleCheck,
  ChevronDown,
} from "lucide";
import type { IconNode } from "lucide";

/**
 * The only place an icon name maps to a Lucide icon. Every glyph on the site
 * (arrows, feature icons) is resolved through this table — no other icon
 * library, no emoji, no raster images.
 */
const ICONS: Record<string, IconNode> = {
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  globe: Globe,
  "layout-grid": LayoutGrid,
  zap: Zap,
  link: Link,
  smartphone: Smartphone,
  brain: Brain,
  "message-circle": MessageCircle,
  mail: Mail,
  x: X,
  send: Send,
  "check-circle": CircleCheck,
  "chevron-down": ChevronDown,
};

/** Replaces every `[data-icon]` placeholder in the page with its Lucide SVG. */
export function initIcons(): void {
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    const iconNode = name ? ICONS[name] : undefined;
    if (!iconNode) return;

    // stroke-width set once here, identically for every icon on the site —
    // this is what "mismo grosor de línea" actually means in SVG terms.
    const svg = createElement(iconNode, {
      class: "icon",
      "stroke-width": "1.75",
    });

    el.replaceChildren(svg);
  });
}
