import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleProxyRequest } from "./server/routes/proxy.ts";

function feedProxyPlugin(): Plugin {
  return {
    name: "feed-proxy",
    configureServer(server) {
      server.middlewares.use("/api/proxy", (req, res) => {
        void handleProxyRequest(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/proxy", (req, res) => {
        void handleProxyRequest(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), feedProxyPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "^/api/(?!proxy)": "http://127.0.0.1:3001",
    },
  },
  worker: { format: "es" },
});
