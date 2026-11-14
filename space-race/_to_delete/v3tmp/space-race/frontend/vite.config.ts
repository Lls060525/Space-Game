import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy REST + WebSockets to Django so the browser only ever talks to :5173 (no CORS pain).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,          // listen on your Wi-Fi IP too, so friends on the same network can join
    allowedHosts: true,  // allow tunnel URLs like *.trycloudflare.com / *.ngrok-free.app
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/ws": { target: "ws://localhost:8000", ws: true, changeOrigin: true },
    },
  },
});
