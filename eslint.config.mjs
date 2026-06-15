import globals from "globals";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import { fileURLToPath } from "url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["main.js", "node_modules/**", "*.map"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // Enable typed linting for the TypeScript sources (required by several
  // Obsidian guideline rules, e.g. no-floating-promises / await-thenable).
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
  },
  ...tseslint.configs.recommended,
  // Obsidian community plugin guidelines — the same ruleset the official
  // plugin scanner uses. Keeps releases free of the flagged API/CSS issues.
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // TypeScript itself reports undefined identifiers; the core no-undef
      // rule double-reports TS types/Node globals and is off for TS projects.
      "no-undef": "off",
      // Disabled deliberately:
      // - ui/sentence-case rewrites proper nouns/brand names incorrectly
      //   (e.g. "ElevenLabs" -> "Elevenlabs", AWS region names) and is not a
      //   scanner-rated risk.
      "obsidianmd/ui/sentence-case": "off",
      // - The general "no-unsafe-* on any" family is broad type strictness,
      //   not an Obsidian guideline; it mostly flags AWS SDK / catch values.
      //   We keep the Obsidian-relevant typed rules (e.g. no-floating-promises).
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
];
