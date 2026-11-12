/* Le foto dei concerti (convex/foto.ts): caricamento dal browser (JPEG
   senza metadati, lato e peso), limite per evento, pagina pubblica, ordine,
   rimozione, isolamento tra profili, concerto cancellato e Annulla, cron
   delle foto orfane e dei file mai usati, eliminazione dell'account. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FOTO_LATO, FOTO_PER_EVENTO } from "../shared/schema/foto.ts";
import { ORFANI_DOPO_MS } from "./gifters.ts";
import { codiceDi } from "./lib/errors.ts";
import { ORFANE_PER_MS } from "./lib/foto.ts";
import { controllaJpeg } from "./lib/jpeg.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";

afterEach(() => vi.useRealTimers());

/* ── JPEG finti, segmento per segmento ───────────────────────── */

const seg = (marker: number, corpo: number[]) => [0xff, marker, ((corpo.length + 2) >> 8) & 0xff, (corpo.length + 2) & 0xff, ...corpo];
const JFIF = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const sof = (w: number, h: number) => seg(0xc0, [8, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 1, 1, 0x11, 0]);
const SOS = [...seg(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0x34, 0xff, 0xd9];
/** Un JPEG come lo scrive il canvas: SOI, JFIF, SOF con le dimensioni, i dati. */
const jpeg = (w = 1600, h = 1200, extra: number[] = []) => new Uint8Array([0xff, 0xd8, ...JFIF, ...extra, ...sof(w, h), ...SOS]);
/** Exif con le coordinate GPS, come lo scrive un telefono. */
const EXIF = seg(0xe1, [..."Exif"].map(c => c.charCodeAt(0)).concat([0, 0, 0x4d, 0x4d, 0, 0x2a]));

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e) ?? String((e as Error).message);
  }
};

const carica = (t: T, bytes: Uint8Array, type = "image/jpeg") =>
  t.run(async ctx => await ctx.storage.store(new Blob([bytes as Uint8Array<ArrayBuffer>], { type })));
const esiste = (t: T, id: Id<"_storage">) => t.run(async ctx => (await ctx.db.system.get(id)) !== null);

async function base(t: T, user = "u-a", handle = "utente-a") {
  const a = await conProfilo(t, user, handle);
  await venue(t, "Fabrique", "Milano", 9.25, 45.45, a.profileId);
  const { id } = await a.as.mutation(api.entries.add, {
    input: { kind: "concert", artist: "Verdena", date: "01/03/2025", venue: "Fabrique", city: "Milano", with: [] } as never,
  });
  /** Il percorso del browser: gli URL, i due file, aggiungi. */
  const aggiungi = async (foto = jpeg(), mini = jpeg(480, 360), entryId: string = id) => {
    await a.as.mutation(api.foto.urlCaricamento, { input: { entryId } });
    const [file, miniatura] = [await carica(t, foto), await carica(t, mini)];
    return { file, miniatura, esito: await a.as.action(api.foto.aggiungi, { input: { entryId, file, miniatura } }) };
  };
  const elenco = async () => (await a.as.query(api.foto.dellEvento, { input: { entryId: id } })).foto;
  const pubbliche = async () => {
    const p = await t.query(api.pages.byHandle, { handle });
    return p && "foto" in p ? p.foto : [];
  };
  return { a, id, aggiungi, elenco, pubbliche };
}

