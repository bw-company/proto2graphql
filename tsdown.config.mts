import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  dts: { sourcemap: true },
  sourcemap: true,
  // converter.ts locates the proto/ directory with __dirname, which ESM does not define
  shims: true,
});
