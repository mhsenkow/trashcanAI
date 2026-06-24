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
    // Vendored manifold WASM glue copied in from node_modules.
    "public/**",
  ]),
  {
    // React Three Fiber legitimately mutates three.js camera/controls/geometry
    // objects imperatively — the React Compiler immutability rule misfires here.
    files: ["src/components/Viewport.tsx"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
  {
    // Syncing an external value into controlled-input draft state (Slider), and
    // loading persisted presets / reacting to store resets (PresetBar), are
    // legitimate effects the React Compiler set-state-in-effect rule over-flags.
    files: ["src/components/ui/Slider.tsx", "src/components/PresetBar.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
