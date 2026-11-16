/**
 * Smooth progress between finished chunks — pure, so it can be unit-tested.
 *
 * A provider answers each chunk in one piece, so the real progress only moves
 * when a chunk is done, which for a slow local server can be a minute. In
 * between, the bar creeps towards the next chunk's mark at the pace the
 * finished chunks took per character, so the user sees work going on. It
 * never reaches the mark itself: only the finished chunk moves it there.
 */

/** The share of the running chunk the estimate may fill at most. */
export const ESTIMATE_CAP = 0.9;
/** Share of the chunk from which the estimate slows down. */
const SLOW_FROM = 0.75;
/**
 * Time constant (ms) for the first chunk, when there is no pace yet: the bar
 * covers about two thirds of the cap in this time, then slows down.
 */
export const UNKNOWN_PACE_MS = 15000;

/**
 * The estimated share (0..ESTIMATE_CAP) of the running chunk that is done.
 * With a known `expectedMs` the estimate is linear up to SLOW_FROM, then
 * approaches the cap ever more slowly, so a chunk that takes longer than
 * expected still shows movement. Without one it eases out from the start.
 */
export function estimatedChunkShare(
  elapsedMs: number,
  expectedMs?: number,
): number {
  if (!(elapsedMs > 0)) {
    return 0;
  }
  if (!(expectedMs && expectedMs > 0)) {
    return ESTIMATE_CAP * (1 - Math.exp(-elapsedMs / UNKNOWN_PACE_MS));
  }
  const t = elapsedMs / expectedMs;
  if (t <= SLOW_FROM) {
    return t;
  }
  const rest = ESTIMATE_CAP - SLOW_FROM;
  return SLOW_FROM + rest * (1 - Math.exp(-(t - SLOW_FROM) / rest));
}

export interface ChunkProgressState {
  /** Progress (0..1) when the running chunk started. */
  from: number;
  /** Progress (0..1) the running chunk reaches when it is done. */
  to: number;
  /** Milliseconds since the running chunk started. */
  elapsedMs: number;
  /** Milliseconds per character of the finished chunks, if any. */
  msPerChar?: number;
  /** Characters in the running chunk. */
  chunkChars: number;
}

/** The progress (0..1) to show while a chunk is being synthesized. */
export function interpolatedProgress(state: ChunkProgressState): number {
  const expected =
    state.msPerChar && state.msPerChar > 0
      ? state.msPerChar * state.chunkChars
      : undefined;
  const share = estimatedChunkShare(state.elapsedMs, expected);
  return state.from + (state.to - state.from) * share;
}
