import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "extension",
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: {
      vscode: path.resolve(__dirname, "src/test/vscodeMock.ts"),
    },
  },
});
