import { AwsPollyService } from "../src/service/AwsPollyService";
import SSMLTagger from "../src/utils/SSMLTagger";
import { TestCaseLoader, validateSSML } from "./utils/test-helpers";
import { isIntegrationMode, validateAWSCredentials } from "./mocks/polly-mock";

describe("AWS Polly Integration Tests", () => {
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

  test("Edge Cases - Special Characters & SSML Escaping", async () => {
    const testCases = await testCaseLoader.loadLanguageTests();
    const edgeCase = testCases.find((t) => t.name.includes("Edge Cases"))!;

    const pollyService = new AwsPollyService(
      awsCredentials,
      edgeCase.voice,
      1.0,
    );

    if (!isIntegrationMode()) {
      const mockPollyService = require("./mocks/polly-mock");
      (pollyService as any).pollyClient =
        mockPollyService.createTestPollyClient();
    }

    const ssmlText = new SSMLTagger().addSSMLTags(edgeCase.content);
    expect(validateSSML(ssmlText)).toBe(true);

    const startTime = Date.now();
    let audioSize = 0;

    try {
      // Patch the pollyService to capture audio size
      const originalPlayCachedAudio =
        pollyService.playCachedAudio.bind(pollyService);
      pollyService.playCachedAudio = async function (
        text: string,
        speed?: number,
      ) {
        await originalPlayCachedAudio(text, speed);
        // Access the audio element to get the audio size
        const audio = (this as any).audio as HTMLAudioElement;
        if (audio && audio.src) {
          try {
            const response = await fetch(audio.src);
            const blob = await response.blob();
            audioSize = Math.round(blob.size / 1024); // Size in KB
          } catch (e) {
            // If we can't get the size, estimate based on content length
            audioSize = Math.round(text.length / 10); // Rough estimate
          }
        }
      };

      await pollyService.playCachedAudio(edgeCase.content, 1.0);
      const duration = Date.now() - startTime;

      console.log(`    ✅ PASS: ${edgeCase.name} (${duration}ms)`);
      console.log(`       Audio: ${audioSize}KB`);
    } catch (error) {
      console.log(`    ❌ FAIL: ${edgeCase.name} - ${error}`);
      throw error;
    }
  }, 60000);

  test("Multi-Language & Code Snippets", async () => {
    const longTestCase = await testCaseLoader.loadLongDocumentTest();

    const pollyService = new AwsPollyService(
      awsCredentials,
      longTestCase.voice,
      1.0,
    );

    if (!isIntegrationMode()) {
      const mockPollyService = require("./mocks/polly-mock");
      (pollyService as any).pollyClient =
        mockPollyService.createTestPollyClient();
    }

    const ssmlText = new SSMLTagger().addSSMLTags(longTestCase.content);
    expect(validateSSML(ssmlText)).toBe(true);

    const startTime = Date.now();
    let audioSize = 0;

    try {
      // Patch the pollyService to capture audio size
      const originalPlayCachedAudio =
        pollyService.playCachedAudio.bind(pollyService);
      pollyService.playCachedAudio = async function (
        text: string,
        speed?: number,
      ) {
        await originalPlayCachedAudio(text, speed);
        // Access the audio element to get the audio size
        const audio = (this as any).audio as HTMLAudioElement;
        if (audio && audio.src) {
          try {
            const response = await fetch(audio.src);
            const blob = await response.blob();
            audioSize = Math.round(blob.size / 1024); // Size in KB
          } catch (e) {
            // If we can't get the size, estimate based on content length
            audioSize = Math.round(text.length / 8); // Rough estimate for longer text
          }
        }
      };

      await pollyService.playCachedAudio(longTestCase.content, 1.0);
      const duration = Date.now() - startTime;

      console.log(`    ✅ PASS: ${longTestCase.name} (${duration}ms)`);
      console.log(`       Audio: ${audioSize}KB`);
    } catch (error) {
      console.log(`    ❌ FAIL: ${longTestCase.name} - ${error}`);
      throw error;
    }
  }, 120000);
});
