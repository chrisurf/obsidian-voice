import {
  PollyClient,
  SynthesizeSpeechCommand,
  Engine,
  LanguageCode,
  TextType,
  OutputFormat,
  VoiceId,
} from "@aws-sdk/client-polly";
import SSMLTagger from "../utils/SSMLTagger";

interface AwsCredentials {
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  region: string;
}

interface SynthesizeInput {
  Engine?: Engine;
  LanguageCode?: LanguageCode;
  SampleRate?: string;
  TextType?: TextType;
  OutputFormat?: OutputFormat;
  VoiceId?: VoiceId;
  Text: string;
}

export class AwsPollyService {
  private audio: HTMLAudioElement;
  private speed: number;
  private synthesizeInput: {
    Engine: Engine;
    LanguageCode: LanguageCode;
    SampleRate: string;
    TextType: TextType;
    OutputFormat: OutputFormat;
    VoiceId: VoiceId;
    Text: string;
  };
  private pollyClient: PollyClient;
  private voiceChanged: boolean;

  constructor(awsConfig: AwsCredentials, voice: string, speed?: number) {
    this.speed = speed || 1.0;
    this.audio = new Audio();
    this.audio.src = "";
    this.voiceChanged = false;

    // Use standard engine for better compatibility in tests
    const engine = process.env.NODE_ENV === "test" ? "standard" : "neural";

    this.synthesizeInput = {
      Engine: engine as Engine,
      SampleRate: "24000",
      TextType: "text" as TextType,
      OutputFormat: "mp3" as OutputFormat,
      LanguageCode: this.getLanguageCode(voice) as LanguageCode,
      VoiceId: (voice || "Stephen") as VoiceId,
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

  async playCachedAudio(text: string, speed?: number): Promise<void> {
    if (text == this.synthesizeInput.Text && !this.voiceChanged) {
      this.playAudio(speed);
    } else {
      this.synthesizeInput.Text = text;
      await this.callPolly(speed);
    }
    this.voiceChanged = false;
  }

  async callPolly(speed?: number) {
    const chunkedTexts = this.chunkText(this.synthesizeInput.Text, 100);
    const audioChunks: Blob[] = [];
    this.setLanguageCode(this.getLanguageCode(this.synthesizeInput.VoiceId));

    for (const chunk of chunkedTexts) {
      const ssmlTagger = new SSMLTagger();
      const ssmlText = ssmlTagger.addSSMLTags(chunk);
      const input = {
        Engine: this.synthesizeInput.Engine,
        LanguageCode: this.synthesizeInput.LanguageCode,
        SampleRate: this.synthesizeInput.SampleRate,
        TextType: "ssml" as TextType,
        OutputFormat: this.synthesizeInput.OutputFormat,
        Text: ssmlText,
        VoiceId: this.synthesizeInput.VoiceId,
      };

      const command = new SynthesizeSpeechCommand(input);

      try {
        const data = await this.pollyClient.send(command);
        if (!data || !data.AudioStream) {
          throw new Error("Invalid response from Polly");
        }

        // Handle both Node.js and browser stream types
        const audioStream = data.AudioStream;

        // Check if it's a Node.js readable stream or browser ReadableStream
        if (typeof audioStream === "object" && audioStream !== null) {
          if ("getReader" in audioStream) {
            // Browser ReadableStream
            const readableStream = audioStream as ReadableStream<Uint8Array>;
            const reader = readableStream.getReader();
            const blobParts: BlobPart[] = [];

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // Create a copy of the Uint8Array to ensure proper type compatibility
              const chunk = new Uint8Array(value.length);
              chunk.set(value);
              blobParts.push(chunk);
            }

            const audioBlob = new Blob(blobParts, { type: "audio/mpeg" });
            audioChunks.push(audioBlob);
          } else {
            // Node.js stream (for testing)
            const chunks: Buffer[] = [];

            if (Symbol.asyncIterator in audioStream) {
              // Handle async iterable (Node.js readable stream)
              const asyncIterable = audioStream as AsyncIterable<Buffer>;
              for await (const chunk of asyncIterable) {
                chunks.push(Buffer.from(chunk));
              }
            } else {
              // Handle regular readable stream (Node.js EventEmitter)
              const stream = audioStream as unknown as NodeJS.ReadableStream;
              stream.on("data", (chunk: Buffer) =>
                chunks.push(Buffer.from(chunk)),
              );
              await new Promise((resolve, reject) => {
                stream.on("end", resolve);
                stream.on("error", reject);
              });
            }

            const audioBuffer = Buffer.concat(chunks);
            const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
            audioChunks.push(audioBlob);
          }
        }
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
      this.playAudio(speed);
    }
  }

  async playAudio(speed?: number) {
    let fSpeed =
      typeof speed === "number" ? parseFloat(speed.toFixed(2)) : this.speed;

    if (fSpeed < 0.5) {
      fSpeed = 0.5;
    } else if (fSpeed > 2) {
      fSpeed = 2;
    }

    this.audio.playbackRate = fSpeed;

    this.audio.play();
  }

  pauseAudio() {
    this.audio.pause();
  }

  stopAudio() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  rewindAudio() {
    if (this.audio && !isNaN(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, this.audio.currentTime - 3);
    }
  }

  fastForwardAudio() {
    if (this.audio && !isNaN(this.audio.duration)) {
      this.audio.currentTime = Math.min(
        this.audio.duration,
        this.audio.currentTime + 3,
      );
    }
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

  setSpeed(speed: number) {
    return (this.speed = speed);
  }

  setVoice(voice: string) {
    this.synthesizeInput.VoiceId = voice as VoiceId;
    this.voiceChanged = true;
  }

  setLanguageCode(language: string) {
    this.synthesizeInput.LanguageCode = language as LanguageCode;
    this.voiceChanged = true;
  }

  isPlaying() {
    return !this.audio.paused;
  }

  hasEnded() {
    return this.audio.ended;
  }

  getLanguageCode(voice: string) {
    switch (voice) {
      case "Brian":
        return "en-GB";
      case "Emma":
        return "en-GB";
      case "Daniel":
        return "de-DE";
      case "Vicki":
        return "de-DE";
      case "Remi":
        return "fr-FR";
      case "Lea":
        return "fr-FR";
      case "Sergio":
        return "es-ES";
      case "Lucia":
        return "es-ES";
      case "Adriano":
        return "it-IT";
      case "Bianca":
        return "it-IT";
      case "Ola":
        return "pl-PL";
      case "Laura":
        return "nl-NL";
      case "Ines":
        return "pt-PT";
      case "Arlet":
        return "ca-ES";
      case "Elin":
        return "sv-SE";
      case "Sofie":
        return "da-DK";
      case "Ida":
        return "nb-NO";
      case "Suvi":
        return "fi-FI";
      case "Takumi":
        return "ja-JP";
      case "Tomoko":
        return "ja-JP";
      case "Kajal":
        return "hi-IN";
      case "Seoyeon":
        return "ko-KR";
      case "Zhiyu":
        return "cmn-CN";
      default:
        return "en-US";
    }
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

  getSpeed() {
    return this.speed;
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
}
