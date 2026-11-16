/**
 * What a tap on the player's play button does — pure, so it can be unit-tested.
 *
 * The player's "Cache" toggle (stored as `playNoteSavedAudio`) decides whether
 * a fresh start reuses audio that already exists or pays for a new render:
 * - Cache on (default): play the note's existing audio — its saved MP3 or the
 *   audio already rendered this session — and only synthesize when there is
 *   none. Changed voice/settings never trigger a new render on their own.
 * - Cache off: the next tap renders the note again with the current voice and
 *   settings — even when old audio is paused mid-track — and the player then
 *   switches Cache back on, so the next tap doesn't pay again by accident.
 * With Cache on, a paused track resumes. A tap never cancels a reading that
 * is being generated (only the ✕ next to the progress bar does): before its
 * start point it plays what is ready, afterwards it pauses and resumes.
 */

export interface PlayTapState {
  /** A synthesis request is running and nothing of it plays yet. */
  synthesizing: boolean;
  /**
   * The start of a reading plays (or is paused) while the rest is still
   * being generated ("Play while generating").
   */
  streaming: boolean;
  /** Audio is currently playing. */
  playing: boolean;
  /** Audio is loaded and paused part-way (not at its start, not ended). */
  pausedMidTrack: boolean;
  /** The loaded audio belongs to a different note than the one in view. */
  loadedAudioIsStale: boolean;
  /** Some audio is loaded in the player at all. */
  hasLoadedAudio: boolean;
  /** A Markdown note is open to read. */
  hasActiveNote: boolean;
  /** The Cache toggle. */
  cacheOn: boolean;
}

export type PlayTapAction =
  /** Play what is ready of the reading being generated. */
  | "play-now"
  | "pause"
  /** Resume the loaded audio. */
  | "resume"
  /** Play the active note's existing audio, synthesizing only if it has none. */
  | "play-cached"
  /** Render the active note again with the current voice and settings. */
  | "regenerate";

export function resolvePlayTap(state: PlayTapState): PlayTapAction {
  if (state.synthesizing) {
    return "play-now";
  }
  if (state.playing) {
    return "pause";
  }
  // Paused while the rest is still being generated: it is the fresh render.
  if (state.streaming) {
    return "resume";
  }
  // Cache off means "make new audio": checked before resuming, because Cache
  // only stays off until the next render, so paused audio is the old one.
  if (!state.cacheOn && state.hasActiveNote) {
    return "regenerate";
  }
  if (state.pausedMidTrack && !state.loadedAudioIsStale) {
    return "resume";
  }
  if (state.hasActiveNote) {
    return "play-cached";
  }
  // No note to read (e.g. a PDF or an empty pane): replay what is loaded.
  return state.hasLoadedAudio ? "resume" : "play-cached";
}
