/* ──────────────────────────────────────────────────────────────
   Le foto dei concerti (DECISIONI «Foto dei concerti»), dal browser vero:
   una proprietaria di prova (mai gabrifila) carica foto dal pannello del
   concerto, le riordina e ne toglie una; la pagina pubblica le mostra in
   «Le mie foto» e nel visore.

   Privacy: una delle foto ha l'Exif con le coordinate GPS (come quelle di
   un telefono). Il file che arriva su Convex non deve avere segmenti di
   metadati (APP1 Exif/XMP) né la stringa "Exif": il browser lo ricodifica.

   Screenshot in e2e-shots/foto/<vista>-<tema>-<progetto>.png (fuori da
   git): il pannello con le foto, l'elenco col segno delle foto, la sezione
   pubblica e il visore. Le immagini sono disegnate al volo (palchi finti
   su un canvas), niente foto vere nel repo.
   ────────────────────────────────────────────────────────────── */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { idratata, nuovoProprietario } from "./helpers/auth.ts";
import { vaiA } from "./helpers/modifica.ts";
import { prepara } from "./helpers/profili.ts";
import { setTemaCookie } from "./helpers/tema.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const SHOTS = join(process.cwd(), "e2e-shots", "foto");

/** Un palco finto: fondo scuro, fasci di luce colorati, foschia, la folla in controluce. */
async function disegnaPalchi(page: Page, scene: { w: number; h: number; tinta: number; seme: number }[]): Promise<string[]> {
  return await page.evaluate(async lista => {
    const out: string[] = [];
    for (const { w, h, tinta, seme } of lista) {
      let s = seme;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      const fondo = g.createLinearGradient(0, 0, 0, h);
      fondo.addColorStop(0, `hsl(${tinta} 60% 8%)`);
      fondo.addColorStop(1, `hsl(${(tinta + 40) % 360} 50% 3%)`);
      g.fillStyle = fondo;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {
        const x = w * (0.1 + 0.8 * rnd());
        const hue = (tinta + rnd() * 80 - 40 + 360) % 360;
        const fascio = g.createLinearGradient(x, 0, x, h * 0.85);
        fascio.addColorStop(0, `hsla(${hue} 90% 70% / .85)`);
        fascio.addColorStop(1, `hsla(${hue} 90% 50% / 0)`);
        g.fillStyle = fascio;
        const larg = w * (0.12 + 0.2 * rnd());
        const dx = (rnd() - 0.5) * w * 0.5;
        g.beginPath();
        g.moveTo(x - 6, 0);
        g.lineTo(x + 6, 0);
        g.lineTo(x + dx + larg, h * 0.85);
        g.lineTo(x + dx - larg, h * 0.85);
        g.closePath();
        g.fill();
      }
      for (let i = 0; i < 40; i++) {
        const r = w * (0.02 + 0.05 * rnd());
        const nebbia = g.createRadialGradient(w * rnd(), h * (0.3 + 0.5 * rnd()), 0, w * rnd(), h * 0.6, r * 6);
        nebbia.addColorStop(0, `hsla(${tinta} 40% 70% / .05)`);
        nebbia.addColorStop(1, "hsla(0 0% 0% / 0)");
        g.fillStyle = nebbia;
        g.fillRect(0, 0, w, h);
      }
      g.globalCompositeOperation = "source-over";
      // il palco e la folla
      g.fillStyle = "rgba(0,0,0,.85)";
      g.fillRect(0, h * 0.78, w, h * 0.22);
      for (let i = 0; i < 70; i++) {
        const x = w * rnd();
        const y = h * (0.8 + 0.12 * rnd());
        const r = w * (0.018 + 0.014 * rnd());
        g.fillStyle = "#020203";
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - r * 1.5, y + r * 0.8, r * 3, h);
        if (rnd() < 0.12) g.fillRect(x + r * 0.6, y - r * 4, r * 0.5, r * 4); // un braccio alzato
      }
      const blob: Blob = await new Promise(ok => c.toBlob(b => ok(b!), "image/jpeg", 0.93));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      out.push(btoa(bin));
    }
    return out;
  }, scene);
}

