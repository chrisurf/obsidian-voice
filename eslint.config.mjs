import globals from "globals";
import tseslint from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    ignores: ["main.js", "node_modules/**", "*.map"]
  },
  {languageOptions: { globals: globals.browser }},
  ...tseslint.configs.recommended,
];