describe("controllaJpeg", () => {
  it("accetta il JPEG del canvas e ne legge le dimensioni", () => {
    expect(controllaJpeg(jpeg(1600, 1200), FOTO_LATO)).toEqual({ ok: true, larghezza: 1600, altezza: 1200 });
  });

  it("rifiuta Exif/XMP (APP1), IPTC (APP13) e commenti: lì stanno GPS, data e telefono", () => {
    expect(controllaJpeg(jpeg(800, 600, EXIF), FOTO_LATO)).toEqual({ ok: false, motivo: "metadati" });
    expect(controllaJpeg(jpeg(800, 600, seg(0xed, [1, 2, 3])), FOTO_LATO)).toEqual({ ok: false, motivo: "metadati" });
    expect(controllaJpeg(jpeg(800, 600, seg(0xfe, [0x41])), FOTO_LATO)).toEqual({ ok: false, motivo: "metadati" });
  });

  it("rifiuta un lato oltre il massimo e i file che non sono JPEG ben formati", () => {
    expect(controllaJpeg(jpeg(FOTO_LATO + 1, 100), FOTO_LATO)).toEqual({ ok: false, motivo: "troppo_grande" });
    expect(controllaJpeg(new TextEncoder().encode("<html>"), FOTO_LATO)).toEqual({ ok: false, motivo: "non_jpeg" });
    expect(controllaJpeg(new Uint8Array([0xff, 0xd8, ...JFIF, ...SOS]), FOTO_LATO)).toEqual({ ok: false, motivo: "non_jpeg" }); // niente SOF
    expect(controllaJpeg(jpeg().slice(0, 30), FOTO_LATO)).toEqual({ ok: false, motivo: "non_jpeg" }); // troncato
  });
});

