import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy REST + WebSockets to Django so the browser only ever talks to :5173 (no CORS pain).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
