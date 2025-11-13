import {
  PollyClient,
  SynthesizeSpeechCommand,
  DescribeVoicesCommand,
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
  private progressCallback?: (progress: number) => void;
  private errorCallback?: (error: string) => void;
  private abortController?: AbortController;
  private isLoading: boolean = false;

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

  /**
   * Validates AWS credentials by attempting to call DescribeVoices
   * @returns Promise that resolves to validation result
   */
  async validateCredentials(): Promise<{
    isValid: boolean;
    error?: string;
    voiceCount?: number;
  }> {
    try {
      const command = new DescribeVoicesCommand({
        Engine: "neural",
        IncludeAdditionalLanguageCodes: false,
      });

      const response = await this.pollyClient.send(command);

      return {
        isValid: true,
        voiceCount: response.Voices?.length || 0,
      };
    } catch (error: unknown) {
      let errorMessage = "Unknown error occurred";

      if (error && typeof error === "object" && "name" in error) {
        const awsError = error as {
          name: string;
          message?: string;
          code?: string;
        };

        if (awsError.name === "InvalidSignatureException") {
          errorMessage =
            "Invalid AWS credentials - please check your Access Key ID and Secret Access Key";
        } else if (awsError.name === "SignatureDoesNotMatchException") {
          errorMessage =
            "AWS Secret Access Key does not match the Access Key ID";
        } else if (awsError.name === "AccessDeniedException") {
          errorMessage =
            "Access denied - your AWS credentials don't have permission to use Polly";
        } else if (awsError.name === "UnrecognizedClientException") {
          errorMessage = "Invalid AWS Access Key ID format";
        } else if (
          awsError.name === "NetworkingError" ||
          awsError.code === "NetworkingError"
        ) {
          errorMessage =
            "Network error - please check your internet connection";
        } else if (awsError.name === "InvalidParameterValueException") {
          errorMessage = "Invalid AWS region specified";
        } else if (awsError.message) {
          errorMessage = awsError.message;
        }
      }

      return {
        isValid: false,
        error: errorMessage,
      };
    }
  }

  async playCachedAudio(text: string, speed?: number): Promise<void> {
    try {
      if (text == this.synthesizeInput.Text && !this.voiceChanged) {
        this.playAudio(speed);
      } else {
        this.synthesizeInput.Text = text;
        await this.callPolly(speed);
      }
      this.voiceChanged = false;
    } catch (error) {
      // Don't report error if it was an abort
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Audio loading was cancelled by user");
        return;
      }
      console.error("Error in playCachedAudio:", error);
      this.reportError(error);
      throw error; // Re-throw so calling code knows it failed
    }
  }

  async callPolly(speed?: number) {
    // Cancel any existing loading process
    if (this.isLoading) {
      this.cancelLoading();
    }

    // Create a new abort controller for this request
    this.abortController = new AbortController();
    this.isLoading = true;

    const chunkedTexts = this.chunkText(this.synthesizeInput.Text, 100);
    const audioChunks: Blob[] = [];
    const totalChunks = chunkedTexts.length;
    this.setLanguageCode(this.getLanguageCode(this.synthesizeInput.VoiceId));

    // Report initial progress
    this.reportProgress(0, totalChunks);

    try {
      for (let chunkIndex = 0; chunkIndex < chunkedTexts.length; chunkIndex++) {
        // Check if loading was cancelled
        if (this.abortController.signal.aborted) {
          throw new Error("AbortError");
        }

        const chunk = chunkedTexts[chunkIndex];
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
          const data = await this.pollyClient.send(command, {
            abortSignal: this.abortController.signal,
          });

          // Check again after async operation
          if (this.abortController.signal.aborted) {
            throw new Error("AbortError");
          }

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

              // Add intermediate progress reporting during chunk data reading
              const baseProgress = chunkIndex / totalChunks;
              const chunkProgressStep = 1 / totalChunks;

              while (true) {
                // Check if loading was cancelled
                if (this.abortController.signal.aborted) {
                  reader.cancel();
                  throw new Error("AbortError");
                }

                const { done, value } = await reader.read();
                if (done) break;

                // Create a copy of the Uint8Array to ensure proper type compatibility
                const chunk = new Uint8Array(value.length);
                chunk.set(value);
                blobParts.push(chunk);

                // Report incremental progress within this chunk
                const currentProgress = baseProgress + chunkProgressStep * 0.8; // Reserve 20% for final processing
                this.reportProgress(currentProgress * totalChunks, totalChunks);
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
                  // Check if loading was cancelled
                  if (this.abortController.signal.aborted) {
                    throw new Error("AbortError");
                  }
                  chunks.push(Buffer.from(chunk));
                }
              } else {
                // Handle regular readable stream (Node.js EventEmitter)
                const stream = audioStream as unknown as NodeJS.ReadableStream;
                stream.on("data", (chunk: Buffer) => {
                  // Check if loading was cancelled
                  if (this.abortController?.signal.aborted) {
                    if (
                      "destroy" in stream &&
                      typeof stream.destroy === "function"
                    ) {
                      stream.destroy();
                    }
                  }
                  chunks.push(Buffer.from(chunk));
                });
                await new Promise((resolve, reject) => {
                  stream.on("end", resolve);
                  stream.on("error", reject);
                  // Listen for abort signal
                  this.abortController?.signal.addEventListener("abort", () => {
                    if (
                      "destroy" in stream &&
                      typeof stream.destroy === "function"
                    ) {
                      stream.destroy();
                    }
                    reject(new Error("AbortError"));
                  });
                });
              }

              const audioBuffer = Buffer.concat(chunks);
              const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
              audioChunks.push(audioBlob);
            }
          }
        } catch (error) {
          // Check if it's an abort error
          if (
            error instanceof Error &&
            (error.name === "AbortError" || error.message === "AbortError")
          ) {
            throw error; // Re-throw to be caught by outer try-catch
          }
          console.error("Error playing the audio stream:", error);
          this.reportError(error);
          this.isLoading = false;
          return;
        }

        // Report progress after each chunk is processed
        this.reportProgress(chunkIndex + 1, totalChunks);
      }

      if (audioChunks.length > 0) {
        const concatenatedAudioBlob = new Blob(audioChunks, {
          type: "audio/mp3",
        });
        this.audio.src = URL.createObjectURL(concatenatedAudioBlob);
        this.playAudio(speed);
      }
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
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

  cancelLoading() {
    if (this.isLoading && this.abortController) {
      this.abortController.abort();
      this.isLoading = false;
      this.abortController = undefined;
      // Reset progress
      this.reportProgress(0, 1);
    }
  }

  isLoadingInProgress(): boolean {
    return this.isLoading;
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
    this.speed = speed;
    // Update playback rate in real-time if audio is currently playing
    this.updatePlaybackRate(speed);
    return this.speed;
  }

  setProgressCallback(callback: (progress: number) => void) {
    this.progressCallback = callback;
  }

  setErrorCallback(callback: (error: string) => void) {
    this.errorCallback = callback;
  }

  private reportProgress(current: number, total: number) {
    if (this.progressCallback) {
      const progress = total > 0 ? current / total : 0;
      this.progressCallback(Math.min(1, Math.max(0, progress)));
    }
  }

  private reportError(error: unknown) {
    if (this.errorCallback) {
      let errorMessage = "Network error. Please try again.";

      if (error && typeof error === "object" && "message" in error) {
        const errorObj = error as { message: string };

        if (errorObj.message.includes("NetworkingError")) {
          errorMessage = "Connection failed. Check your internet.";
        } else if (errorObj.message.includes("InvalidAccessKeyId")) {
          errorMessage = "Invalid AWS credentials.";
        } else if (errorObj.message.includes("ThrottlingException")) {
          errorMessage = "Rate limited. Please wait and try again.";
        } else if (errorObj.message.includes("TextLengthExceededException")) {
          errorMessage = "Text too long. Try shorter content.";
        } else {
          errorMessage = `AWS Error: ${errorObj.message}`;
        }
      }

      this.errorCallback(errorMessage);
    }
  }

  updatePlaybackRate(speed: number) {
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
