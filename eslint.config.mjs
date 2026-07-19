import globals from "globals";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import comments from "@eslint-community/eslint-plugin-eslint-comments";
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
  // Scanner parity for eslint-disable directives. The community scorecard
  // rejects (a) any disable that lacks an inline `-- reason` description and
  // (b) disabling its own rules at all. Suppressing an Obsidian rule instead of
  // fixing the code is exactly what turned warnings into blocking errors on the
  // 1.16.4 review, so make both a local/CI failure.
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    plugins: { "@eslint-community/eslint-comments": comments },
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
      "@eslint-community/eslint-comments/no-restricted-disable": [
        "error",
        "obsidianmd/*",
        "@typescript-eslint/no-deprecated",
      ],
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      // TypeScript itself reports undefined identifiers; the core no-undef
      // rule double-reports TS types/Node globals and is off for TS projects.
      "no-undef": "off",
      // Flag redundant `as`/`!` assertions (the official plugin scanner reports
      // these). Type-aware; kept on so they don't creep back in.
      //
      // IMPORTANT — this rule only matches the scanner if our typescript-eslint
      // version is at least as new as the scanner's. The rule's ability to see a
      // redundant assertion improves between releases, so an older pin reports
      // FEWER findings and gives false confidence: 1.16.3 shipped with 8.46.3
      // (0 findings locally) while the scanner ran 8.64.0 and published 11
      // warnings against src/. It does NOT depend on tsconfig strictness — a
      // stricter tsconfig reports fewer, not more. Keep typescript-eslint
      // reasonably current, and treat a sudden drop in findings after a
      // downgrade as a red flag rather than a fix.
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // Scanner parity: these type-checked rules are what the community
      // scorecard reports. no-redundant-type-constituents catches a union
      // component that resolved to TS's `error`/`any` type; no-deprecated
      // catches use of APIs marked @deprecated in the Obsidian typings.
      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/no-deprecated": "error",
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
