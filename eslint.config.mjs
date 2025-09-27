import globals from "globals";
import tseslint from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["main.js", "node_modules/**", "*.map"]
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: { globals: globals.browser }
  },
  ...tseslint.configs.recommended,
];