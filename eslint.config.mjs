import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Airtable API responses are dynamic — allow any for mapper functions
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unused vars that are prefixed with _
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      // Allow setState in effects for session-dependent initialization
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