/** Un segmento APP1 Exif con il GPS (Genova, 44.41 N 8.93 E), da mettere subito dopo SOI. */
function exifGps(): Buffer {
  const le = (n: number, b: number) => { const x = Buffer.alloc(b); if (b === 2) x.writeUInt16LE(n); else x.writeUInt32LE(n); return x; };
  const voce = (tag: number, tipo: number, n: number, valore: Buffer) => Buffer.concat([le(tag, 2), le(tipo, 2), le(n, 4), valore]);
  const razionali = (vals: [number, number][]) => Buffer.concat(vals.flatMap(([a, b]) => [le(a, 4), le(b, 4)]));
  // TIFF: header (8) + IFD0 (2 + 12 + 4) → GPS IFD a 26
  const gpsOff = 26;
  const datiOff = gpsOff + 2 + 4 * 12 + 4;
  const lat = razionali([[44, 1], [24, 1], [3600, 100]]);
  const lng = razionali([[8, 1], [55, 1], [4800, 100]]);
  const tiff = Buffer.concat([
    Buffer.from("II*\0"), le(8, 4),
    le(1, 2), voce(0x8825, 4, 1, le(gpsOff, 4)), le(0, 4),
    le(4, 2),
    voce(1, 2, 2, Buffer.from("N\0\0\0")), voce(2, 5, 3, le(datiOff, 4)),
    voce(3, 2, 2, Buffer.from("E\0\0\0")), voce(4, 5, 3, le(datiOff + 24, 4)),
    le(0, 4), lat, lng,
  ]);
  const corpo = Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(corpo.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xe1]), len, corpo]);
}

/** I segmenti prima dei dati (SOS) di un JPEG: i loro marcatori. */
function marcatori(b: Buffer): number[] {
  const out: number[] = [];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const m = b[i + 1];
    out.push(m);
    if (m === 0xda) break;
    i += 2 + b.readUInt16BE(i + 2);
  }
  return out;
}

const CONCERTI = [
  { date: "12/09/2026", artist: "Verdena", venue: "Fabrique", city: "Milano", voto: 5, vicinanza: 5, canzoniNote: 4 },
  { date: "03/07/2026", artist: "Marlene Kuntz", venue: "Fabrique", city: "Milano", voto: 4, vicinanza: 4, canzoniNote: 3 },
  { date: "18/04/2026", artist: "Afterhours", venue: "Fabrique", city: "Milano", voto: 4, vicinanza: 6, canzoniNote: 5 },
];

