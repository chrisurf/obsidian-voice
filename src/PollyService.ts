import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { Readable } from "stream";

interface AwsCredentials {
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  region: string;
}

interface SynthesizeInput {
  Engine?: string;
  LanguageCode?: string;
  SampleRate?: string;
  TextType?: string;
  OutputFormat?: string;
  VoiceId?: string;
  Text: string;
}

export class PollyService {
  private audio: HTMLAudioElement;
  private synthesizeInput: {
    Engine: string | "neural";
    LanguageCode: string | "en-US";
    SampleRate: string | "24000";
    TextType: string | "text";
    OutputFormat: string | "mp3";
    VoiceId: string | "Joanna";
    Text: string;
  };
  private pollyClient: PollyClient;
  private voiceChanged: boolean;

  constructor(awsConfig: AwsCredentials, voice: string) {
    this.audio = new Audio();
    this.audio.src = "";
    this.voiceChanged = true;
    this.synthesizeInput = {
      Engine: "neural",
      LanguageCode: "en-US" || "en-GB",
      SampleRate: "24000",
      TextType: "text",
      OutputFormat: "mp3",
      VoiceId: voice || "Joanna",
      Text: "No document selected.",
    };
    this.pollyClient = new PollyClient({
      credentials: {
        accessKeyId: awsConfig.credentials.accessKeyId,
        secretAccessKey: awsConfig.credentials.secretAccessKey,
      },
      region: awsConfig.region,
    });
  }

  smartPolly(text: string) {
    if (text === this.synthesizeInput.Text && !this.voiceChanged) {
      this.playAudio();
    } else {
      this.synthesizeInput.Text = text;
      this.voiceChanged = false;

      this.callPolly();
    }
  }

  async callPolly() {
    const chunkedTexts = this.chunkText(this.synthesizeInput.Text, 100);
    const audioChunks: Blob[] = [];

    for (const chunk of chunkedTexts) {
      const input = {
        Engine: this.synthesizeInput.Engine,
        LanguageCode: this.synthesizeInput.LanguageCode,
        SampleRate: this.synthesizeInput.SampleRate,
        TextType: this.synthesizeInput.TextType,
        OutputFormat: this.synthesizeInput.OutputFormat,
        Text: chunk,
        VoiceId: this.synthesizeInput.VoiceId,
      };

      const command = new SynthesizeSpeechCommand(input);

      try {
        const data = await this.pollyClient.send(command);
        if (!data || !data.AudioStream) {
          throw new Error("Invalid response from Polly");
        }

        const audioBlob = await this.convertToBlob(data.AudioStream);
        audioChunks.push(audioBlob);
      } catch (error) {
        console.error("Error playing the audio stream:", error);
        return;
      }
    }

    if (audioChunks.length > 0) {
      const concatenatedAudioBlob = new Blob(audioChunks, {
        type: "audio/mp3",
      });
      this.audio.src = URL.createObjectURL(concatenatedAudioBlob);
      this.playAudio();
    }
  }

  async playAudio() {
    this.audio.play();
  }

  pauseAudio() {
    this.audio.pause();
  }

  stopAudio() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  setSynthesizeInput(synthesizeInput: SynthesizeInput) {
    this.synthesizeInput = {
      ...this.synthesizeInput,
      ...synthesizeInput,
    };
  }

  setAudio(text: string) {
    this.synthesizeInput.Text = text;
  }

  setVoice(voice: string) {
    this.synthesizeInput.VoiceId = voice;
    this.voiceChanged = true;
  }

  isPlaying() {
    return !this.audio.paused;
  }

  hasEnded() {
    return this.audio.ended;
  }

  getContent() {
    return this.synthesizeInput.Text;
  }

  getVoice() {
    return this.synthesizeInput.VoiceId;
  }

  getAudio() {
    return this.audio;
  }

  getDuration() {
    return this.audio.duration;
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getVolume() {
    return this.audio.volume;
  }

  private chunkText(text: string, chunkSize: number): string[] {
    const words: string[] = text.split(" ");
    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < words.length) {
      const chunk = words.slice(startIndex, startIndex + chunkSize).join(" ");
      chunks.push(chunk);
      startIndex += chunkSize;
    }

    return chunks;
  }

  private async convertToBlob(
    audioStream: Blob | Readable | ReadableStream<Uint8Array>
  ) {
    const readableStream = audioStream as ReadableStream<Uint8Array>;

    const reader = readableStream.getReader();
    const blobParts: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      blobParts.push(value);
      totalLength += value.length;
    }

    const audioBlob = new Blob(blobParts, {
      type: "audio/mp3",
    });

    return audioBlob;
  }
}
