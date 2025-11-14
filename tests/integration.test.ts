import { AwsPollyService } from "../src/service/AwsPollyService";
import {
  chunkSSML,
  validateChunks,
} from "../src/processors/pipeline/SSMLChunker";
import { TestCaseLoader, validateSSML } from "./utils/test-helpers";
import { isIntegrationMode, validateAWSCredentials } from "./mocks/polly-mock";

describe("Integration Tests - AWS Polly with Chunking", () => {
  let testCaseLoader: TestCaseLoader;
  let awsCredentials: any;

  beforeAll(async () => {
    testCaseLoader = new TestCaseLoader();

    if (isIntegrationMode()) {
      if (!validateAWSCredentials()) {
        throw new Error(
          "AWS credentials required for integration tests. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION",
        );
      }

      awsCredentials = {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
        region: process.env.AWS_REGION || "eu-central-1",
      };

      console.log("🔗 Running integration tests with real AWS Polly");
    } else {
      awsCredentials = {
        credentials: {
          accessKeyId: "mock-key",
          secretAccessKey: "mock-secret",
        },
        region: "eu-central-1",
      };
      console.log("🎭 Running tests with mocked AWS Polly");
    }
  });

  test("SSML Chunking - Small Content (No Chunking Required)", () => {
    const smallSSML =
      "<speak>This is a short test message with &amp; symbols.</speak>";

    const chunks = chunkSSML(smallSSML, 2500);
    const validation = validateChunks(chunks);

    expect(validation.isValid).toBe(true);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ssml).toContain("short test message");

    console.log(
      `    ✅ PASS: Small content (1 chunk, ${smallSSML.length} chars)`,
    );
  });

  test("SSML Chunking - Large Content (Chunking Required)", () => {
    // Create large SSML content that exceeds 2500 chars
    // Use complete paragraph blocks that are easy to split
    const paragraph =
      '<p>This is a complete paragraph with some content that makes sense.</p><break time="500ms"/>';
    const largeContent = paragraph.repeat(30); // ~3000 chars
    const largeSSML = `<speak>${largeContent}</speak>`;

    const chunks = chunkSSML(largeSSML, 2500);
    const validation = validateChunks(chunks);

    // Debug validation errors if any
    if (!validation.isValid) {
      console.log("Validation errors:", validation.errors);
    }

    expect(validation.isValid).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);

    // Verify each chunk is valid and under limit
    chunks.forEach((chunk, index) => {
      expect(validateSSML(chunk.ssml)).toBe(true);
      expect(chunk.ssml.length).toBeLessThan(3000); // Under AWS text content limit
      expect(chunk.index).toBe(index);
      expect(chunk.total).toBe(chunks.length);
    });

    console.log(
      `    ✅ PASS: Large content (${chunks.length} chunks, ${largeSSML.length} chars total)`,
    );
    console.log(
      `       Average chunk size: ${Math.round(largeSSML.length / chunks.length)} chars`,
    );
  });

  test("AWS Polly - Play Simple SSML", async () => {
    const pollyService = new AwsPollyService(awsCredentials, "Matthew", 1.0);

    if (!isIntegrationMode()) {
      const mockPollyService = require("./mocks/polly-mock");
      (pollyService as any).pollyClient =
        mockPollyService.createTestPollyClient();
    }

    const simpleSSML =
      "<speak>Hello world, this is a test &amp; verification.</speak>";
    expect(validateSSML(simpleSSML)).toBe(true);

    const startTime = Date.now();
    let audioSize = 0;

    try {
      await pollyService.playSSMLAudio(simpleSSML, 1.0);
      const duration = Date.now() - startTime;

      // Get audio size from the audio element
      const audio = (pollyService as any).audio as HTMLAudioElement;
      if (audio && audio.src) {
        try {
          const response = await fetch(audio.src);
          const blob = await response.blob();
          audioSize = Math.round(blob.size / 1024); // Size in KB
        } catch (e) {
          audioSize = Math.round(simpleSSML.length / 10); // Estimate
        }
      }

      console.log(`    ✅ PASS: Simple SSML playback (${duration}ms)`);
      console.log(`       📥 Audio downloaded: ${audioSize} KB`);
    } catch (error) {
      console.log(`    ❌ FAIL: Simple SSML playback - ${error}`);
      throw error;
    }
  }, 60000);

  test("AWS Polly - Play Large SSML with Auto-Chunking", async () => {
    const pollyService = new AwsPollyService(awsCredentials, "Matthew", 1.0);

    if (!isIntegrationMode()) {
      const mockPollyService = require("./mocks/polly-mock");
      (pollyService as any).pollyClient =
        mockPollyService.createTestPollyClient();
    }

    // Create large SSML that requires chunking (simulating Smart-Technology-Era.md)
    const paragraphContent =
      '<p>The Smart Technology Era refers to a period characterized by widespread integration and utilization of advanced technologies in various aspects of our lives. It represents a time of rapid technological advancements, connectivity, and automation, reshaping industries, societies, and individual experiences.</p><break time="500ms"/>';
    const largeDocument = `
      <speak>
        <p><prosody volume="loud">Smart Technology Era</prosody></p>
        <break time="800ms"/>
        ${Array(50).fill(paragraphContent).join("")}
      </speak>
    `;

    expect(largeDocument.length).toBeGreaterThan(2500);
    expect(validateSSML(largeDocument)).toBe(true);

    const chunks = chunkSSML(largeDocument, 2500);
    console.log(`    📦 Document size: ${largeDocument.length} chars`);
    console.log(`    📦 Chunks created: ${chunks.length}`);

    const startTime = Date.now();
    let audioSize = 0;

    try {
      await pollyService.playSSMLAudio(largeDocument, 1.0);
      const duration = Date.now() - startTime;

      // Get audio size from the concatenated audio
      const audio = (pollyService as any).audio as HTMLAudioElement;
      if (audio && audio.src) {
        try {
          const response = await fetch(audio.src);
          const blob = await response.blob();
          audioSize = Math.round(blob.size / 1024); // Size in KB
        } catch (e) {
          audioSize = Math.round(largeDocument.length / 8); // Estimate
        }
      }

      console.log(`    ✅ PASS: Large SSML with auto-chunking (${duration}ms)`);
      console.log(`       📥 Audio downloaded: ${audioSize} KB`);
      console.log(`       ✓ No TextLengthExceededException thrown`);
      console.log(`       ✓ Successfully processed ${chunks.length} chunks`);
    } catch (error) {
      console.log(`    ❌ FAIL: Large SSML playback - ${error}`);
      if (
        error instanceof Error &&
        error.message.includes("TextLengthExceeded")
      ) {
        console.log(`       ⚠️  Chunking failed to prevent AWS error!`);
      }
      throw error;
    }
  }, 180000);
});
