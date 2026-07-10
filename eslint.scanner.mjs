// Reproduces the Obsidian submission bot's typed ESLint pass locally.
//
// The community-hub scorecard runs @typescript-eslint's type-checked rules
// against a STRICT tsconfig (strict + strictBindCallApply +
// noUncheckedIndexedAccess), which narrows literal types the way the bot does —
// so it can flag redundant `as` assertions that our regular (looser) tsconfig
// considers necessary. This config layers that strict type-info source on top
// of the normal lint config (which still provides the obsidianmd plugin, so
// inline eslint-disable directives resolve) and turns the assertion rule on.
//
// Run via `npm run lint:scan`. Keep it green so a redundant cast can't reach a
// release and trigger a scorecard warning.
import { fileURLToPath } from "url";
import base from "./eslint.config.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default [
  ...base,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["./tsconfig.strict.json"],
        tsconfigRootDir: rootDir,
      },
    },
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
    },
  },
];
