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
import { VOICES, type VoiceOption } from "../settings/VoiceSettings";
import type { VoiceSettings } from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";

/**
 * AwsPollyService - AWS Polly integration for text-to-speech
 *
 * Uses new MarkdownToSSMLProcessor pipeline for content processing
 * - Receives pre-processed SSML from TextSpeaker
 * - Handles chunking for AWS size limits
 * - Manages audio playback and caching (via BaseSpeechService)
 *
 * See: MARKDOWN_TO_SSML_ARCHITECTURE.md for design
 */

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

export class AwsPollyService extends BaseSpeechService {
  readonly inputFormat = "ssml" as const;

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
  // Store current credentials for provider function
  private currentCredentials: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  };
  // Flag to track if PollyClient has been initialized with valid credentials
  private pollyClientInitialized: boolean = false;

  constructor(awsConfig: AwsCredentials, voice: string, speed?: number) {
    super(voice, speed);
    this.voiceChanged = false;

    // Store credentials for provider function to reference
    this.currentCredentials = {
      accessKeyId: awsConfig.credentials.accessKeyId,
      secretAccessKey: awsConfig.credentials.secretAccessKey,
      region: awsConfig.region,
    };

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

    // Only create PollyClient if credentials are non-empty
    // This prevents AWS SDK from caching empty credential failures on fresh install
    if (this.hasValidCredentials()) {
      this.initializePollyClient();
    }
  }

  getVoiceOptions(): VoiceOption[] {
    return VOICES;
  }

  /**
   * Synthesize and play pre-generated SSML.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    await this.playSSMLAudio(content, speed, filePath);
  }

  /**
   * Check if credentials are non-empty and valid
   */
  private hasValidCredentials(): boolean {
    return (
      this.currentCredentials.accessKeyId !== "" &&
      this.currentCredentials.secretAccessKey !== "" &&
      this.currentCredentials.region !== ""
    );
  }

  /**
   * Initialize or reinitialize the PollyClient with credential provider function
   */
  private initializePollyClient(): void {
    // Use credential PROVIDER FUNCTION instead of static credentials
    // This allows credentials to be updated dynamically without restart
    this.pollyClient = new PollyClient({
      credentials: async () => {
        return {
          accessKeyId: this.currentCredentials.accessKeyId,
          secretAccessKey: this.currentCredentials.secretAccessKey,
        };
      },
      region: this.currentCredentials.region,
    });
    this.pollyClientInitialized = true;
  }

  /**
   * Validates AWS credentials by attempting to call DescribeVoices
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
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

  /**
   * Update AWS credentials from settings and reinitialize the Polly client.
   * Uses credential provider function to avoid AWS SDK credential caching issues.
   */
  updateCredentials(settings: VoiceSettings): void {
    this.currentCredentials = {
      accessKeyId: String(settings.AWS_ACCESS_KEY_ID),
      secretAccessKey: String(settings.AWS_SECRET_ACCESS_KEY),
      region: String(settings.AWS_REGION),
    };

    // Always (re)initialize the PollyClient when credentials are updated
    // This ensures a fresh client with no cached credential failures
    if (this.hasValidCredentials()) {
      this.initializePollyClient();
    }
  }

  /**
   * Play pre-generated SSML audio with automatic chunking
   */
  async playSSMLAudio(
    ssml: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    try {
      // Import chunker dynamically to avoid circular dependencies
      const { chunkSSML, validateChunks } =
        await import("../processors/pipeline/SSMLChunker");

      // Check if SSML needs chunking (AWS limit is ~3000 chars of text content)
      if (ssml.length > 2500) {
        // Chunk the SSML with conservative limit
        const chunks = chunkSSML(ssml, 2500);

        // Validate chunks
        const validation = validateChunks(chunks);
        if (!validation.isValid) {
          console.error("Chunk validation errors:", validation.errors);
          throw new Error(
            `SSML chunking failed: ${validation.errors.join(", ")}`,
          );
        }

        // Process chunks sequentially
        await this.playSSMLChunks(chunks, speed, filePath);
      } else {
        // Single chunk - use existing flow
        if (ssml === this.synthesizeInput.Text && !this.voiceChanged) {
          void this.playAudio(speed);
        } else {
          this.synthesizeInput.Text = ssml;
          await this.callPollySSML(ssml, speed, filePath);
        }
      }

      this.voiceChanged = false;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in playSSMLAudio:", error);
      this.reportError(error);
      throw error;
    }
  }

  /**
   * Play multiple SSML chunks in sequence
   */
  private async playSSMLChunks(
    chunks: Array<{ ssml: string; index: number; total: number }>,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    const audioBlobs: Blob[] = [];

    for (const chunk of chunks) {
      if (this.abortController?.signal.aborted) {
        throw new Error("AbortError");
      }

      // Synthesize this chunk
      const blob = await this.synthesizeSSMLChunk(
        chunk.ssml,
        chunk.index,
        chunk.total,
      );
      audioBlobs.push(blob);
    }

    // Concatenate all audio blobs
    const finalBlob = new Blob(audioBlobs, { type: "audio/mpeg" });
    this.lastGeneratedAudio = finalBlob; // Cache for download
    if (filePath) {
      this.lastGeneratedAudioFilePath = filePath;
    }
    this.audio.src = URL.createObjectURL(finalBlob);
    this.reportProgress(1, 1);
    void this.playAudio(speed);
  }

  /**
   * Synthesize a single SSML chunk and return the audio blob
   */
  private async synthesizeSSMLChunk(
    ssml: string,
    chunkIndex: number,
    totalChunks: number,
  ): Promise<Blob> {
    this.setLanguageCode(this.getLanguageCode(this.synthesizeInput.VoiceId));

    const input = {
      Engine: this.synthesizeInput.Engine,
      LanguageCode: this.synthesizeInput.LanguageCode,
      SampleRate: this.synthesizeInput.SampleRate,
      TextType: "ssml" as TextType,
      OutputFormat: this.synthesizeInput.OutputFormat,
      Text: ssml,
      VoiceId: this.synthesizeInput.VoiceId,
    };

    const command = new SynthesizeSpeechCommand(input);
    const data = await this.pollyClient.send(command, {
      abortSignal: this.abortController?.signal,
    });

    if (!data || !data.AudioStream) {
      throw new Error("Invalid response from Polly");
    }

    // Read stream to blob
    const audioStream = data.AudioStream;
    if (
      typeof audioStream === "object" &&
      audioStream !== null &&
      "getReader" in audioStream
    ) {
      const readableStream = audioStream as ReadableStream<Uint8Array>;
      const reader = readableStream.getReader();
      const blobParts: BlobPart[] = [];

      const baseProgress = chunkIndex / totalChunks;
      const chunkProgress = 1 / totalChunks;

      while (true) {
        if (this.abortController?.signal.aborted) {
          void reader.cancel();
          throw new Error("AbortError");
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new Uint8Array(value.length);
        chunk.set(value);
        blobParts.push(chunk);

        // Report incremental progress for this chunk
        const progress = baseProgress + chunkProgress * 0.9; // Reserve 10% for concatenation
        this.reportProgress(progress, 1);
      }

      return new Blob(blobParts, { type: "audio/mpeg" });
    }

    // Handle Node.js streams (for testing)
    if (Symbol.asyncIterator in audioStream) {
      const chunks: Buffer[] = [];
      const asyncIterable = audioStream as AsyncIterable<Buffer>;
      for await (const chunk of asyncIterable) {
        if (this.abortController?.signal.aborted) {
          throw new Error("AbortError");
        }
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      return new Blob([audioBuffer], { type: "audio/mpeg" });
    }

    throw new Error("Unsupported audio stream format");
  }

  /**
   * Call Polly with pre-generated SSML (no chunking, SSML is already prepared)
   */
  private async callPollySSML(
    ssml: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    // Guard: Prevent concurrent AWS calls
    if (this.isLoading) {
      throw new Error(
        "AWS Polly call already in progress. This should not happen if startOperation() guard is working.",
      );
    }

    this.isLoading = true;

    try {
      this.setLanguageCode(this.getLanguageCode(this.synthesizeInput.VoiceId));
      this.reportProgress(0, 1);

      const input = {
        Engine: this.synthesizeInput.Engine,
        LanguageCode: this.synthesizeInput.LanguageCode,
        SampleRate: this.synthesizeInput.SampleRate,
        TextType: "ssml" as TextType,
        OutputFormat: this.synthesizeInput.OutputFormat,
        Text: ssml,
        VoiceId: this.synthesizeInput.VoiceId,
      };

      const command = new SynthesizeSpeechCommand(input);
      const data = await this.pollyClient.send(command, {
        abortSignal: this.abortController?.signal,
      });

      if (this.abortController?.signal.aborted) {
        throw new Error("AbortError");
      }

      if (!data || !data.AudioStream) {
        throw new Error("Invalid response from Polly");
      }

      // Handle audio stream with progress reporting
      const audioStream = data.AudioStream;

      if (typeof audioStream === "object" && audioStream !== null) {
        if ("getReader" in audioStream) {
          const readableStream = audioStream as ReadableStream<Uint8Array>;
          const reader = readableStream.getReader();
          const blobParts: BlobPart[] = [];

          // Track progress during stream reading
          let bytesReceived = 0;
          let progressReported = 0;

          while (true) {
            if (this.abortController?.signal.aborted) {
              void reader.cancel();
              throw new Error("AbortError");
            }

            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new Uint8Array(value.length);
            chunk.set(value);
            blobParts.push(chunk);

            // Update progress incrementally
            bytesReceived += value.length;

            // Report progress every ~10% or 50KB to avoid too many updates
            const newProgress = Math.min(0.95, bytesReceived / 500000); // Estimate 500KB total
            if (newProgress - progressReported > 0.1) {
              this.reportProgress(newProgress, 1);
              progressReported = newProgress;
            }
          }

          const audioBlob = new Blob(blobParts, { type: "audio/mpeg" });
          this.lastGeneratedAudio = audioBlob; // Cache for download
          if (filePath) {
            this.lastGeneratedAudioFilePath = filePath;
          }
          this.audio.src = URL.createObjectURL(audioBlob);
          this.reportProgress(1, 1);
          void this.playAudio(speed);
        }
      }
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  /**
   * Map AWS errors to user-friendly messages.
   */
  protected getErrorMessage(error: unknown): string {
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

    return errorMessage;
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

  setVoice(voice: string): void {
    super.setVoice(voice);
    this.synthesizeInput.VoiceId = voice as VoiceId;
    this.synthesizeInput.LanguageCode = this.getLanguageCode(
      voice,
    ) as LanguageCode;
    this.voiceChanged = true;
  }

  setLanguageCode(language: string) {
    this.synthesizeInput.LanguageCode = language as LanguageCode;
    this.voiceChanged = true;
  }

  getLanguageCode(voice: string) {
    const voiceOption = VOICES.find((v) => v.id === voice);
    return voiceOption ? voiceOption.lang : "en-US";
  }

  getContent() {
    return this.synthesizeInput.Text;
  }
}
