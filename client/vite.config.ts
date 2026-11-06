import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}
// A new worker URL avoids a CDN reusing an older worker on fresh installs.
const workerRevision = createHash("sha256");
for (const file of [...sourceFiles(path.resolve(__dirname, "src")), path.resolve(__dirname, "public/sw-push.js"), path.resolve(__dirname, "index.html"), path.resolve(__dirname, "vite.config.ts")].sort()) {
  workerRevision.update(path.relative(__dirname, file)).update(readFileSync(file));
}
const workerVersion = workerRevision.digest("hex").slice(0, 12);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      filename: `sw-${workerVersion}.js`,
      registerType: "autoUpdate",
      includeAssets: [
        "icon.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "sw-push.js",
      ],
      manifest: {
        name: "Noted",
        short_name: "Noted",
        description: "A Zero-Overhead, High Signal-to-Noise Household & Personal Task Hub",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        importScripts: [`/sw-push.js?v=${workerVersion}`],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/(state|tasks|members|spaces)/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "noted-api-cache",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
