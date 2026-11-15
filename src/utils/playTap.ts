/**
 * What a tap on the player's play button does — pure, so it can be unit-tested.
 *
 * The player's "Cache" toggle (stored as `playNoteSavedAudio`) decides whether
 * a fresh start reuses audio that already exists or pays for a new render:
 * - Cache on (default): play the note's existing audio — its saved MP3 or the
 *   audio already rendered this session — and only synthesize when there is
 *   none. Changed voice/settings never trigger a new render on their own.
 * - Cache off: a fresh start renders the note again with the current voice and
 *   settings; the player then switches Cache back on, so the next tap doesn't
 *   pay again by accident.
 * Pause / resume is the same in both modes: a paused track resumes.
 */

export interface PlayTapState {
  /** A synthesis request is running. */
  synthesizing: boolean;
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
  /** Cancel the running synthesis. */
  | "cancel"
  | "pause"
  /** Resume the loaded audio. */
  | "resume"
  /** Play the active note's existing audio, synthesizing only if it has none. */
  | "play-cached"
  /** Render the active note again with the current voice and settings. */
  | "regenerate";

export function resolvePlayTap(state: PlayTapState): PlayTapAction {
  if (state.synthesizing) {
    return "cancel";
  }
  if (state.playing) {
    return "pause";
  }
  if (state.pausedMidTrack && !state.loadedAudioIsStale) {
    return "resume";
  }
  if (!state.cacheOn && state.hasActiveNote) {
    return "regenerate";
  }
  if (state.hasActiveNote) {
    return "play-cached";
  }
  // No note to read (e.g. a PDF or an empty pane): replay what is loaded.
  return state.hasLoadedAudio ? "resume" : "play-cached";
}
