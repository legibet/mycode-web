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
} satisfies UserConfig;
