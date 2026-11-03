/**
 * The scheduling behind <Reveal>, shared by every block on the page.
 *
 * All the Reveals of a page mount in the same React commit. Instead of
 * each one measuring itself and writing its state (a style recalc and a
 * layout per block, a dozen times on the pricing page), they queue here
 * and one animation frame handles them all: every measurement first,
 * then every write. Blocks still below the fold then share a single
 * IntersectionObserver.
 *
 * States written to data-reveal (the CSS is in showcase.css):
 *   "shown"    already on screen when the page hydrated — no rule, no
 *              motion, nothing the visitor is reading ever blinks;
 *   "pending"  below the fold, hidden, waiting;
 *   "visible"  it scrolled in: the move plays.
 */

type Pending = {
  el: HTMLElement;
  show: () => void;
  onFocus: () => void;
  cancelled: boolean;
};

const queue: Pending[] = [];
let frame: number | null = null;

const watched = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

function observe(el: Element, onEnter: () => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const enter = watched.get(entry.target);
        if (!enter) continue;
        unobserve(entry.target);
        enter();
      }
    },
    // Fire once any part of the block is a little way up from the bottom
    // edge, so the move happens where the eye is, not under the
    // viewport's rim. Threshold 0: a ratio would never be reached by a
    // block many screens tall.
    { rootMargin: "0px 0px -10% 0px", threshold: 0 },
  );
  watched.set(el, onEnter);
  observer.observe(el);
}

function unobserve(el: Element) {
  watched.delete(el);
  observer?.unobserve(el);
}

function flush() {
  frame = null;
  const batch = queue.splice(0).filter((item) => !item.cancelled);
  const viewportHeight = window.innerHeight;
  // Reads before writes: one layout for the whole batch. A block with no
  // box at all (display: none — the other breakpoint's copy of a section,
  // a closed tab) is left alone: static if it ever shows.
  const tops = batch.map(({ el }) =>
    el.getClientRects().length ? el.getBoundingClientRect().top : null,
  );
  batch.forEach((item, i) => {
    const top = tops[i];
    if (top === null) return;
    if (top < viewportHeight) {
      item.el.dataset.reveal = "shown";
      return;
    }
    item.el.dataset.reveal = "pending";
    observe(item.el, item.show);
    // Keyboard: focus landing inside a hidden block shows it at once,
    // without waiting for scroll geometry or a cascade's delay.
    item.el.addEventListener("focusin", item.onFocus, { once: true });
  });
}

/**
 * Arms `el`: shown as it stands if already on screen, otherwise hidden
 * until it scrolls into view, when `show` runs. Returns a cancel.
 */
export function armReveal(el: HTMLElement, show: () => void): () => void {
  const item: Pending = {
    el,
    show,
    onFocus: () => {
      unobserve(el);
      el.dataset.reveal = "shown";
    },
    cancelled: false,
  };
  queue.push(item);
  frame ??= window.requestAnimationFrame(flush);
  return () => {
    item.cancelled = true;
    unobserve(el);
    el.removeEventListener("focusin", item.onFocus);
  };
}
