import * as dotenv from "dotenv";
import * as path from "path";

// Load test environment variables first
const testEnvPath = path.join(__dirname, "..", ".env.test");
dotenv.config({ path: testEnvPath });

// Also load default .env if it exists
dotenv.config();

// Set up test environment
process.env.NODE_ENV = "test";

// Mock browser APIs not available in Node.js
class MockAudio {
  src: string = "";
  paused: boolean = true;
  ended: boolean = false;
  currentTime: number = 0;
  playbackRate: number = 1;

  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  addEventListener() {}
  removeEventListener() {}
}

// Make Audio available globally for tests
(global as any).Audio = MockAudio;

// Global test timeout
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  console.log("🧪 Starting Voice Plugin Test Suite");
  console.log(`Test Mode: ${process.env.POLLY_TEST_MODE || "mock"}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || "eu-central-1"}`);
  console.log(
    `AWS Access Key: ${process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 8) + "..." : "not set"}`,
  );
});

afterAll(async () => {
  console.log("✅ Test Suite Complete");
});
