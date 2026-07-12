import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

export default {
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    exclude: [
      "@shikijs/core",
      "@shikijs/engine-javascript",
      "@shikijs/langs",
      "@shikijs/themes",
      "shiki",
      "shiki/core",
      "shiki/engine/javascript",
      "shiki/langs",
    ],
  },
  build: {
    rolldownOptions: {
      onLog(level, log, handler) {
        const file = log.id ?? log.loc?.file;
        if (
          log.code === "INVALID_ANNOTATION" &&
          file?.includes("/node_modules/.pnpm/@lexical+react@")
        ) {
          return;
        }
        handler(level, log);
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
} satisfies UserConfig;
