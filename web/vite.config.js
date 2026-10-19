import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In local dev, forward /api to the FastAPI app (`make api`), which also serves under /api.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
