/**
 * When to start playing a note while the rest is still being synthesized —
 * pure, so it can be unit-tested.
 *
 * Long notes are synthesized chunk by chunk. If the provider produces audio
 * at `rate` seconds of audio per second of work, and playback runs at `speed`,
 * playback never catches up with generation once a share of
 * `1 - rate / speed` of the note is ready, whatever the note's length. A fast
 * provider (rate above the playback speed) can start right after the first
 * chunk; a slow one needs a head start.
 *
 * The rate is measured after every full reading and stored per provider
 * (see `streamRateKey`), smoothed over runs, so the start point adjusts itself.
 */

/** Start point before anything was measured: a quarter of the note. */
export const DEFAULT_START_PERCENT = 25;
/** Head room on top of the computed start, since the rate varies. */
export const START_MARGIN = 0.1;
/** First chunk of a streamed reading, small so the first audio comes fast. */
export const FIRST_CHUNK_CHARS = 300;
/** Readings shorter than this (seconds of audio) are too short to measure. */
export const MIN_MEASURED_SECONDS = 10;

/** The share of the note (0..1) to generate before playback starts. */
export function startFractionForRate(rate: number, speed = 1): number {
  if (!(rate > 0)) {
    return DEFAULT_START_PERCENT / 100;
  }
  const playback = speed > 0 ? speed : 1;
  const needed = 1 - rate / playback;
  if (needed <= 0) {
    return 0;
  }
  return Math.min(1, needed + START_MARGIN);
}

/** The start fraction as a whole percentage for the settings slider. */
export function startPercentForRate(rate: number, speed = 1): number {
  return Math.round(startFractionForRate(rate, speed) * 100);
}

/**
 * Fold a new measurement into the stored rate. Runs are averaged so one busy
 * moment doesn't swing the start point; a reading that stalled (playback
 * caught up) keeps the slower of the two, so the next start waits longer.
 */
export function mergeRate(
  previous: number | undefined,
  measured: number,
  stalled: boolean,
): number {
  if (!(previous && previous > 0)) {
    return measured;
  }
  const average = (previous + measured) / 2;
  return stalled ? Math.min(average, measured) : average;
}

export interface StartState {
  /** Chunks synthesized so far. */
  chunksReady: number;
  /** Characters synthesized so far. */
  charsReady: number;
  /** Characters in the whole reading. */
  totalChars: number;
  /** Share of the reading (0..1) to have ready before playing. */
  fraction: number;
}

/** Whether enough of the reading is ready to start playing it. */
export function shouldStartPlayback(state: StartState): boolean {
  if (state.chunksReady < 1) {
    return false;
  }
  if (state.totalChars <= 0 || state.charsReady >= state.totalChars) {
    return true;
  }
  return state.charsReady / state.totalChars >= state.fraction;
}

/**
 * The character limit for chunk `index` of a streamed reading: small at first
 * so audio starts quickly, then doubling up to the provider's limit, so each
 * chunk is ready before the audio in front of it has played.
 */
export function rampedChunkLimit(
  index: number,
  first: number,
  max: number,
): number {
  return Math.min(max, first * 2 ** index);
}

/**
 * The key a measured rate is stored under: the provider, plus the server for
 * OpenAI-compatible servers (each server has its own speed).
 */
export function streamRateKey(provider: string, serverUrl?: string): string {
  const server = serverUrl?.trim().replace(/\/+$/, "");
  return provider === "openai-compatible" && server
    ? `${provider}:${server}`
    : provider;
}
