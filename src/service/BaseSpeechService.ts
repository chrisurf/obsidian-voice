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
  LoadedReading,
  SpeechProvider,
  CredentialValidationResult,
} from "./SpeechProvider";
import type { VoiceSettings, VoiceOption } from "../settings/VoiceSettings";
import {
  DEFAULT_SKIP_SECONDS,
  MIN_SKIP_SECONDS,
  MAX_SKIP_SECONDS,
} from "../settings/VoiceSettings";
import type { PauseStyle } from "../types/ProcessorTypes";
import {
  audioDurationSeconds,
  isWavBuffer,
  joinAudioBuffers,
  mp3AudioFrames,
} from "../utils/audioFormat";
import {
  FIRST_CHUNK_CHARS,
  MIN_MEASURED_SECONDS,
  rampedChunkLimit,
  shouldStartPlayback,
} from "../utils/streamStart";
import { interpolatedProgress } from "../utils/generationProgress";
import { canPlayWhileGenerating, ProgressiveAudio } from "./progressiveAudio";

/** How a long reading may start playing before all of it is synthesized. */
export interface StreamingOptions {
  /** "Play while generating" is on. */
  enabled(): boolean;
  /** Share of the reading (0..1) to have ready before playing at `speed`. */
  startFraction(speed: number): number;
  /** A full reading finished: audio seconds per second of synthesis. */
  onMeasured(rate: number, stalled: boolean): void;
}

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
  // The generated reading in the element, for bookmarks set while it plays.
  private loadedReading: LoadedReading | null = null;
  private readingCount = 0;
  // Request lock mechanism - prevents concurrent operations
  protected currentRequestId: string | null = null;
  // How many seconds the rewind / fast-forward controls jump
  protected rewindSeconds: number = DEFAULT_SKIP_SECONDS;
  protected forwardSeconds: number = DEFAULT_SKIP_SECONDS;
  // Last reported synthesis progress (0..1), exposed via getProgress() for
  // pollers such as the Voice player's loading bar.
  protected lastProgress: number = 0;
  protected streaming: StreamingOptions | null = null;
  // The reading being played while it is still synthesized, once playback
  // has started (see synthesizeChunks).
  private progressive: ProgressiveAudio | null = null;
  private progressivePlaying = false;
  // The user asked to play what is ready, before the computed start point.
  private startEarly: (() => void) | null = null;
  private startRequested = false;
  // The note the running operation reads, for "still generating" notices.
  private operationFilePath: string | null = null;

  constructor(voice: string, speed?: number) {
    this.voice = voice;
    this.speed = speed || 1.0;
    this.audio = new Audio();
    this.audio.src = "";
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
    this.markReadingLoaded(filePath);
    this.reportProgress(1, 1);
    void this.playAudio(speed);
  }

  /**
   * Synthesize a reading chunk by chunk and play it — shared by every provider
   * that splits long notes. Reports progress, honours cancellation, and joins
   * the chunks into one file for the cache and saving. With "play while
   * generating" on, MP3 chunks are played as they arrive once enough of the
   * reading is ready (see utils/streamStart.ts).
   */
  protected async synthesizeChunks(
    chunks: string[],
    synthesize: (chunk: string, index: number) => Promise<ArrayBuffer | Blob>,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
    const playSpeed = speed ?? this.speed;
    const fraction = this.streaming?.startFraction(playSpeed) ?? 1;
    const buffers: ArrayBuffer[] = [];
    let charsReady = 0;
    let audioSeconds = 0;
    const started = Date.now();
    // Read once: cancelOperation() drops the controller after aborting it.
    const signal = this.abortController?.signal;
    const throwIfAborted = () => {
      if (signal?.aborted) {
        // Providers recognise a cancellation by the error's name.
        const error = new Error("AbortError");
        error.name = "AbortError";
        throw error;
      }
    };
    let stream =
      chunks.length > 1 && this.streaming?.enabled() && canPlayWhileGenerating()
        ? new ProgressiveAudio(this.audio)
        : null;
    this.progressive = stream;
    if (stream) {
      this.markReadingLoaded(filePath);
    }
    // A cancelled reading whose last request returns late must leave the
    // audio element and the streaming state to the reading started since.
    const isCurrent = () => !signal?.aborted;
    let chunksAppended = 0;
    this.startRequested = false;
    const startPlayback = () => {
      if (stream && !this.progressivePlaying && chunksAppended > 0) {
        this.progressivePlaying = true;
        void this.playAudio(speed);
      }
    };
    this.startEarly = startPlayback;

    // Keep the bar moving while a chunk is synthesized (see
    // utils/generationProgress.ts); the finished chunk sets the real value.
    let chunkStarted = started;
    let chunkIndex = 0;
    const reportedAt = (chars: number) => (chars / totalChars) * 0.95;
    const tick = () => {
      // A cancelled request may still be waiting for its response.
      if (signal?.aborted) {
        return;
      }
      const elapsed = Date.now() - chunkStarted;
      this.reportProgress(
        interpolatedProgress({
          from: reportedAt(charsReady),
          to: reportedAt(charsReady + chunks[chunkIndex].length),
          elapsedMs: elapsed,
          msPerChar: charsReady > 0 ? (chunkStarted - started) / charsReady : 0,
          chunkChars: chunks[chunkIndex].length,
        }),
        1,
      );
    };
    const ticker =
      typeof window !== "undefined" ? window.setInterval(tick, 250) : null;

    try {
      for (let i = 0; i < chunks.length; i++) {
        throwIfAborted();
        chunkIndex = i;
        chunkStarted = Date.now();
        const result = await synthesize(chunks[i], i);
        throwIfAborted();
        const buffer =
          result instanceof ArrayBuffer ? result : await result.arrayBuffer();
        buffers.push(buffer);
        charsReady += chunks[i].length;
        audioSeconds += audioDurationSeconds(buffer) ?? 0;
        // Reserve the last slice of the bar for concatenation + buffering.
        this.reportProgress((charsReady / totalChars) * 0.95, 1);

        if (stream && isWavBuffer(buffer)) {
          // MediaSource can't play WAV: play the finished file instead.
          stream.dispose();
          stream = this.progressive = null;
        }
        if (stream) {
          await stream.append(mp3AudioFrames(buffer));
          chunksAppended++;
          if (
            this.startRequested ||
            shouldStartPlayback({
              chunksReady: i + 1,
              charsReady,
              totalChars,
              fraction,
            })
          ) {
            startPlayback();
          }
        }
      }
      if (ticker !== null) {
        window.clearInterval(ticker);
      }

      const seconds = (Date.now() - started) / 1000;
      if (audioSeconds >= MIN_MEASURED_SECONDS && seconds > 0) {
        this.streaming?.onMeasured(audioSeconds / seconds, !!stream?.stalled);
      }

      const blob = joinAudioBuffers(buffers);
      if (stream && this.progressivePlaying) {
        stream.finish();
        this.handOver(blob, filePath);
      } else {
        stream?.dispose();
        this.playBlob(blob, speed, filePath);
      }
    } catch (error) {
      if (stream) {
        stream.dispose();
        // cancelOperation() already unloaded a cancelled reading.
        if (isCurrent()) {
          this.unloadAudio();
        }
      }
      throw error;
    } finally {
      if (ticker !== null) {
        window.clearInterval(ticker);
      }
      if (isCurrent()) {
        this.progressive = null;
        this.progressivePlaying = false;
        this.startEarly = null;
        this.startRequested = false;
      }
    }
  }

  /**
   * Play what is ready of a reading that has not reached its start point yet
   * (a play tap while generating). Returns false when the reading can't play
   * before it is complete (WAV, a single chunk, no MediaSource); otherwise
   * playback starts now, or with the first chunk if none is ready yet.
   */
  playWhatIsReady(): boolean {
    if (!this.progressive || !this.startEarly) {
      return false;
    }
    this.startRequested = true;
    this.startEarly();
    return true;
  }

  /**
   * Clear the per-call state at the end of a provider's speak(). A call that
   * was cancelled may return long after a new one started (its request was
   * still in flight); it must not clear the newer call's state, or that call
   * could no longer be cancelled.
   */
  protected endSpeak(controller: AbortController | undefined): void {
    if (this.abortController !== controller) {
      return;
    }
    this.isLoading = false;
    this.abortController = undefined;
  }

  /**
   * The character limit per chunk for a text provider: with "play while
   * generating" on, the first chunks are small so the first audio comes fast.
   */
  protected chunkLimit(max: number): number | ((index: number) => number) {
    if (!this.streaming?.enabled() || !canPlayWhileGenerating()) {
      return max;
    }
    return (index) => rampedChunkLimit(index, FIRST_CHUNK_CHARS, max);
  }

  /**
   * Generation finished while its start is already playing: cache the joined
   * file and move the element onto it, keeping position, speed and play state,
   * so seeking, saving and the length shown all use the complete file.
   */
  private handOver(blob: Blob, filePath?: string): void {
    this.lastGeneratedAudio = blob;
    if (filePath) {
      this.lastGeneratedAudioFilePath = filePath;
    }
    const audio = this.audio;
    const position = audio.currentTime;
    const rate = audio.playbackRate;
    const wasPlaying = !audio.paused;
    audio.src = URL.createObjectURL(blob);
    audio.addEventListener(
      "loadedmetadata",
      () => {
        audio.currentTime = position;
        audio.playbackRate = rate;
        if (wasPlaying) {
          void audio.play();
        }
      },
      { once: true },
    );
    this.reportProgress(1, 1);
  }

  /** Drop a partly streamed reading from the element. */
  private unloadAudio(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  setStreaming(options: StreamingOptions | null): void {
    this.streaming = options;
  }

  /** Audio is playing (or paused) while the rest is still being generated. */
  isStreaming(): boolean {
    return this.progressive !== null && this.progressivePlaying;
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
    const duration = this.audio.duration;
    // While a reading streams, the total length is still open: report what
    // is buffered so far.
    const buffered = this.audio.buffered;
    if (!Number.isFinite(duration) && buffered?.length) {
      return buffered.end(buffered.length - 1);
    }
    return duration;
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

  startOperation(filePath?: string): string {
    if (this.currentRequestId !== null) {
      throw new Error(
        `Operation already in progress: ${this.currentRequestId}`,
      );
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    this.currentRequestId = requestId;
    this.abortController = new AbortController();
    this.lastProgress = 0;
    this.operationFilePath = filePath ?? null;

    return requestId;
  }

  /** The note the running operation reads, if it was given one. */
  getOperationFilePath(): string | null {
    return this.currentRequestId !== null ? this.operationFilePath : null;
  }

  isCurrentRequest(requestId: string): boolean {
    return this.currentRequestId === requestId;
  }

  cancelOperation(): void {
    if (this.currentRequestId && this.abortController) {
      this.abortController.abort();
      if (this.progressive) {
        // Stop a reading that already plays while generating.
        this.progressive.dispose();
        this.progressive = null;
        this.progressivePlaying = false;
        this.unloadAudio();
      }
      this.startEarly = null;
      this.startRequested = false;
      this.currentRequestId = null;
      this.operationFilePath = null;
      this.isLoading = false;
      this.abortController = undefined;

      // Reset progress UI
      this.reportProgress(0, 1);
    }
  }

  endOperation(requestId: string): void {
    if (this.currentRequestId === requestId) {
      this.currentRequestId = null;
      this.operationFilePath = null;
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
    const progress = Math.min(1, Math.max(0, total > 0 ? current / total : 0));
    // While generating, the bar only moves forward: the smooth estimate may
    // run ahead of a provider's own coarser report. 0 still resets it.
    if (progress > 0 && progress < this.lastProgress && this.currentRequestId) {
      return;
    }
    this.lastProgress = progress;
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

  getLoadedReading(): LoadedReading | null {
    return this.loadedReading;
  }

  private markReadingLoaded(filePath?: string): void {
    this.loadedReading = { path: filePath ?? null, id: ++this.readingCount };
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
