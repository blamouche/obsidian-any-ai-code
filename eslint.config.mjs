import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "main.js",
      "node_modules/**",
      "dist/**",
      "__pycache__/**",
      "*.config.mjs",
      "*.config.js"
    ]
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json"
      }
    }
  },
  {
    // Tests intentionally use literal `.obsidian` paths as fixtures for the
    // path-resolution helpers. They are not Obsidian configuration usage.
    files: ["tests/**/*.ts"],
    rules: {
      "obsidianmd/hardcoded-config-path": "off"
    }
  }
]);
