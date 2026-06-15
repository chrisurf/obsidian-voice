import * as fs from "fs";
import * as path from "path";

/**
 * Minimal .env loader (replaces the dotenv dependency for tests).
 * Mirrors dotenv's default behavior: parse KEY=VALUE lines, ignore comments
 * and blanks, strip surrounding quotes, and do NOT override variables that are
 * already set in the environment.
 */
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Load test environment variables first, then any default .env
loadEnvFile(path.join(__dirname, "..", ".env.test"));
loadEnvFile(path.join(__dirname, "..", ".env"));

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

// Mock object URL helpers used when wiring audio blobs to the audio element
if (!(global as any).URL.createObjectURL) {
  (global as any).URL.createObjectURL = jest.fn(() => "blob:mock");
}
if (!(global as any).URL.revokeObjectURL) {
  (global as any).URL.revokeObjectURL = jest.fn();
}

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
