module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/*.(test|spec).+(ts|tsx|js)",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  // Transform ES modules from unified/remark ecosystem
  transformIgnorePatterns: [
    "node_modules/(?!(unified|remark-parse|remark-gfm|remark-frontmatter|remark-stringify|mdast-util-.*|micromark.*|unist-.*|vfile|bail|is-plain-obj|trough|extend|character-entities|decode-named-character-reference|ccount|escape-string-regexp|markdown-table)/)",
  ],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 30000, // 30 seconds for AWS integration tests
  maxConcurrency: 3, // Limit concurrent AWS calls
  forceExit: true, // Force Jest to exit after tests despite AWS SDK open handles
};
