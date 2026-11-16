/**
 * The playback speeds offered in the status bar's speed menu — pure, so it
 * can be unit-tested. A speed set elsewhere (the player's stepper, a hotkey)
 * that is not one of the presets is listed too, so the menu always shows it.
 */

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.0;

export const SPEED_PRESETS = [
  0.5, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 2.0,
];

/** The speeds to offer, the current one included, in ascending order. */
export function speedChoices(current: number): number[] {
  const rounded = Math.round(current * 10) / 10;
  const inRange = rounded >= MIN_SPEED && rounded <= MAX_SPEED;
  if (!inRange || SPEED_PRESETS.includes(rounded)) {
    return [...SPEED_PRESETS];
  }
  return [...SPEED_PRESETS, rounded].sort((a, b) => a - b);
}

/** A speed as shown on the controls, e.g. "1.0×". */
export function formatSpeed(speed: number): string {
  return `${speed.toFixed(1)}×`;
}
