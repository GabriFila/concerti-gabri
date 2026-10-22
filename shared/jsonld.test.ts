/* JSON-LD della pagina (shared/jsonld.ts): un MusicEvent per concerto,
   nessun dato privato (compagni, prezzi, commenti, viaggi), `<` mai in
   chiaro dentro lo <script>. */

import { describe, expect, it } from "vitest";
import type { Entry } from "./model/concert.ts";
import { flatConcerts } from "./model/concert.ts";
import { ALLDATA, PEOPLE } from "./seed/gabrifila.ts";
import { dateIso, jsonLdPagina, serializzaJsonLd } from "./jsonld.ts";

const URL_PAGINA = "https://concerti.gabrifila.me/gabrifila";
const entries = ALLDATA as unknown as Entry[];
const ld = jsonLdPagina({ url: URL_PAGINA, handle: "gabrifila", displayName: "Gabri", entries });
const grafo = ld["@graph"] as Record<string, any>[];
const eventi = grafo.filter(n => n["@type"] === "MusicEvent");

describe("dateIso", () => {
  it("un giorno, più giorni, date illeggibili", () => {
    expect(dateIso("05/03/2024")).toEqual({ startDate: "2024-03-05" });
    expect(dateIso("5/03/2024")).toEqual({ startDate: "2024-03-05" });
    expect(dateIso("30–31/03/2017")).toEqual({ startDate: "2017-03-30", endDate: "2017-03-31" });
    expect(dateIso("2024-03-05")).toBeNull();
    expect(dateIso("")).toBeNull();
  });
});

describe("jsonLdPagina per gabrifila", () => {
  it("ProfilePage e Person in testa, poi un MusicEvent per concerto (festival compresi)", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(grafo[0]).toMatchObject({ "@type": "ProfilePage", url: URL_PAGINA, name: "Gabri ai concerti", mainEntity: { "@id": `${URL_PAGINA}#persona` } });
    expect(grafo[1]).toMatchObject({ "@type": "Person", "@id": `${URL_PAGINA}#persona`, name: "Gabri", alternateName: "gabrifila" });
    expect(eventi).toHaveLength(flatConcerts(entries).length);
    expect(eventi.length).toBe(91);
  });

  it("ogni evento ha nome, data ISO, venue con città, artista e chi c'era (la persona della pagina)", () => {
    for (const ev of eventi) {
      expect(ev.name).toBeTruthy();
      expect(ev.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ev.location).toMatchObject({ "@type": "MusicVenue", address: { "@type": "PostalAddress" } });
      expect(ev.location.name).toBeTruthy();
      expect(ev.location.address.addressLocality).toBeTruthy();
      expect(ev.performer["@type"]).toBe("MusicGroup");
      expect(ev.attendee).toEqual({ "@id": `${URL_PAGINA}#persona` });
    }
    const festival = eventi.filter(e => e.superEvent);
    expect(festival.length).toBeGreaterThanOrEqual(4);
    for (const f of festival) expect(f.superEvent["@type"]).toBe("Festival");
  });

  it("mai compagni, prezzi, regali, partenze, km o commenti", () => {
    const testo = JSON.stringify(ld);
    for (const chiave of ["with", "cost", "price", "offers", "gift", "giftFrom", "accredito", "from", "km", "comments", "comment", "review", "voto", "geo"]) {
      expect(testo).not.toContain(`"${chiave}"`);
    }
    // nessun nome dei compagni (alcuni coincidono con parole comuni: solo quelli lunghi e unici)
    for (const p of PEOPLE.filter(p => p.length >= 5 && p !== "Mamma")) expect(testo, p).not.toContain(`"${p}"`);
    expect(testo).not.toContain("Cami <3");
    // il testo di un commento del seed
    expect(testo).not.toContain("Pure brunori");
    // l'indirizzo o le coordinate non ci sono mai: niente numeri con la virgola
    expect(testo).not.toMatch(/\d+\.\d{3,}/);
  });
});

describe("serializzaJsonLd", () => {
  const cattivo = {
    y: 2025, date: "01/02/2025", venue: "Sala <b>", city: "A&B", artist: "</script><script>alert(1)</script>",
    with: [], comments: "segreto",
  } as unknown as Entry;
  const s = serializzaJsonLd(jsonLdPagina({ url: "https://x.example/e2e", handle: "e2e", displayName: "Io \u2028 te", entries: [cattivo] }));

  it("niente <, >, & né separatori di riga Unicode in chiaro", () => {
    expect(s).not.toMatch(/[<>&\u2028\u2029]/);
    expect(s).toContain("\\u003c/script\\u003e");
  });

  it("lo stesso JSON di prima, una volta letto", () => {
    const letto = JSON.parse(s);
    const ev = letto["@graph"][2];
    expect(ev.name).toBe("</script><script>alert(1)</script>");
    expect(ev.location.name).toBe("Sala <b>");
    expect(ev.location.address.addressLocality).toBe("A&B");
    expect(letto["@graph"][1].name).toBe("Io \u2028 te");
    expect(s).not.toContain("segreto");
  });
});
