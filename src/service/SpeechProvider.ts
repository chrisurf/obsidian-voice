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

/**
 * Result of validating a provider's credentials
 */
export interface CredentialValidationResult {
  isValid: boolean;
  error?: string;
  voiceCount?: number;
}

export interface SpeechProvider {
  /**
   * The kind of content this provider expects from the processing pipeline:
   * - "ssml": full SSML markup (AWS Polly)
   * - "text": plain spoken text (ElevenLabs)
   */
  readonly inputFormat: "ssml" | "text";

  /**
   * Synthesize and play the given processed content.
   */
  speak(content: string, speed?: number, filePath?: string): Promise<void>;

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

  // Caching / download
  getLastGeneratedAudio(filePath?: string): Blob | null;
  clearCachedAudio(): void;
  setCachedAudio(audioBlob: Blob, filePath: string): void;

  // Credentials
  validateCredentials(): Promise<CredentialValidationResult>;
  updateCredentials(settings: VoiceSettings): void;
}
