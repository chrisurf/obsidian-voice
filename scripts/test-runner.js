#!/usr/bin/env node

/**
 * Voice Plugin Test Runner
 *
 * Usage:
 *   npm run test                    # Run all tests (unit + integration with mocks)
 *   npm run test:unit               # Run only unit tests
 *   npm run test:integration        # Run integration tests with mocks
 *   POLLY_TEST_MODE=integration npm run test  # Run with real AWS calls
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvironment() {
  const testMode = process.env.POLLY_TEST_MODE || "mock";

  log(`🧪 Voice Plugin Test Suite`, "bold");
  log(`Test Mode: ${testMode}`, "blue");

  if (testMode === "integration") {
    const requiredVars = [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_REGION",
    ];
    const missing = requiredVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      log(
        `❌ Missing required environment variables for integration tests:`,
        "red",
      );
      missing.forEach((varName) => log(`   - ${varName}`, "red"));
      log(`\nSet these variables or run in mock mode (default)`, "yellow");
      process.exit(1);
    }

    log(`🔗 Running with real AWS Polly integration`, "green");
    log(`⚠️  This will incur AWS charges`, "yellow");
  } else {
    log(`🎭 Running with mocked AWS Polly`, "green");
  }
}

function ensureTestFiles() {
  const testCasesDir = path.join(__dirname, "tests", "test-cases");
  const requiredFiles = [
    "english-samples.md",
    "german-samples.md",
    "french-samples.md",
    "italian-samples.md",
    "long-document.md",
  ];

  const missing = requiredFiles.filter(
    (file) => !fs.existsSync(path.join(testCasesDir, file)),
  );

  if (missing.length > 0) {
    log(`❌ Missing test case files:`, "red");
    missing.forEach((file) => log(`   - ${file}`, "red"));
    process.exit(1);
  }

  log(`✅ All test case files found`, "green");
}

function runTests() {
  try {
    checkEnvironment();
    ensureTestFiles();

    log(`\n🚀 Starting test execution...\n`, "bold");

    // Run Jest with appropriate configuration
    const jestCommand = "jest --verbose --coverage --detectOpenHandles";
    execSync(jestCommand, { stdio: "inherit" });

    log(`\n✅ All tests completed successfully!`, "green");
  } catch (error) {
    log(`\n❌ Tests failed with error:`, "red");
    log(error.message, "red");
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests, checkEnvironment, ensureTestFiles };
