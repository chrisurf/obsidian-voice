/**
 * SpeechProvider - Common interface for text-to-speech providers
 *
 * Both AwsPollyService and ElevenLabsService implement this interface so the
 * rest of the plugin (status bar, mobile control bar, hotkeys, orchestration)
 * can work against any provider interchangeably.
 *
 * The provider-agnostic playback/control/lifecycle/caching/callback logic lives
 * in BaseSpeechService; only synthesis, credential handling, and voice catalogs
 * differ between providers.
 */

import type { VoiceSettings, VoiceOption } from "../settings/VoiceSettings";
import type { PauseStyle } from "../types/ProcessorTypes";

/**
 * Result of validating a provider's credentials
 */
export interface CredentialValidationResult {
  isValid: boolean;
  error?: string;
  voiceCount?: number;
  /**
   * The provider's voices as a ready-to-use catalog, when validation fetched a
   * voice list (e.g. Azure's /voices/list). Lets the settings tab cache the
   * full catalog so the voice picker can offer every voice grouped by language,
   * instead of only the small hardcoded fallback list.
   */
  voices?: VoiceOption[];
  /**
   * Model ids the server offers, when validation read a model list (the
   * OpenAI-compatible provider), so the settings can offer them in a dropdown.
   */
  models?: string[];
}

/** A heading (or chunk) of the note currently being read, for in-player jump. */
export interface NoteSectionInfo {
  title: string;
  /** False until that section's audio has been synthesized. */
  ready: boolean;
}

export interface SpeechProvider {
  /**
   * The kind of content this provider expects from the processing pipeline:
   * - "ssml": full SSML markup (AWS Polly)
   * - "text": plain spoken text (ElevenLabs)
   */
  readonly inputFormat: "ssml" | "text";

  /**
   * For "text" providers, which pause markup the engine understands so the text
   * pipeline emits the right kind (ElevenLabs `<break>`, MiniMax `<#x#>`, or
   * newline-only for engines that read markup literally). Irrelevant for "ssml"
   * providers; defaults to "none".
   */
  readonly textPauseStyle: PauseStyle;

  /**
   * Synthesize and play the given processed content.
   */
  speak(content: string, speed?: number, filePath?: string): Promise<void>;

  /**
   * Synthesize titled parts of a note (one per markdown heading). Providers
   * that do not override this join the parts and call `speak()`.
   */
  speakNoteSections(
    sections: { title: string; text: string }[],
    speed?: number,
    filePath?: string,
  ): Promise<void>;

  /** Heading/chunk list for the note being read; empty when idle. */
  getNoteSections(): NoteSectionInfo[];
  /** Index of the section currently playing, or -1. */
  getNoteSectionIndex(): number;
  /** Jump to a synthesized section. No-op if that section is not ready. */
  playNoteSection(index: number): void;
  /** Drop the in-note playlist (e.g. when the user plays a saved chapter file). */
  clearNotePlaylist(): void;

  // Playback controls
  playAudio(speed?: number): Promise<void>;
  pauseAudio(): void;
  stopAudio(): void;
  isPlaying(): boolean;
  hasEnded(): boolean;
  rewindAudio(): void;
  fastForwardAudio(): void;

  // Skip interval (seconds) for rewind / fast-forward
  setRewindSeconds(seconds: number): void;
  setForwardSeconds(seconds: number): void;
  getRewindSeconds(): number;
  getForwardSeconds(): number;

  // Speed
  setSpeed(speed: number): number;
  getSpeed(): number;
  updatePlaybackRate(speed: number): void;

  // Voice
  setVoice(voice: string): void;
  getVoice(): string;
  getVoiceOptions(): VoiceOption[];

  // Audio element + state
  getAudio(): HTMLAudioElement;
  getDuration(): number;
  getCurrentTime(): number;
  getVolume(): number;

  // Operation lifecycle
  isOperationInProgress(): boolean;
  startOperation(): string;
  isCurrentRequest(requestId: string): boolean;
  cancelOperation(): void;
  endOperation(requestId: string): void;

  // Callbacks
  setProgressCallback(callback: (progress: number) => void): void;
  setErrorCallback(callback: (error: string) => void): void;

  /** Last reported synthesis progress (0..1). Useful for pollers like the player. */
  getProgress(): number;

  // Caching / download
  getLastGeneratedAudio(filePath?: string): Blob | null;
  clearCachedAudio(): void;
  setCachedAudio(audioBlob: Blob, filePath: string): void;

  // Credentials
  validateCredentials(): Promise<CredentialValidationResult>;
  updateCredentials(settings: VoiceSettings): void;
}
