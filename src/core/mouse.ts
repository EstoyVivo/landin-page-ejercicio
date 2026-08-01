export interface MousePosition {
  /** normalized [-1, 1], origin at viewport center */
  x: number;
  y: number;
}

type Listener = (pos: MousePosition) => void;

/**
 * Single source of truth for pointer position. The brain, the glass-panel
 * parallax and the particle force field all read from here instead of
 * attaching their own listeners.
 */
export function createMouseTracker() {
  const position: MousePosition = { x: 0, y: 0 };
  const listeners = new Set<Listener>();

  const handlePointerMove = (e: PointerEvent) => {
    position.x = (e.clientX / window.innerWidth) * 2 - 1;
    position.y = (e.clientY / window.innerHeight) * 2 - 1;
    listeners.forEach((fn) => fn(position));
  };

  window.addEventListener("pointermove", handlePointerMove, { passive: true });

  return {
    position,
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose(): void {
      window.removeEventListener("pointermove", handlePointerMove);
      listeners.clear();
    },
  };
}