describe("caricamento", () => {
  it("una foto buona va nell'evento e nella pagina pubblica, con la miniatura", async () => {
    const t = setup();
    const { id, aggiungi, elenco, pubbliche } = await base(t);
    const { esito } = await aggiungi();
    expect(esito).toMatchObject({ ok: true });
    expect(await elenco()).toEqual([{ id: expect.any(String), url: expect.stringMatching(/^https?:/), miniatura: expect.stringMatching(/^https?:/), larghezza: 1600, altezza: 1200 }]);
    expect(await pubbliche()).toEqual([{ entryId: id, url: expect.any(String), miniatura: expect.any(String), larghezza: 1600, altezza: 1200 }]);
  });

  it("con i metadati GPS, troppo grande o non JPEG: rifiutata e i due file cancellati (aggiungi non lancia)", async () => {
    const t = setup();
    const { aggiungi, elenco } = await base(t);
    for (const [foto, mini] of [
      [jpeg(800, 600, EXIF), jpeg(480, 360)],
      [jpeg(800, 600), jpeg(480, 360, EXIF)],
      [jpeg(FOTO_LATO + 10, 600), jpeg(480, 360)],
      [jpeg(), jpeg(1024, 768)], // miniatura oltre il suo lato
      [new TextEncoder().encode("<svg onload=alert(1)>"), jpeg(480, 360)],
    ]) {
      const { file, miniatura, esito } = await aggiungi(foto, mini);
      expect(esito).toMatchObject({ ok: false, code: "input_non_valido" });
      expect(await esiste(t, file)).toBe(false);
      expect(await esiste(t, miniatura)).toBe(false);
    }
    expect(await elenco()).toEqual([]);
  });

  it("il tipo dichiarato deve essere image/jpeg", async () => {
    const t = setup();
    const { a, id } = await base(t);
    const file = await carica(t, jpeg(), "image/png");
    const miniatura = await carica(t, jpeg(480, 360));
    expect(await a.as.action(api.foto.aggiungi, { input: { entryId: id, file, miniatura } })).toMatchObject({ ok: false });
    expect(await esiste(t, file)).toBe(false);
  });

  it(`al massimo ${FOTO_PER_EVENTO} foto per evento`, async () => {
    const t = setup();
    const { a, id, aggiungi } = await base(t);
    await t.run(async ctx => {
      const e = (await ctx.db.query("entries").first())!;
      for (let i = 0; i < FOTO_PER_EVENTO; i++) {
        const file = await ctx.storage.store(new Blob([jpeg() as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
        const miniatura = await ctx.storage.store(new Blob([jpeg(480, 360) as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
        await ctx.db.insert("foto", { profileId: e.profileId, entryId: e._id, file, miniatura, larghezza: 1, altezza: 1, ordine: i, createdAt: Date.now() });
      }
    });
    expect(await codice(a.as.mutation(api.foto.urlCaricamento, { input: { entryId: id } }))).toBe("limite_superato");
    // anche saltando urlCaricamento: inserisci ricontrolla
    await expect(aggiungi().catch(e => codiceDi(e))).resolves.toBe("limite_superato");
  });

  it("un file già usato da un'altra foto non si riusa", async () => {
    const t = setup();
    const { a, id, aggiungi } = await base(t);
    const { file, miniatura } = await aggiungi();
    expect(await codice(a.as.action(api.foto.aggiungi, { input: { entryId: id, file, miniatura } }))).toBe("not_found");
    expect(await esiste(t, file)).toBe(true);
  });

  it("solo dashboard: un agente non carica, non elenca e non toglie foto", async () => {
    const t = setup();
    const { id } = await base(t);
    for (const p of [
      t.mutation(api.foto.urlCaricamento, { agentToken: "finto", input: { entryId: id } } as never),
      t.query(api.foto.dellEvento, { agentToken: "finto", input: { entryId: id } } as never),
    ]) expect(await codice(p)).not.toBe("ok");
  });
});

describe("link_foto_concerto", () => {
  it("dà il link al pannello del concerto con le foto in evidenza e quante ne ha; non scrive niente", async () => {
    const t = setup();
    const { a, id, aggiungi } = await base(t);
    expect(await a.as.query(api.foto.link, { input: { id } })).toEqual({
      link: `/utente-a/modifica#concerti?apri=${id}&foto=1`, foto: 0, max: FOTO_PER_EVENTO, concerto: "Verdena (01/03/2025)",
    });
    await aggiungi();
    expect((await a.as.query(api.foto.link, { input: { id } })).foto).toBe(1);
    expect((await a.as.query(api.activity.list, {})).voci.filter(v => v.op === "foto")).toHaveLength(1);
  });

  it("anche per un agente (è nel catalogo), mai per l'evento di un altro", async () => {
    const t = setup();
    const { id } = await base(t);
    const b = await conProfilo(t, "u-b", "utente-b");
    expect(await codice(b.as.query(api.foto.link, { input: { id } }))).toBe("not_found");
  });
});

describe("isolamento", () => {
  it("un altro profilo non vede, non carica e non toglie le foto", async () => {
    const t = setup();
    const { id, aggiungi, elenco } = await base(t);
    await aggiungi();
    const [foto] = await elenco();
    const b = await conProfilo(t, "u-b", "utente-b");
    expect(await codice(b.as.query(api.foto.dellEvento, { input: { entryId: id } }))).toBe("not_found");
    expect(await codice(b.as.mutation(api.foto.urlCaricamento, { input: { entryId: id } }))).toBe("not_found");
    expect(await codice(b.as.mutation(api.foto.togli, { input: { id: foto.id, confirm: true } }))).toBe("not_found");
    expect(await codice(b.as.mutation(api.foto.sposta, { input: { id: foto.id, verso: "dopo" } }))).toBe("not_found");
    expect(await elenco()).toHaveLength(1);
  });
});

describe("ordine e rimozione", () => {
  it("sposta cambia l'ordine (anche nella pagina pubblica); togli cancella i file; il registro le segna, senza Annulla", async () => {
    const t = setup();
    const { a, aggiungi, elenco, pubbliche } = await base(t);
    await aggiungi(jpeg(1000, 800));
    await aggiungi(jpeg(800, 1000));
    const [prima, seconda] = await elenco();
    await a.as.mutation(api.foto.sposta, { input: { id: seconda.id, verso: "prima" } });
    expect((await elenco()).map(f => f.id)).toEqual([seconda.id, prima.id]);
    expect((await pubbliche()).map(f => f.larghezza)).toEqual([800, 1000]);

    const files = await t.run(async ctx => (await ctx.db.get(prima.id as Id<"foto">))!);
    await a.as.mutation(api.foto.togli, { input: { id: prima.id, confirm: true } });
    expect((await elenco()).map(f => f.id)).toEqual([seconda.id]);
    expect(await esiste(t, files.file)).toBe(false);
    expect(await esiste(t, files.miniatura)).toBe(false);

    const voci = (await a.as.query(api.activity.list, {})).voci.filter(v => v.op === "foto");
    expect(voci.map(v => v.riassunto)).toEqual(["foto tolta: Verdena (01/03/2025)", "foto spostata: Verdena (01/03/2025)", "foto aggiunta: Verdena (01/03/2025)", "foto aggiunta: Verdena (01/03/2025)"]);
    expect(voci.every(v => !v.annullabile)).toBe(true);
    expect(await codice(a.as.mutation(api.activity.undo, { input: { activityId: voci[0].id } }))).toBe("conflitto");
  });
});

describe("concerto cancellato", () => {
  it("le foto spariscono dalla pagina ma Annulla le riporta al concerto ripristinato", async () => {
    const t = setup();
    const { a, id, aggiungi, pubbliche } = await base(t);
    await aggiungi();
    await a.as.mutation(api.entries.remove, { input: { id, confirm: true } });
    expect(await pubbliche()).toEqual([]);

    const voce = (await a.as.query(api.activity.list, {})).voci.find(v => v.op === "delete" && v.tabella === "entries")!;
    await a.as.mutation(api.activity.undo, { input: { activityId: voce.id } });
    const nuovo = (await a.as.query(api.entries.list, {})).concerts[0].id;
    expect(nuovo).not.toBe(id);
    expect(await pubbliche()).toEqual([expect.objectContaining({ entryId: nuovo })]);
    expect(await a.as.query(api.foto.dellEvento, { input: { entryId: nuovo } })).toMatchObject({ foto: [expect.anything()] });
  });

  it("annullare l'aggiunta del concerto lascia le foto in attesa; rifarla le riporta", async () => {
    const t = setup();
    const { a, aggiungi, pubbliche } = await base(t);
    await aggiungi();
    const aggiunta = (await a.as.query(api.activity.list, {})).voci.find(v => v.op === "create" && v.tabella === "entries")!;
    await a.as.mutation(api.activity.undo, { input: { activityId: aggiunta.id } });
    expect(await pubbliche()).toEqual([]);
    const annullo = (await a.as.query(api.activity.list, {})).voci.find(v => v.op === "delete" && v.tabella === "entries")!;
    await a.as.mutation(api.activity.undo, { input: { activityId: annullo.id } });
    expect(await pubbliche()).toHaveLength(1);
  });

  it("dopo 30 giorni senza Annulla il cron cancella foto e file", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { a, id, aggiungi } = await base(t);
    const { file, miniatura } = await aggiungi();
    await a.as.mutation(api.entries.remove, { input: { id, confirm: true } });
    await t.mutation(internal.foto.pulisciOrfane, {});
    expect(await esiste(t, file)).toBe(true);
    vi.advanceTimersByTime(ORFANE_PER_MS + 60_000);
    await t.mutation(internal.foto.pulisciOrfane, {});
    expect(await esiste(t, file)).toBe(false);
    expect(await esiste(t, miniatura)).toBe(false);
    expect(await t.run(async ctx => (await ctx.db.query("foto").collect()).length)).toBe(0);
  });
});

describe("file orfani", () => {
  it("il cron dei caricamenti mai usati non tocca le foto", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { aggiungi } = await base(t);
    const { file, miniatura } = await aggiungi();
    const mai = await carica(t, jpeg());
    vi.advanceTimersByTime(ORFANI_DOPO_MS + 60_000);
    await t.mutation(internal.gifters.cleanupOrphanLogos, {});
    expect(await esiste(t, file)).toBe(true);
    expect(await esiste(t, miniatura)).toBe(true);
    expect(await esiste(t, mai)).toBe(false);
  });
});