test.describe("foto dei concerti", () => {
  test("carica, riordina e togli; il GPS non arriva mai al server; la pagina pubblica le mostra @sessione", async ({ page, context, baseURL }, info) => {
    test.skip(onPreview(info.project.name), "solo in locale: proprietaria di prova con l'OTP di sviluppo");
    test.setTimeout(300_000);
    mkdirSync(SHOTS, { recursive: true });
    const tmp = info.outputPath("foto");
    mkdirSync(tmp, { recursive: true });
    const progetto = info.project.name;

    const { handle } = await nuovoProprietario(page, { nome: "Gabri", forma: "m" });
    prepara({ handle: handle as `e2e-${string}`, displayName: "Gabri", forma: "m", concerti: CONCERTI });

    // le foto finte: grandi come quelle di un telefono, una verticale, una con il GPS
    await page.goto(`/${handle}/modifica`);
    await idratata(page);
    const scene = [
      { w: 3000, h: 2000, tinta: 285, seme: 11 }, { w: 2000, h: 3000, tinta: 200, seme: 23 }, { w: 3000, h: 2000, tinta: 15, seme: 37 },
      { w: 3000, h: 2000, tinta: 320, seme: 41 }, { w: 3000, h: 2000, tinta: 180, seme: 53 }, { w: 2400, h: 2400, tinta: 40, seme: 67 },
      { w: 3000, h: 2000, tinta: 250, seme: 71 }, { w: 3000, h: 2000, tinta: 120, seme: 83 },
    ];
    const file = (await disegnaPalchi(page, scene)).map((b64, i) => {
      let buf = Buffer.from(b64, "base64");
      // la prima con l'Exif del telefono: posizione di casa compresa
      if (i === 0) buf = Buffer.concat([buf.subarray(0, 2), exifGps(), buf.subarray(2)]);
      const p = join(tmp, `IMG_${4100 + i}.jpg`);
      writeFileSync(p, buf);
      return p;
    });
    expect(marcatori(readFileSync(file[0]))).toContain(0xe1);

    const carica = async (artista: string, quali: string[], attese: number) => {
      await vaiA(page, "concerti");
      await page.getByRole("button", { name: new RegExp(`^Modifica ${artista} del`) }).click();
      const pannello = page.getByRole("dialog", { name: /Modifica concerto/ });
      await expect(pannello).toBeVisible();
      const blocco = pannello.locator("section.mf-foto");
      await blocco.locator('input[type="file"]').setInputFiles(quali);
      await expect(blocco.locator(".mf-foto-voce")).toHaveCount(attese, { timeout: 60_000 });
      await expect(blocco.getByRole("button", { name: /Aggiungi/ })).toBeEnabled({ timeout: 60_000 });
      return { pannello, blocco };
    };

    const { pannello, blocco } = await carica("Verdena", file.slice(0, 6), 6);
    await expect(blocco.getByRole("heading", { name: /Foto 6 di 20/ })).toBeVisible();

    // privacy: il file salvato non ha più Exif né GPS
    const src = await blocco.locator(".mf-foto-anteprima").first().getAttribute("href");
    const salvata = Buffer.from(await (await page.request.get(src!)).body());
    expect(marcatori(salvata)).not.toContain(0xe1);
    expect(salvata.includes(Buffer.from("Exif"))).toBe(false);
    expect(salvata.length).toBeLessThanOrEqual(2 * 1024 * 1024);

    // riordina: l'ultima diventa la copertina; poi togline una
    const voci = blocco.locator(".mf-foto-voce");
    const ultima = await voci.nth(5).locator("img").getAttribute("src");
    for (let k = 0; k < 5; k++) {
      await voci.nth(5 - k).getByRole("button", { name: /^Altre azioni per la foto/ }).click();
      await page.getByRole("menuitem", { name: "Sposta prima" }).click();
      await expect(voci.nth(4 - k).locator("img")).toHaveAttribute("src", ultima!);
    }
    await expect(voci.first().locator(".mf-foto-prima")).toHaveText("copertina");

    await shot(page, context, baseURL!, `pannello-${progetto}`, async () => {
      await blocco.scrollIntoViewIfNeeded();
      return pannello;
    });

    await voci.nth(3).getByRole("button", { name: /^Altre azioni per la foto/ }).click();
    await page.getByRole("menuitem", { name: "Togli…" }).click();
    await page.getByRole("dialog", { name: "Togliere questa foto?" }).getByRole("button", { name: "Togli la foto" }).click();
    await expect(voci).toHaveCount(5);
    await pannello.getByRole("button", { name: "Annulla", exact: true }).click();

    await carica("Marlene Kuntz", file.slice(6, 8), 2);
    await page.getByRole("dialog", { name: /Modifica concerto/ }).getByRole("button", { name: "Annulla", exact: true }).click();

    // l'elenco: il segno con quante foto ha ogni concerto
    await vaiA(page, "concerti");
    const riga = page.locator("li.mf-riga", { hasText: "Verdena" });
    await expect(riga.locator(".mf-tag-foto")).toContainText("5");
    await shot(page, context, baseURL!, `elenco-${progetto}`, async () => page.locator("section#concerti"));

    // la pagina pubblica: «Le mie foto», la serata più recente prima, e il visore
    await page.goto(`/${handle}/dati`);
    await idratata(page);
    const sezione = page.locator("#sec-foto");
    await expect(sezione.getByRole("heading", { name: "Le mie foto" })).toBeVisible();
    await expect(sezione.locator(".fotoitem")).toHaveCount(2);
    await expect(sezione.locator(".fotoitem").first()).toContainText("Verdena");
    await expect(sezione.locator(".fotoitem").first().locator(".fotopiu")).toHaveText("+1");
    await shot(page, context, baseURL!, `sezione-${progetto}`, async () => {
      await sezione.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("#sec-foto img")].every(i => i.complete && i.naturalWidth > 0));
      return sezione;
    });

    await sezione.locator(".fototile").nth(1).click();
    const visore = page.getByRole("dialog", { name: "Foto di Verdena" });
    await expect(visore).toBeVisible();
    await expect(visore.locator(".fv-conta")).toHaveText("2 / 5");
    await page.keyboard.press("ArrowRight");
    await expect(visore.locator(".fv-conta")).toHaveText("3 / 5");
    await shot(page, context, baseURL!, `visore-${progetto}`, async () => {
      await page.waitForFunction(() => { const i = document.querySelector<HTMLImageElement>(".fotovisore img"); return !!i && i.complete && i.naturalWidth > 0; });
      return null;
    });
    await page.keyboard.press("Escape");
    await expect(visore).toBeHidden();

    // nessuna foto pubblica porta l'Exif
    for (const img of await sezione.locator(".fototile img").all()) {
      const b = Buffer.from(await (await page.request.get((await img.getAttribute("src"))!)).body());
      expect(marcatori(b)).not.toContain(0xe1);
    }
  });
});

/** Lo stesso scatto in chiaro e in scuro (il tema del visitatore è un cookie: si ricarica). */
async function shot(page: Page, context: import("@playwright/test").BrowserContext, baseURL: string, nome: string, prepara: () => Promise<import("@playwright/test").Locator | null>) {
  for (const tema of ["light", "dark"] as const) {
    await setTemaCookie(context, baseURL, tema);
    await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), tema);
    const el = await prepara();
    await page.waitForTimeout(300);
    const path = join(SHOTS, `${nome.replace(/-(desktop|mobile)$/, "")}-${tema}-${nome.match(/(desktop|mobile)$/)?.[1] ?? "x"}.png`);
    if (el) await el.screenshot({ path, animations: "disabled" });
    else await page.screenshot({ path, animations: "disabled" });
  }
}
