import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Use createLogger from src/lib/logger.ts (levels, masks secrets)
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/logger.ts", "src/**/__tests__/**"],
    rules: { "no-console": "error" },
  },
  {
    // Signs come from the source (brief §3); Math.abs would hide reversals and refunds.
    files: ["src/lib/domain/**/*.ts"],
    ignores: ["src/lib/domain/**/__tests__/**"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.object.name='Math'][callee.property.name='abs']",
        message: "No Math.abs in domain code: keep the sign from the source. For numeric tolerances use the helpers in domain/math.ts."
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
