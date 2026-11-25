import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cms } from "./scripts/vite-cms.mjs";

const page = (file) => fileURLToPath(new URL(file, import.meta.url));

// Den publika sajten byggs från index.html och inbjudan.html i roten. prototyp/ och dev/ ingår inte i bygget.
// cms() fyller platserna för årets lopp och resultatarkivet, se scripts/vite-cms.mjs.
export default defineConfig({
  plugins: [cms()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    rolldownOptions: {
      input: { main: page("./index.html"), inbjudan: page("./inbjudan.html") },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
