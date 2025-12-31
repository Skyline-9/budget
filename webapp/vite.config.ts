import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          // React Compiler (https://react.dev/learn/react-compiler)
          // Target React 18 so compiled output uses `react-compiler-runtime`.
          ["babel-plugin-react-compiler", { target: "18" }],
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Increase chunk size warning limit since we're manually splitting chunks
    chunkSizeWarningLimit: 600,
    // Enable CSS code splitting for better caching
    cssCodeSplit: true,
    // Use esbuild for minification (fastest)
    minify: "esbuild",
    // Disable sourcemaps in production for faster builds (optional)
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // ECharts chunk (large library, only used in DashboardCharts)
          // echarts-for-react must be in same chunk as echarts
          if (id.includes("echarts") || id.includes("echarts-for-react")) {
            return "echarts";
          }
          // Framer Motion chunk
          if (id.includes("framer-motion")) {
            return "framer-motion";
          }
          // TanStack packages chunk
          if (id.includes("@tanstack")) {
            return "tanstack";
          }
          // Radix UI chunk
          if (id.includes("@radix-ui")) {
            return "radix-ui";
          }
          // Keep React in main chunk to ensure it loads first
          // This prevents echarts from loading before React is available
          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("react-router")
          ) {
            // Keep React in main entry chunk (don't split it out)
            return;
          }
        },
      },
    },
  },
});


