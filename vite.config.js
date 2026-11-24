import { defineConfig } from "vite";

// Den publika sajten byggs från index.html i roten. prototyp/ och dev/ ingår inte i bygget.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
