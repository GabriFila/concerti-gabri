import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";

// TanStack Start (SSR) + Nitro. Su Vercel Nitro sceglie da solo il preset
// `vercel` e scrive .vercel/output; le funzioni girano a Dublino (dub1),
// accanto a Convex EU. In locale `vite build` produce .output (node-server).
export default defineConfig({
  server: {
    // portless passa PORT; senza, la porta fissa del dev su t3node
    port: Number(process.env.PORT) || 3100,
    strictPort: true,
    // Vite blocca gli Host sconosciuti: l'URL tailnet che espone la 3100
    // (*.localhost di portless è già ammesso)
    allowedHosts: ["t3node.tail4a8e3b.ts.net"],
  },
  define: {
    // per il titolo delle preview ("<branch> · Gabri ai concerti"): valori del
    // build, sul client process.env non esiste
    __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? ""),
    __VERCEL_GIT_COMMIT_REF__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_REF ?? ""),
  },
  plugins: [
    tanstackStart(),
    nitro({ vercel: { functions: { regions: ["dub1"] } } }),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
  ],
});
