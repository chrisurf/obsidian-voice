/**
 * BaseSpeechService - Shared, provider-agnostic TTS playback logic
 *
 * Owns the HTMLAudioElement and everything that does not depend on a specific
 * cloud provider: playback controls, speed, the operation/abort lifecycle,
 * progress/error callbacks, and the generated-audio cache used for downloads.
 *
 * Concrete providers (AwsPollyService, ElevenLabsService) extend this class and
 * implement the abstract synthesis/credential/voice members.
 */

import type {
  SpeechProvider,
  CredentialValidationResult,
  NoteSectionInfo,
} from "./SpeechProvider";
import type { VoiceSettings, VoiceOption } from "../settings/VoiceSettings";
import {
  DEFAULT_SKIP_SECONDS,
  MIN_SKIP_SECONDS,
  MAX_SKIP_SECONDS,
  MIN_PLAYBACK_SPEED,
  MAX_PLAYBACK_SPEED,
} from "../settings/VoiceSettings";
import type { PauseStyle } from "../types/ProcessorTypes";

export abstract class BaseSpeechService implements SpeechProvider {
  protected audio: HTMLAudioElement;
  protected speed: number;
  protected voice: string;
  protected progressCallback?: (progress: number) => void;
  protected errorCallback?: (error: string) => void;
  protected abortController?: AbortController;
  protected isLoading: boolean = false;
  protected lastGeneratedAudio: Blob | null = null;
  protected lastGeneratedAudioFilePath: string | null = null;
  // Request lock mechanism - prevents concurrent operations
  protected currentRequestId: string | null = null;
  // How many seconds the rewind / fast-forward controls jump
  protected rewindSeconds: number = DEFAULT_SKIP_SECONDS;
  protected forwardSeconds: number = DEFAULT_SKIP_SECONDS;
  // Last reported synthesis progress (0..1), exposed via getProgress() for
  // pollers such as the Voice player's loading bar.
  protected lastProgress: number = 0;
  // In-note playlist: heading/chunk blobs played in sequence so the first
  // section can start before the rest of the note has finished synthesizing.
  private noteSections: { title: string; blob: Blob | null }[] = [];
  private noteSectionIndex = 0;
  private notePlaylistActive = false;
  private noteWaitingForNext = false;
  private notePlaylistSpeed?: number;
  private noteObjectUrls: string[] = [];

  constructor(voice: string, speed?: number) {
    this.voice = voice;
    this.speed = speed || 1.0;
    this.audio = new Audio();
    this.audio.src = "";
    this.audio.addEventListener("ended", () => this.onNotePlaylistEnded());
  }

  // --- Provider-specific members implemented by subclasses ---

  abstract readonly inputFormat: "ssml" | "text";
  // Providers that use structural pause markup override this (ElevenLabs =
  // "break-tags", MiniMax = "minimax"). Everything else — SSML providers and
  // engines that read markup literally (OpenAI) — keeps the safe default.
  readonly textPauseStyle: PauseStyle = "none";
  abstract speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void>;

  /**
   * Default: join titled parts and speak as one blob. Providers that can play
   * section-by-section (MiMo) override this.
   */
  async speakNoteSections(
    sections: { title: string; text: string }[],
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    const joined = sections
      .map((section) => section.text.trim())
      .filter((text) => text.length > 0)
      .join("\n\n");
    return this.speak(joined, speed, filePath);
  }

  abstract validateCredentials(): Promise<CredentialValidationResult>;
  abstract updateCredentials(settings: VoiceSettings): void;
  abstract getVoiceOptions(): VoiceOption[];

