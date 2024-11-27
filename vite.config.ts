import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"

// https://vitejs.dev/config/
export default defineConfig({
  // REMOVE ME
  // server: {
  //   host: "0.0.0.0",
  //   port: 8100
  // },
  plugins: [react(), TanStackRouterVite()]
})
