import stylistic from "@stylistic/eslint-plugin";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "scripts/"] },
  ...tseslint.configs.recommended,
  // Applied after the presets so any formatting rule they enable that could
  // disagree with Prettier is switched off.
  prettier,
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      curly: ["error", "all"],
      // Prettier already emits this brace placement, so enforcing it cannot
      // conflict with `npm run format`.
      "@stylistic/brace-style": ["error", "1tbs"],
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "function", next: "function" },
        { blankLine: "always", prev: "import", next: ["const", "let", "function", "export"] },
        { blankLine: "always", prev: "multiline-block-like", next: "*" },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
