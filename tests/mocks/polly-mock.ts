import {
  SynthesizeSpeechCommand,
  SynthesizeSpeechCommandOutput,
} from "@aws-sdk/client-polly";

/**
 * Mock implementation of AWS Polly for unit testing
 * Simulates successful and error responses without making actual AWS calls
 */
export class MockPollyClient {
  private shouldFail: boolean = false;
  private failureType: "network" | "ssml" | "quota" = "ssml";

  /**
   * Configure the mock to simulate failures
   */
  setFailureMode(
    enabled: boolean,
    type: "network" | "ssml" | "quota" = "ssml",
  ) {
    this.shouldFail = enabled;
    this.failureType = type;
  }

  /**
   * Mock implementation of the send method
   */
  async send(
    command: SynthesizeSpeechCommand,
  ): Promise<SynthesizeSpeechCommandOutput> {
    // Simulate processing delay
    await new Promise((resolve) =>
      setTimeout(resolve, 100 + Math.random() * 200),
    );

    if (this.shouldFail) {
      throw this.createMockError();
    }

    const input = command.input;

    // Validate SSML-like structure for testing
    if (input.TextType === "ssml" && input.Text) {
      if (!input.Text.includes("<speak>") || !input.Text.includes("</speak>")) {
        throw new Error("InvalidSsmlException: SSML must contain speak tags");
      }

      // Check for common SSML errors
      if (input.Text.includes("&") && !input.Text.includes("&amp;")) {
        throw new Error(
          "InvalidSsmlException: Invalid SSML request - unescaped ampersand",
        );
      }
    }

    // Generate mock audio data
    const audioSize = this.calculateMockAudioSize(input.Text || "");
    const mockAudioBuffer = Buffer.alloc(audioSize, 0);

    // Add MP3-like header to make it look realistic
    mockAudioBuffer[0] = 0xff;
    mockAudioBuffer[1] = 0xfb;
    mockAudioBuffer[2] = 0x90;

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(mockAudioBuffer);
        controller.close();
      },
    });

    return {
      AudioStream: mockStream as any, // Type assertion for mock
      ContentType: "audio/mpeg",
      RequestCharacters: input.Text?.length || 0,
      $metadata: {
        httpStatusCode: 200,
        requestId: `mock-request-${Date.now()}`,
        cfId: undefined,
        extendedRequestId: undefined,
        attempts: 1,
        totalRetryDelay: 0,
      },
    };
  }

  private createMockError(): Error {
    switch (this.failureType) {
      case "network":
        const networkError = new Error("Network error");
        (networkError as any).$metadata = { httpStatusCode: 500 };
        return networkError;

      case "ssml":
        const ssmlError = new Error(
          "InvalidSsmlException: Invalid SSML request",
        );
        (ssmlError as any).$metadata = { httpStatusCode: 400 };
        return ssmlError;

      case "quota":
        const quotaError = new Error("ThrottlingException: Rate exceeded");
        (quotaError as any).$metadata = { httpStatusCode: 429 };
        return quotaError;

      default:
        return new Error("Unknown error");
    }
  }

  private calculateMockAudioSize(text: string): number {
    // Rough estimation: 1000 bytes per 10 characters of text
    const baseSize = Math.ceil(text.length / 10) * 1000;
    const variation = Math.random() * 500; // Add some realistic variation
    return Math.max(1000, baseSize + variation);
  }
}

/**
 * Factory function to create appropriate client based on test mode
 */
export function createTestPollyClient() {
  const testMode = process.env.POLLY_TEST_MODE || "mock";

  if (testMode === "integration") {
    // Return real PollyClient for integration tests
    const { PollyClient } = require("@aws-sdk/client-polly");
    return new PollyClient({
      region: process.env.AWS_REGION || "eu-central-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  return new MockPollyClient();
}

/**
 * Helper to check if we're running in integration mode
 */
export function isIntegrationMode(): boolean {
  return process.env.POLLY_TEST_MODE === "integration";
}

/**
 * Helper to validate AWS credentials are available for integration tests
 */
export function validateAWSCredentials(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION
  );
}
