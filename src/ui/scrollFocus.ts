/**
 * scrollFocus.ts — a menu longer than the screen scrolls with its focus: moving Up and Down past the visible part
 * brings the focused option into view (the menu's own scroll only; the screen under it never moves).
 */
import { type RefObject, useLayoutEffect } from "react";

/** How much room is kept between the focused option and the menu's edge when it scrolls to it (px). */
const MARGIN = 12;

/**
 * Keeps the `.is-focused` element inside `box` (a scrolling container: `overflow-y: auto` and a max height) in
 * view, whenever `focus` changes.
 */
export function useScrollFocus(box: RefObject<HTMLElement | null>, focus: unknown) {
  useLayoutEffect(() => {
    const el = box.current;
    const item = el?.querySelector<HTMLElement>(".is-focused");
    if (!el || !item) return;
    const view = el.getBoundingClientRect(), at = item.getBoundingClientRect();
    if (at.top < view.top + MARGIN) el.scrollTop -= view.top + MARGIN - at.top;
    else if (at.bottom > view.bottom - MARGIN) el.scrollTop += at.bottom - (view.bottom - MARGIN);
  }, [box, focus]);
}
