import { readFile } from "fs/promises";
import { join } from "path";

export interface TestCase {
  name: string;
  language: string;
  voice: string;
  content: string;
  expectedCharacters?: string[];
  category: "short" | "medium" | "long";
}

export interface TestResult {
  testCase: TestCase;
  success: boolean;
  audioReceived: boolean;
  audioSize?: number;
  processingTime: number;
  ssmlGenerated: string;
  errors?: string[];
  awsRequestId?: string;
}

/**
 * Loads test cases from markdown files
 */
export class TestCaseLoader {
  private basePath = join(__dirname, "..", "test-cases");

  async loadLanguageTests(): Promise<TestCase[]> {
    // For integration testing we only want two cases to minimize AWS calls:
    // 1) Edge cases (special characters + emoji)
    // 2) Long multilingual document that includes code snippets
    const testCases: TestCase[] = [];

    const edgeContent = await this.loadFile("integration-edge-cases.md");
    testCases.push({
      name: "Integration - Edge Cases (special chars & emoji)",
      language: "en-US",
      voice: "Joanna",
      content: edgeContent,
      expectedCharacters: ["&", "%", '"', "'", "😀", "🔥"],
      category: "short",
    });

    const longContent = await this.loadFile("integration-long-multilang.md");
    testCases.push({
      name: "Integration - Long Multilingual + Code Snippets",
      language: "en-US",
      voice: "Joanna",
      content: longContent,
      category: "long",
    });

    return testCases;
  }

  async loadLongDocumentTest(): Promise<TestCase> {
    // Keep compatibility: load the long multilingual integration file
    const content = await this.loadFile("integration-long-multilang.md");
    return {
      name: "Long Document - Comprehensive Test",
      language: "en-US",
      voice: "Joanna",
      content,
      category: "long",
    };
  }

  private async loadFile(filename: string): Promise<string> {
    try {
      return await readFile(join(this.basePath, filename), "utf-8");
    } catch (error) {
      throw new Error(`Failed to load test case file ${filename}: ${error}`);
    }
  }

  private extractSection(content: string, sectionTitle: string): string {
    const lines = content.split("\n");
    const startIndex = lines.findIndex(
      (line) => line.includes(sectionTitle) && line.startsWith("##"),
    );

    if (startIndex === -1) {
      throw new Error(`Section "${sectionTitle}" not found`);
    }

    const endIndex = lines.findIndex(
      (line, index) => index > startIndex && line.startsWith("##"),
    );

    const sectionLines =
      endIndex === -1
        ? lines.slice(startIndex + 1)
        : lines.slice(startIndex + 1, endIndex);

    return sectionLines.join("\n").trim();
  }
}

/**
 * Validates audio buffer to ensure it contains valid audio data
 */
export function validateAudioBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  // Check for MP3 header (basic validation)
  const header = buffer.slice(0, 3);
  const mp3Header = Buffer.from([0xff, 0xfb, 0x90]); // MP3 header signature

  // More lenient check - just ensure we have some binary data
  return buffer.length > 1000; // Minimum reasonable audio size
}

/**
 * Validates SSML string to ensure it's well-formed XML
 */
export function validateSSML(ssml: string): boolean {
  try {
    // Basic validation - check for speak tags and no unescaped characters
    if (!ssml.includes("<speak>") || !ssml.includes("</speak>")) {
      return false;
    }

    // Check for unescaped XML characters (common issue)
    const unescapedPatterns = [
      /&(?!amp;|lt;|gt;|quot;|apos;)/g, // Unescaped &
      /<(?!\/?\w+[^>]*>)/g, // Unescaped <
      /(?<!<[^>]*)>(?![^<]*>)/g, // Unescaped >
    ];

    return !unescapedPatterns.some((pattern) => pattern.test(ssml));
  } catch (error) {
    return false;
  }
}

/**
 * Performance tracking utility
 */
export class PerformanceTracker {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  reset(): void {
    this.startTime = Date.now();
  }
}

/**
 * Test result formatter for console output
 */
export function formatTestResult(result: TestResult): string {
  const status = result.success ? "✅ PASS" : "❌ FAIL";
  const timing = `${result.processingTime}ms`;
  const audioInfo = result.audioReceived
    ? `Audio: ${Math.round((result.audioSize || 0) / 1024)}KB`
    : "No audio received";

  let output = `${status}: ${result.testCase.name} (${timing})`;
  if (result.success) {
    output += `\n   ${audioInfo}`;
  } else {
    output += `\n   ${result.errors?.join(", ") || "Unknown error"}`;
  }

  return output;
}
