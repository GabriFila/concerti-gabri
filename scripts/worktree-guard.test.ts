/* La guardia di `pnpm dev` / `pnpm e2e` nei worktree collegati (PIANO §4.3
   punto 4): senza WT_ENV=1, o con l'app puntata a un Convex non locale, non
   si parte. Nel checkout principale la guardia non interviene. */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLinkedWorktree, worktreeRefusal } from "./worktree-guard.mjs";

const QUI = process.cwd();
const collegato: boolean = isLinkedWorktree(QUI);

describe("worktreeRefusal", () => {
  it("fuori da git (o nel checkout principale) non interviene", () => {
    const dir = mkdtempSync(join(tmpdir(), "wt-guard-"));
    try {
      expect(isLinkedWorktree(dir)).toBe(false);
      expect(worktreeRefusal("dev", { cwd: dir, env: {} })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(collegato)("in un worktree collegato vuole WT_ENV=1", () => {
    expect(worktreeRefusal("e2e", { cwd: QUI, env: {} })).toMatch(/wt\.mjs exec -- pnpm e2e/);
    expect(worktreeRefusal("dev", { cwd: QUI, env: { VITE_CONVEX_URL: "http://127.0.0.1:3210" } })).toMatch(/wt\.mjs exec/);
  });

  it.runIf(collegato)("con WT_ENV=1 vuole il Convex locale, mai uno cloud", () => {
    expect(worktreeRefusal("dev", { cwd: QUI, env: { WT_ENV: "1", VITE_CONVEX_URL: "http://127.0.0.1:3210" } })).toBeNull();
    expect(worktreeRefusal("dev", { cwd: QUI, env: { WT_ENV: "1", VITE_CONVEX_URL: "https://agile-leopard-908.eu-west-1.convex.cloud" } })).toMatch(/locale/);
    expect(worktreeRefusal("dev", { cwd: QUI, env: { WT_ENV: "1" } })).toMatch(/manca/);
  });
});
