/* #regali (T5): logo dal browser (tipo, dimensione, limite, cancellazioni
   del file rifiutato e del logo precedente), logo da URL per gli agenti,
   cancellazione bloccata se usato e cron dei caricamenti orfani. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LOGO_MAX_BYTES } from "../shared/schema/dashboard.ts";
import { ORFANI_DOPO_MS, tipoImmagine } from "./gifters.ts";
import { codiceDi } from "./lib/errors.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size = 64) => {
  const b = new Uint8Array(size);
  b.set(PNG);
  return b;
};
const webp = () => new Uint8Array([..."RIFF"].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map(c => c.charCodeAt(0)), [0, 0, 0, 0]));

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e) ?? String((e as Error).message);
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Un file "caricato dal browser" (come il POST all'URL di upload). */
const carica = (t: T, bytes: Uint8Array, type: string) => t.run(async ctx => await ctx.storage.store(new Blob([bytes as Uint8Array<ArrayBuffer>], { type })));
const esiste = (t: T, id: Id<"_storage">) => t.run(async ctx => (await ctx.db.system.get(id)) !== null);

async function base(t: T) {
  const a = await conProfilo(t, "u-a", "utente-a");
  const { id } = await a.as.mutation(api.gifters.add, { input: { label: "Amici", url: "https://amici.example" } });
  const setLogo = (storageId: Id<"_storage"> | null) => a.as.action(api.gifters.setLogo, { input: { id, storageId } });
  const dettagli = async () => (await a.as.query(api.gifters.dettagli, {})).gifters[0];
  return { a, id, setLogo, dettagli };
}

describe("logo dal browser", () => {
  it("png, jpeg o webp fino a 256 KB: il logo si vede nella pagina pubblica", async () => {
    const t = setup();
    const { id, setLogo, dettagli } = await base(t);
    const file = await carica(t, png(), "image/png");
    expect(await setLogo(file)).toEqual({ ok: true });
    expect(await dettagli()).toMatchObject({ id, logoCaricato: true, logoUrl: expect.stringMatching(/^https:/) });
    const pagina = await t.query(api.pages.byHandle, { handle: "utente-a" });
    expect(pagina && "gifters" in pagina && pagina.gifters[0].logoUrl).toMatch(/^https:/);
  });

  it("tipo sbagliato o file troppo grande: rifiutato e il file cancellato (setLogo non lancia)", async () => {
    const t = setup();
    const { setLogo, dettagli } = await base(t);
    const testo = await carica(t, new TextEncoder().encode("<svg onload=alert(1)>"), "image/svg+xml");
    expect(await setLogo(testo)).toMatchObject({ ok: false, code: "input_non_valido" });
    expect(await esiste(t, testo)).toBe(false);
    const grande = await carica(t, png(LOGO_MAX_BYTES + 1), "image/png");
    expect(await setLogo(grande)).toMatchObject({ ok: false, code: "input_non_valido" });
    expect(await esiste(t, grande)).toBe(false);
    // al limite esatto va bene
    const giusto = await carica(t, png(LOGO_MAX_BYTES), "image/png");
    expect(await setLogo(giusto)).toEqual({ ok: true });
    expect((await dettagli()).logoCaricato).toBe(true);
  });

  it("il tipo dichiarato al caricamento deve combaciare con i primi byte del file", async () => {
    const t = setup();
    const { setLogo, dettagli } = await base(t);
    // HTML (o qualunque cosa) dichiarato come png: Convex lo servirebbe come image/png
    const finto = await carica(t, new TextEncoder().encode("<html><script>alert(1)</script></html>"), "image/png");
    expect(await setLogo(finto)).toMatchObject({ ok: false, code: "input_non_valido" });
    expect(await esiste(t, finto)).toBe(false);
    // un png vero dichiarato come webp: anche questo no
    const scambiato = await carica(t, png(), "image/webp");
    expect(await setLogo(scambiato)).toMatchObject({ ok: false, code: "input_non_valido" });
    expect(await esiste(t, scambiato)).toBe(false);
    expect((await dettagli()).logoCaricato).toBe(false);
  });

  it("il logo precedente si cancella quando arriva il nuovo, e quando lo si toglie", async () => {
    const t = setup();
    const { setLogo, dettagli } = await base(t);
    const primo = await carica(t, png(), "image/png");
    const secondo = await carica(t, webp(), "image/webp");
    await setLogo(primo);
    await setLogo(secondo);
    expect(await esiste(t, primo)).toBe(false);
    expect(await esiste(t, secondo)).toBe(true);
    await setLogo(null);
    expect(await esiste(t, secondo)).toBe(false);
    expect(await dettagli()).toMatchObject({ logoCaricato: false });
    expect((await dettagli()).logoUrl).toBeUndefined();
  });

  it("il file di un altro profilo non si usa né si cancella", async () => {
    const t = setup();
    const { setLogo } = await base(t);
    const b = await conProfilo(t, "u-b", "utente-b");
    const { id: suo } = await b.as.mutation(api.gifters.add, { input: { label: "Bea" } });
    const fileDiB = await carica(t, png(), "image/png");
    await b.as.action(api.gifters.setLogo, { input: { id: suo, storageId: fileDiB } });
    expect(await codice(setLogo(fileDiB))).toBe("not_found");
    expect(await esiste(t, fileDiB)).toBe(true);
  });

  it("limite logoUpload: 20 URL di caricamento al giorno per profilo", async () => {
    const t = setup();
    const { a, id } = await base(t);
    for (let i = 0; i < 20; i++) {
      const { url } = await a.as.mutation(api.gifters.generateLogoUploadUrl, { input: { id } });
      expect(url).toMatch(/^https:/);
    }
    expect(await codice(a.as.mutation(api.gifters.generateLogoUploadUrl, { input: { id } }))).toBe("limite_superato");
    // un altro profilo ha il suo limite
    const b = await conProfilo(t, "u-b", "utente-b");
    const { id: suo } = await b.as.mutation(api.gifters.add, { input: { label: "Bea" } });
    expect(await codice(b.as.mutation(api.gifters.generateLogoUploadUrl, { input: { id: suo } }))).toBe("ok");
  });

  it("solo dalla dashboard: l'Oracolo non carica file", async () => {
    const t = setup();
    const { a, id } = await base(t);
    expect(await codice(a.as.mutation(api.gifters.generateLogoUploadUrl, { as: "oracolo", input: { id } }))).toBe("solo_dashboard");
    expect(await codice(a.as.action(api.gifters.setLogo, { as: "oracolo", input: { id, storageId: null } }))).toBe("solo_dashboard");
  });

  it("un cambio di logo va nel registro ma non si annulla", async () => {
    const t = setup();
    const { a, setLogo } = await base(t);
    await setLogo(await carica(t, png(), "image/png"));
    const [voce] = (await a.as.query(api.activity.list, {})).voci;
    expect(voce).toMatchObject({ op: "logo", tabella: "gifters", annullabile: false, riassunto: 'logo di "Amici" aggiornato' });
    expect(await codice(a.as.mutation(api.activity.undo, { input: { activityId: voce.id } }))).toBe("conflitto");
  });
});

