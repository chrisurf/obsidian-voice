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
} from "./SpeechProvider";
import type { VoiceSettings, VoiceOption } from "../settings/VoiceSettings";
import {
  DEFAULT_SKIP_SECONDS,
  MIN_SKIP_SECONDS,
  MAX_SKIP_SECONDS,
} from "../settings/VoiceSettings";

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

  constructor(voice: string, speed?: number) {
    this.voice = voice;
    this.speed = speed || 1.0;
    this.audio = new Audio();
    this.audio.src = "";
  }

  // --- Provider-specific members implemented by subclasses ---

  abstract readonly inputFormat: "ssml" | "text";
  abstract speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void>;
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

    if (fSpeed < 0.5) {
      fSpeed = 0.5;
    } else if (fSpeed > 2) {
      fSpeed = 2;
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

      // Clamp speed to supported range
      if (fSpeed < 0.5) {
        fSpeed = 0.5;
      } else if (fSpeed > 2) {
        fSpeed = 2;
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
    if (this.progressCallback) {
      const progress = total > 0 ? current / total : 0;
      this.progressCallback(Math.min(1, Math.max(0, progress)));
    }
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
}
