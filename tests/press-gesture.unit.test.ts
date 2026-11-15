import { attachPressGesture } from "../src/utils/pressGesture";

type Listener = (evt: Record<string, unknown>) => void;

/** Just enough of an Obsidian HTMLElement for the gesture (no DOM in Jest). */
function fakeElement() {
  const listeners: Record<string, Listener> = {};
  const el = {
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    removeEventListener: (type: string) => delete listeners[type],
    setPointerCapture: () => {},
    addClass: () => {},
    removeClass: () => {},
    setCssProps: () => {},
    style: { removeProperty: () => {} },
  };
  const fire = (type: string, evt: Record<string, unknown> = {}) =>
    listeners[type]?.({ preventDefault: () => {}, ...evt });
  return { el: el as unknown as HTMLElement, fire };
}

describe("Press gesture Unit", () => {
  beforeAll(() => {
    (globalThis as unknown as { window: unknown }).window = {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    };
  });

  const press = (pointerType: string) => ({
    button: 0,
    pointerId: 1,
    pointerType,
    clientX: 0,
    clientY: 0,
  });

  it("a right-click (mouse context menu) fires the hold", () => {
    const { el, fire } = fakeElement();
    const onHold = jest.fn();
    attachPressGesture(el, { onTap: jest.fn(), onHold });
    fire("contextmenu");
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it("a long touch press's context menu does not cut the hold short", () => {
    const { el, fire } = fakeElement();
    const onHold = jest.fn();
    const onTap = jest.fn();
    attachPressGesture(el, { onTap, onHold });
    fire("pointerdown", press("touch"));
    fire("contextmenu");
    expect(onHold).not.toHaveBeenCalled();
    // Releasing early is still a tap, as without the context menu.
    fire("pointerup", press("touch"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("a quick tap fires the tap, not the hold", () => {
    const { el, fire } = fakeElement();
    const onHold = jest.fn();
    const onTap = jest.fn();
    attachPressGesture(el, { onTap, onHold });
    fire("pointerdown", press("mouse"));
    fire("pointerup", press("mouse"));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onHold).not.toHaveBeenCalled();
  });
});