describe("cancellazione di un \"regalato da\"", () => {
  it("bloccata se un concerto lo usa, con l'elenco; altrimenti via anche il file del logo, e Annulla lo riporta senza logo", async () => {
    const t = setup();
    const { a, id, setLogo } = await base(t);
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const { id: concerto } = await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "A", venue: "Fabrique", city: "Milano", gift: true, giftFrom: "Amici" } });
    try {
      await a.as.mutation(api.gifters.remove, { input: { id, confirm: true } });
      throw new Error("doveva fallire");
    } catch (e) {
      expect((e as { data: unknown }).data).toMatchObject({ code: "in_uso", concerti: ["01/01/2026 · A"] });
    }
    await a.as.mutation(api.entries.remove, { input: { id: concerto, confirm: true } });
    const file = await carica(t, png(), "image/png");
    await setLogo(file);
    await a.as.mutation(api.gifters.remove, { input: { id, confirm: true } });
    expect(await esiste(t, file)).toBe(false);
    const voce = (await a.as.query(api.activity.list, {})).voci[0];
    await a.as.mutation(api.activity.undo, { input: { activityId: voce.id } });
    const [g] = (await a.as.query(api.gifters.dettagli, {})).gifters;
    expect(g).toMatchObject({ label: "Amici", url: "https://amici.example", logoCaricato: false });
  });
});

