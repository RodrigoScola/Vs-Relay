// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/out/**", "**/node_modules/**", "**/*.vsix", "test-workspace/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["shared/src/**/*.ts", "extension/src/**/*.ts", "mcp-server/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./shared/tsconfig.json", "./extension/tsconfig.json", "./mcp-server/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
      "@typescript-eslint/require-await": "off",
      "no-console": ["warn", { allow: ["error"] }],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  {
    files: ["*.config.{js,mjs,ts}", "*/vitest.config.ts", "vitest.workspace.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
