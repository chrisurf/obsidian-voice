import { Voice } from "../utils/VoicePlugin";

export class HotkeySettings {
  private voice: Voice;

  constructor(voice: Voice) {
    this.voice = voice;
  }

  public initHotkeys(): void {
    this.voice.addCommand({
      id: "play-audio",
      name: "Start reading the current document.",
      callback: () => this.voice.speakText(),
    });

    this.voice.addCommand({
      id: "pause-audio",
      name: "Pause reading the current document.",
      callback: () => this.voice.getSpeechProvider().pauseAudio(),
    });

    this.voice.addCommand({
      id: "stop-audio",
      name: "Stop reading the current document.",
      callback: () => this.voice.getSpeechProvider().stopAudio(),
    });

    this.voice.addCommand({
      id: "rewind-audio",
      name: "Rewind by few seconds reading the current document.",
      callback: () => this.voice.getSpeechProvider().rewindAudio(),
    });

    this.voice.addCommand({
      id: "fast-forward-audio",
      name: "Fast-Forward by few seconds reading the current document.",
      callback: () => this.voice.getSpeechProvider().fastForwardAudio(),
    });

    this.voice.addCommand({
      id: "play-or-stop-audio",
      name: "Play or Stop reading the current document.",
      callback: () => this.voice.speakText(),
    });

    this.voice.addCommand({
      id: "play-115",
      name: "Reading tempo increased by 15% for a faster pace of the current document.",
      callback: () => this.voice.speakText(1.15),
    });

    this.voice.addCommand({
      id: "play-125",
      name: "Reading tempo increased by 25% for a faster pace of the current document.",
      callback: () => this.voice.speakText(1.25),
    });

    this.voice.addCommand({
      id: "play-085",
      name: "Reading tempo reduced by 15% for a slower pace of the current document.",
      callback: () => this.voice.speakText(0.85),
    });

    this.voice.addCommand({
      id: "play-075",
      name: "Reading tempo reduced by 25% for a slower pace of the current document.",
      callback: () => this.voice.speakText(0.75),
    });
  }
}