describe("logo da URL (set_gifter_logo, agenti)", () => {
  const servi = (body: Uint8Array, headers: Record<string, string> = {}, finale?: string) => {
    const chiamate: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      chiamate.push(String(input));
      const res = new Response(body as Uint8Array<ArrayBuffer>, { status: 200, headers });
      if (finale) Object.defineProperty(res, "url", { value: finale });
      return res;
    }));
    return chiamate;
  };

  it("scarica, riconosce il tipo dai byte e salva; l'Oracolo può farlo", async () => {
    const t = setup();
    const { a, id, dettagli } = await base(t);
    servi(png(), { "content-type": "text/html" });
    expect(await a.as.action(api.gifters.setLogoFromUrl, { as: "oracolo", input: { id, url: "https://cdn.example/logo" } })).toEqual({ ok: true });
    expect(await dettagli()).toMatchObject({ logoCaricato: true });
    const [file] = await t.run(async ctx => await ctx.db.system.query("_storage").collect());
    expect(file.contentType).toBe("image/png");
    const [voce] = (await a.as.query(api.activity.list, {})).voci;
    expect(voce).toMatchObject({ op: "logo", autore: "Tour manager", annullabile: false });
    // null toglie il logo e cancella il file
    await a.as.action(api.gifters.setLogoFromUrl, { input: { id, url: null } });
    expect(await esiste(t, file._id)).toBe(false);
  });

  it("rifiuta http, host locali, file non immagine e troppo grandi, senza ripetere l'URL e senza salvare nulla", async () => {
    const t = setup();
    const { a, id } = await base(t);
    const prova = async (url: string) => {
      try {
        await a.as.action(api.gifters.setLogoFromUrl, { input: { id, url } });
        return "ok";
      } catch (e) {
        expect(JSON.stringify((e as { data: unknown }).data)).not.toContain("segreto");
        return codiceDi(e);
      }
    };
    expect(await prova("http://cdn.example/segreto.png")).toBe("input_non_valido");
    expect(await prova("https://localhost/segreto.png")).toBe("input_non_valido");
    expect(await prova("https://10.0.0.1/segreto.png")).toBe("input_non_valido");
    servi(new TextEncoder().encode("<html>segreto</html>"));
    expect(await prova("https://cdn.example/segreto.png")).toBe("input_non_valido");
    servi(png(LOGO_MAX_BYTES + 10));
    expect(await prova("https://cdn.example/segreto.png")).toBe("input_non_valido");
    servi(png(), {}, "http://cdn.example/segreto.png");
    expect(await prova("https://cdn.example/segreto.png")).toBe("input_non_valido");
    expect(await t.run(async ctx => (await ctx.db.system.query("_storage").collect()).length)).toBe(0);
  });

  /** Risposte in sequenza: [status, body, Location?]. Registra gli URL chiesti. */
  const serviInSequenza = (risposte: [number, Uint8Array | null, string?][]) => {
    const chiamate: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      chiamate.push(String(input));
      expect(init?.redirect).toBe("manual");
      const [status, body, location] = risposte[Math.min(chiamate.length - 1, risposte.length - 1)];
      return new Response(body as Uint8Array<ArrayBuffer> | null, { status, headers: location ? { location } : {} });
    }));
    return chiamate;
  };

  it("i redirect si seguono a mano: uno verso un host locale non parte mai", async () => {
    const t = setup();
    const { a, id, dettagli } = await base(t);
    const prova = (url: string) => codice(a.as.action(api.gifters.setLogoFromUrl, { input: { id, url } }));
    for (const verso of ["https://127.0.0.1/segreto.png", "https://169.254.169.254/latest/meta-data", "http://cdn.example/x.png", "https://metadata.google.internal/x", "https://[::1]/x.png"]) {
      const chiamate = serviInSequenza([[302, null, verso], [200, png()]]);
      expect(await prova("https://cdn.example/r"), verso).toBe("input_non_valido");
      expect(chiamate, verso).toEqual(["https://cdn.example/r"]);
    }
    // troppi redirect: ci si ferma
    const giro = serviInSequenza([[302, null, "https://cdn.example/r"]]);
    expect(await prova("https://cdn.example/r")).toBe("non_disponibile");
    expect(giro.length).toBe(4);
    expect(await t.run(async ctx => (await ctx.db.system.query("_storage").collect()).length)).toBe(0);
    // un redirect verso un altro host pubblico (anche relativo) va bene
    const chiamate = serviInSequenza([[301, null, "https://cdn2.example/logo"], [302, null, "/finale.png"], [200, png()]]);
    expect(await prova("https://cdn.example/r")).toBe("ok");
    expect(chiamate).toEqual(["https://cdn.example/r", "https://cdn2.example/logo", "https://cdn2.example/finale.png"]);
    expect((await dettagli()).logoCaricato).toBe(true);
  });

  it("not_found per un \"regalato da\" altrui, prima di scaricare", async () => {
    const t = setup();
    const { id } = await base(t);
    const b = await conProfilo(t, "u-b", "utente-b");
    const chiamate = servi(png());
    expect(await codice(b.as.action(api.gifters.setLogoFromUrl, { input: { id, url: "https://cdn.example/x.png" } }))).toBe("not_found");
    expect(chiamate).toEqual([]);
  });
});

describe("cron dei caricamenti orfani", () => {
  it("cancella i file non usati più vecchi di 24 ore; i loghi in uso e i caricamenti recenti restano", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { setLogo } = await base(t);
    const usato = await carica(t, png(), "image/png");
    await setLogo(usato);
    const orfano = await carica(t, png(), "image/png");
    vi.advanceTimersByTime(ORFANI_DOPO_MS + 60_000);
    const recente = await carica(t, png(), "image/png");
    await t.mutation(internal.gifters.cleanupOrphanLogos, {});
    expect(await esiste(t, usato)).toBe(true);
    expect(await esiste(t, orfano)).toBe(false);
    expect(await esiste(t, recente)).toBe(true);
  });
});

describe("tipoImmagine", () => {
  it("riconosce png, jpeg e webp dai primi byte", () => {
    expect(tipoImmagine(png())).toBe("image/png");
    expect(tipoImmagine(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(tipoImmagine(webp())).toBe("image/webp");
    expect(tipoImmagine(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});