  /**
   * Map a thrown error to a user-friendly message. Providers override this to
   * translate their own API errors; the base provides a generic fallback.
   */
  protected getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "An error occurred. Please try again.";
  }

  // --- Shared playback helper for subclasses ---

  /**
   * Cache the freshly synthesized audio, wire it to the audio element, and
   * start playback. Used by providers once a final audio Blob is ready.
   */
  protected playBlob(blob: Blob, speed?: number, filePath?: string): void {
    this.lastGeneratedAudio = blob; // Cache for download
    if (filePath) {
      this.lastGeneratedAudioFilePath = filePath;
    }
    this.audio.src = URL.createObjectURL(blob);
    this.reportProgress(1, 1);
    void this.playAudio(speed);
  }

  // --- Playback controls ---

  async playAudio(speed?: number): Promise<void> {
    let fSpeed =
      typeof speed === "number" ? parseFloat(speed.toFixed(2)) : this.speed;

    if (fSpeed < MIN_PLAYBACK_SPEED) {
      fSpeed = MIN_PLAYBACK_SPEED;
    } else if (fSpeed > MAX_PLAYBACK_SPEED) {
      fSpeed = MAX_PLAYBACK_SPEED;
    }

    this.audio.playbackRate = fSpeed;
    void this.audio.play();
  }

  pauseAudio(): void {
    this.audio.pause();
  }

  stopAudio(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  isPlaying(): boolean {
    return !this.audio.paused;
  }

  hasEnded(): boolean {
    if (this.notePlaylistActive) {
      const last = this.noteSections.length - 1;
      const allReady =
        last >= 0 && this.noteSections.every((section) => section.blob);
      return (
        this.audio.ended && this.noteSectionIndex >= last && allReady
      );
    }
    return this.audio.ended;
  }

  rewindAudio(): void {
    if (this.audio && !isNaN(this.audio.duration)) {
      this.audio.currentTime = Math.max(
        0,
        this.audio.currentTime - this.rewindSeconds,
      );
    }
  }

  fastForwardAudio(): void {
    if (this.audio && !isNaN(this.audio.duration)) {
      this.audio.currentTime = Math.min(
        this.audio.duration,
        this.audio.currentTime + this.forwardSeconds,
      );
    }
  }

  // --- Skip interval (rewind / fast-forward) ---

  setRewindSeconds(seconds: number): void {
    this.rewindSeconds = this.clampSkipSeconds(seconds);
  }

  setForwardSeconds(seconds: number): void {
    this.forwardSeconds = this.clampSkipSeconds(seconds);
  }

  getRewindSeconds(): number {
    return this.rewindSeconds;
  }

  getForwardSeconds(): number {
    return this.forwardSeconds;
  }

  private clampSkipSeconds(seconds: number): number {
    if (!Number.isFinite(seconds)) {
      return DEFAULT_SKIP_SECONDS;
    }
    return Math.min(
      MAX_SKIP_SECONDS,
      Math.max(MIN_SKIP_SECONDS, Math.round(seconds)),
    );
  }

  // --- Speed ---

  setSpeed(speed: number): number {
    this.speed = speed;
    // Update playback rate in real-time if audio is currently playing
    this.updatePlaybackRate(speed);
    return this.speed;
  }

  getSpeed(): number {
    return this.speed;
  }

  updatePlaybackRate(speed: number): void {
    if (this.audio && this.audio.src) {
      let fSpeed =
        typeof speed === "number" ? parseFloat(speed.toFixed(2)) : this.speed;

      if (fSpeed < MIN_PLAYBACK_SPEED) {
        fSpeed = MIN_PLAYBACK_SPEED;
      } else if (fSpeed > MAX_PLAYBACK_SPEED) {
        fSpeed = MAX_PLAYBACK_SPEED;
      }

      this.audio.playbackRate = fSpeed;
    }
  }

  // --- Voice ---

  setVoice(voice: string): void {
    this.voice = voice;
  }

  getVoice(): string {
    return this.voice;
  }

  // --- Audio element + state ---

  getAudio(): HTMLAudioElement {
    return this.audio;
  }

  getDuration(): number {
    return this.audio.duration;
  }

  getCurrentTime(): number {
    return this.audio.currentTime;
  }

  getVolume(): number {
    return this.audio.volume;
  }

  // --- Operation lifecycle ---

  isOperationInProgress(): boolean {
    return this.currentRequestId !== null;
  }

  startOperation(): string {
    if (this.currentRequestId !== null) {
      throw new Error(
        `Operation already in progress: ${this.currentRequestId}`,
      );
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    this.currentRequestId = requestId;
    this.abortController = new AbortController();
    this.lastProgress = 0;

    return requestId;
  }

  isCurrentRequest(requestId: string): boolean {
    return this.currentRequestId === requestId;
  }

  cancelOperation(): void {
    if (this.currentRequestId && this.abortController) {
      this.abortController.abort();
      this.currentRequestId = null;
      this.isLoading = false;
      this.abortController = undefined;
      this.clearNotePlaylist();

      // Reset progress UI
      this.reportProgress(0, 1);
    }
  }

  endOperation(requestId: string): void {
    if (this.currentRequestId === requestId) {
      this.currentRequestId = null;
      this.isLoading = false;
      this.abortController = undefined;
    } else if (this.currentRequestId !== null) {
      console.warn(
        `[Voice] Attempted to end operation ${requestId} but current is ${this.currentRequestId}`,
      );
    }
  }

  /**
   * @deprecated Use isOperationInProgress() instead
   */
  isLoadingInProgress(): boolean {
    return this.isOperationInProgress();
  }

  /**
   * @deprecated Use cancelOperation() instead
   */
  cancelLoading(): void {
    this.cancelOperation();
  }

  // --- Callbacks ---

  setProgressCallback(callback: (progress: number) => void): void {
    this.progressCallback = callback;
  }

  setErrorCallback(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }

  protected reportProgress(current: number, total: number): void {
    const progress = total > 0 ? current / total : 0;
    this.lastProgress = Math.min(1, Math.max(0, progress));
    if (this.progressCallback) {
      this.progressCallback(this.lastProgress);
    }
  }

  getProgress(): number {
    return this.lastProgress;
  }

  protected reportError(error: unknown): void {
    if (this.errorCallback) {
      this.errorCallback(this.getErrorMessage(error));
    }
  }

  // --- Caching / download ---

  /**
   * Get the last generated audio blob for download
   * @param filePath - Path of the current file to validate cache
   */
  getLastGeneratedAudio(filePath?: string): Blob | null {
    // If file path is provided, validate it matches the cached audio's file
    if (filePath && this.lastGeneratedAudioFilePath !== filePath) {
      return null;
    }
    return this.lastGeneratedAudio;
  }

  clearCachedAudio(): void {
    this.lastGeneratedAudio = null;
    this.lastGeneratedAudioFilePath = null;
  }

  setCachedAudio(audioBlob: Blob, filePath: string): void {
    this.lastGeneratedAudio = audioBlob;
    this.lastGeneratedAudioFilePath = filePath;
  }

  // --- In-note playlist (heading/chunk jump + play-as-you-go) ---

  getNoteSections(): NoteSectionInfo[] {
    if (!this.notePlaylistActive) {
      return [];
    }
    return this.noteSections.map((section) => ({
      title: section.title,
      ready: section.blob !== null,
    }));
  }

  getNoteSectionIndex(): number {
    return this.notePlaylistActive ? this.noteSectionIndex : -1;
  }

  playNoteSection(index: number): void {
    if (!this.notePlaylistActive || !this.noteSections[index]?.blob) {
      return;
    }
    this.noteWaitingForNext = false;
    this.playNoteSectionBlob(index, this.notePlaylistSpeed);
  }

  clearNotePlaylist(): void {
    this.notePlaylistActive = false;
    this.noteWaitingForNext = false;
    this.noteSectionIndex = 0;
    this.noteSections = [];
    this.revokeNoteObjectUrls();
  }

  /**
   * Start an in-note playlist. `appendNoteSection` fills blobs in order and
   * starts playback as soon as the first one arrives.
   */
  protected beginNotePlaylist(titles: string[], filePath?: string): void {
    this.revokeNoteObjectUrls();
    this.noteSections = titles.map((title) => ({ title, blob: null }));
    this.noteSectionIndex = 0;
    this.notePlaylistActive = true;
    this.noteWaitingForNext = false;
    if (filePath) {
      this.lastGeneratedAudioFilePath = filePath;
    }
  }

  /** Push the next synthesized section and play it if nothing is playing. */
  protected appendNoteSection(blob: Blob, speed?: number): void {
    const index = this.noteSections.findIndex((section) => section.blob === null);
    if (index === -1) {
      return;
    }
    this.noteSections[index].blob = blob;
    this.notePlaylistSpeed = speed;
    if (index === 0 || this.noteWaitingForNext) {
      this.noteWaitingForNext = false;
      this.playNoteSectionBlob(index, speed);
    }
  }

  /** Cache the concatenated note audio for download once every section is in. */
  protected finishNotePlaylist(joined: Blob, filePath?: string): void {
    this.lastGeneratedAudio = joined;
    if (filePath) {
      this.lastGeneratedAudioFilePath = filePath;
    }
    this.reportProgress(1, 1);
  }

  private playNoteSectionBlob(index: number, speed?: number): void {
    const section = this.noteSections[index];
    if (!section?.blob) {
      return;
    }
    this.noteSectionIndex = index;
    const url = URL.createObjectURL(section.blob);
    this.noteObjectUrls.push(url);
    this.audio.src = url;
    void this.playAudio(speed ?? this.notePlaylistSpeed);
  }

  private onNotePlaylistEnded(): void {
    if (!this.notePlaylistActive) {
      return;
    }
    const next = this.noteSectionIndex + 1;
    if (next >= this.noteSections.length) {
      return;
    }
    if (this.noteSections[next].blob) {
      this.playNoteSectionBlob(next, this.notePlaylistSpeed);
    } else {
      this.noteWaitingForNext = true;
    }
  }

  private revokeNoteObjectUrls(): void {
    for (const url of this.noteObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.noteObjectUrls = [];
  }
}
