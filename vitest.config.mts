import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: {
        // graphql 14 ships index.mjs with extensionless imports that Node cannot load.
        // Let Vite process it instead. Drop this once graphql is on 16 or later.
        inline: ["graphql"],
      },
    },
  },
});
