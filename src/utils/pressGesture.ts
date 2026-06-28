/**
 * Tap-vs-hold press gesture for the save buttons (issue #57).
 *
 * A short tap fires `onTap`; pressing and holding past `holdMs` fires `onHold`
 * instead (and the following click is suppressed so only one action runs).
 * While holding, a CSS variable `--press` (0→1) and a `voice-pressing` class are
 * applied to the element so a fill/ring can animate. Works with mouse and
 * touch via Pointer Events.
 *
 * Hold detection is gated by `isHoldEnabled` — when it returns false (e.g. the
 * "next to note" save mode), the element behaves as a plain tap target with no
 * hold affordance.
 */
export interface PressGestureHandlers {
  onTap: () => void;
  onHold: () => void;
  /** When false, the hold path is disabled and only taps fire. Default: on. */
  isHoldEnabled?: () => boolean;
  /** Milliseconds to hold before `onHold` fires. Default 450. */
  holdMs?: number;
}

const MOVE_CANCEL_THRESHOLD_PX = 10;

/**
 * Attach the gesture to an element. Returns a cleanup function that removes the
 * listeners and any lingering visual state.
 */
export function attachPressGesture(
  el: HTMLElement,
  handlers: PressGestureHandlers,
): () => void {
  const holdMs = handlers.holdMs ?? 450;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let holdFired = false;
  let moved = false;
  let rafId: number | null = null;
  let startTime = 0;

  const holdEnabled = () =>
    handlers.isHoldEnabled ? handlers.isHoldEnabled() : true;

  const clearVisual = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    el.removeClass("voice-pressing");
    el.style.removeProperty("--press");
  };

  const tick = () => {
    const fraction = Math.min(1, (performance.now() - startTime) / holdMs);
    el.setCssProps({ "--press": `${fraction}` });
    if (fraction >= 1) {
      holdFired = true;
      clearVisual();
      handlers.onHold();
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  };

  const reset = () => {
    pointerId = null;
    clearVisual();
  };

  const onPointerDown = (evt: PointerEvent) => {
    // Primary button / touch only.
    if (evt.button !== 0 || pointerId !== null) {
      return;
    }
    pointerId = evt.pointerId;
    startX = evt.clientX;
    startY = evt.clientY;
    holdFired = false;
    moved = false;

    if (holdEnabled()) {
      try {
        el.setPointerCapture(evt.pointerId);
      } catch {
        // Capture is best-effort; ignore if unsupported.
      }
      el.addClass("voice-pressing");
      startTime = performance.now();
      el.setCssProps({ "--press": "0" });
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const onPointerMove = (evt: PointerEvent) => {
    if (evt.pointerId !== pointerId) {
      return;
    }
    if (
      Math.abs(evt.clientX - startX) > MOVE_CANCEL_THRESHOLD_PX ||
      Math.abs(evt.clientY - startY) > MOVE_CANCEL_THRESHOLD_PX
    ) {
      moved = true;
      clearVisual();
    }
  };

  const onPointerUp = (evt: PointerEvent) => {
    if (evt.pointerId !== pointerId) {
      return;
    }
    clearVisual();
    if (!holdFired && !moved) {
      handlers.onTap();
    }
    pointerId = null;
  };

  const onPointerCancel = (evt: PointerEvent) => {
    if (evt.pointerId !== pointerId) {
      return;
    }
    reset();
  };

  // Swallow the synthetic click that follows a hold so the action runs once.
  const onClick = (evt: MouseEvent) => {
    if (holdFired) {
      evt.preventDefault();
      evt.stopPropagation();
      holdFired = false;
    }
  };

  // Right-click is an accessible alternative to hold (desktop).
  const onContextMenu = (evt: MouseEvent) => {
    if (!holdEnabled()) {
      return;
    }
    evt.preventDefault();
    reset();
    handlers.onHold();
  };

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);
  el.addEventListener("click", onClick);
  el.addEventListener("contextmenu", onContextMenu);

  return () => {
    clearVisual();
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerCancel);
    el.removeEventListener("click", onClick);
    el.removeEventListener("contextmenu", onContextMenu);
  };
}
