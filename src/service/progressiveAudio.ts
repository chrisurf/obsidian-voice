/**
 * Plays MP3 audio while it is still being synthesized.
 *
 * Wraps a MediaSource on the provider's audio element: each finished chunk's
 * frames are appended in sequence, so playback, seeking and speed work on one
 * growing timeline. iPhone only has ManagedMediaSource (iOS 17.1+), which also
 * requires remote playback (AirPlay) to be off for the element. WAV is not
 * supported by MediaSource on any platform; callers fall back to playing the
 * finished file.
 */

type MediaSourceCtor = {
  new (): MediaSource;
  isTypeSupported(type: string): boolean;
};

const MP3_TYPE = "audio/mpeg";

function mediaSourceCtor(): MediaSourceCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as unknown as {
    ManagedMediaSource?: MediaSourceCtor;
    MediaSource?: MediaSourceCtor;
  };
  return w.ManagedMediaSource ?? w.MediaSource ?? null;
}

/** Whether this platform can play MP3 while it is still being generated. */
export function canPlayWhileGenerating(): boolean {
  try {
    return mediaSourceCtor()?.isTypeSupported(MP3_TYPE) ?? false;
  } catch {
    return false;
  }
}

export class ProgressiveAudio {
  private readonly source: MediaSource;
  private readonly url: string;
  private readonly opened: Promise<void>;
  private buffer: SourceBuffer | null = null;
  private closed = false;
  /** Playback ran out of audio at least once while generating. */
  stalled = false;

  constructor(private readonly audio: HTMLAudioElement) {
    const Ctor = mediaSourceCtor();
    if (!Ctor) {
      throw new Error("MediaSource is not available");
    }
    this.source = new Ctor();
    this.opened = new Promise((resolve) =>
      this.source.addEventListener("sourceopen", () => resolve(), {
        once: true,
      }),
    );
    audio.disableRemotePlayback = true;
    this.url = URL.createObjectURL(this.source);
    audio.src = this.url;
    audio.addEventListener("waiting", this.onWaiting);
  }

  /** Append one chunk's MP3 frames to the playing timeline. */
  async append(bytes: Uint8Array): Promise<void> {
    await this.opened;
    if (this.closed) {
      return;
    }
    if (!this.buffer) {
      this.buffer = this.source.addSourceBuffer(MP3_TYPE);
      // Each chunk starts at 0 on its own; "sequence" places it after the last.
      this.buffer.mode = "sequence";
    }
    const buffer = this.buffer;
    if (this.ranDry(buffer)) {
      this.stalled = true;
    }
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("Could not buffer the audio"));
      };
      const cleanup = () => {
        buffer.removeEventListener("updateend", done);
        buffer.removeEventListener("error", fail);
      };
      buffer.addEventListener("updateend", done);
      buffer.addEventListener("error", fail);
      buffer.appendBuffer(bytes as Uint8Array<ArrayBuffer>);
    });
  }

  /** All audio is appended: the timeline ends after the last chunk. */
  finish(): void {
    if (!this.closed && this.source.readyState === "open") {
      this.source.endOfStream();
    }
    this.dispose();
  }

  /** Stop listening; the element keeps whatever was appended. */
  dispose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.audio.removeEventListener("waiting", this.onWaiting);
    URL.revokeObjectURL(this.url);
  }

  /** Playback has reached the end of what is buffered and waits for more. */
  private ranDry(buffer: SourceBuffer): boolean {
    const ranges = buffer.buffered;
    if (this.audio.paused || this.audio.currentTime <= 0 || !ranges.length) {
      return false;
    }
    return ranges.end(ranges.length - 1) - this.audio.currentTime < 0.3;
  }

  private onWaiting = (): void => {
    // Seeking also waits for data; only running dry while playing counts.
    if (!this.audio.seeking && !this.audio.paused) {
      this.stalled = true;
    }
  };
}
