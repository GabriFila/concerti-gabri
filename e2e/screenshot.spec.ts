/* ──────────────────────────────────────────────────────────────
   Screenshot del giro finale (PIANO traguardo 9), da far guardare a Gabri:
   la landing, /gabrifila, /gabrifila/dati e /gabrifila/modifica (da
   proprietario: utente di prova + admin:claimProfile sul deployment
   locale), in chiaro e in scuro; il viewport lo dà il progetto (desktop,
   mobile Pixel 7). 4 pagine × 2 temi × 2 progetti = 16 PNG a pagina
   intera in e2e-shots/finale/ (fuori da git), con il nome
   <pagina>-<tema>-<progetto>.png.
   Nessun confronto: la parità con main la controlla parita.spec.ts. Le
   pagine pubbliche si scattano da visitatore, prima del login. Solo in
   locale (l'accesso usa l'OTP di sviluppo).
   ────────────────────────────────────────────────────────────── */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { accediComeGabrifila, idratata } from "./helpers/auth.ts";
import { setTemaCookie } from "./helpers/tema.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const DIR = join(process.cwd(), "e2e-shots", "finale");
const TEMI = ["light", "dark"] as const;
const PUBBLICHE = [
  { nome: "landing", path: "/" },
  { nome: "palco", path: "/gabrifila" },
  { nome: "dati", path: "/gabrifila/dati" },
] as const;

/* Porta la pagina a riposo: scorre tutta la pagina (le sezioni si rivelano
   allo scroll e la mappa carica le tile), torna in cima, aspetta font e rete. */
async function aRiposo(page: Page) {
  await idratata(page);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  // la mappa e la sottoscrizione Convex possono non arrivare mai a "networkidle": basta provarci
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

test("16 screenshot del giro finale: 4 pagine in chiaro e in scuro", { tag: "@sessione" }, async ({ page, context, baseURL }, info) => {
  test.skip(onPreview(info.project.name), "solo in locale (l'accesso usa l'OTP di sviluppo)");
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const scatta = async (pagina: string, tema: string) => {
    await aRiposo(page);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(tema);
    await page.screenshot({ path: join(DIR, `${pagina}-${tema}-${info.project.name}.png`), fullPage: true, animations: "disabled" });
  };

  for (const tema of TEMI) {
    await setTemaCookie(context, baseURL!, tema);
    for (const p of PUBBLICHE) {
      await page.goto(p.path);
      await scatta(p.nome, tema);
    }
  }

  await accediComeGabrifila(page);
  for (const tema of TEMI) {
    await setTemaCookie(context, baseURL!, tema);
    await page.goto("/gabrifila/modifica");
    await expect(page).toHaveURL(/\/gabrifila\/modifica$/);
    await expect(page.locator("section.modifica-sezione")).toHaveCount(9);
    await scatta("modifica", tema);
  }
});
