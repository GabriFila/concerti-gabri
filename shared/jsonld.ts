/* ──────────────────────────────────────────────────────────────
   JSON-LD della pagina di un profilo (SPEC §4 "Pagina pubblica
   leggibile", PIANO §6 head()): un `ProfilePage` con la persona e un
   `MusicEvent` per ogni concerto, passati e in programma (un festival ne
   dà uno per set, legato al festival con `superEvent`).

   Dentro ci sono solo artista, data, venue e città, cioè quello che la
   pagina mostra a tutti nell'intestazione di ogni riga. Mai compagni,
   prezzi, regali, partenze, km né commenti: un motore di ricerca non ha
   bisogno di sapere con chi eri né quanto hai speso.

   serializzaJsonLd() scrive la stringa per <script type="application/ld+json">
   con `<`, `>`, `&`, U+2028 e U+2029 in forma \uXXXX: il JSON resta lo
   stesso, ma un nome come "</script><script>…" non chiude mai il tag.
   ────────────────────────────────────────────────────────────── */

import { concertsOf, isFestival, type Entry } from "./model/concert.ts";

const DATA_RE = /^(\d{1,2})(?:–(\d{1,2}))?\/(\d{2})\/(\d{4})$/;

const due = (n: string) => n.padStart(2, "0");

/** "gg/mm/aaaa" → {startDate}; "30–31/03/2017" → {startDate, endDate}; null se non si legge. */
export function dateIso(date: string): { startDate: string; endDate?: string } | null {
  const m = DATA_RE.exec(date.trim());
  if (!m) return null;
  const [, g1, g2, mm, aaaa] = m;
  const startDate = `${aaaa}-${mm}-${due(g1)}`;
  return g2 ? { startDate, endDate: `${aaaa}-${mm}-${due(g2)}` } : { startDate };
}

export interface PaginaPerJsonLd {
  /** URL canonico assoluto della pagina (origine per ambiente, PIANO §1.8). */
  url: string;
  /** URL della pagina principale del profilo, per l'@id della persona (predefinito: `url`). */
  urlProfilo?: string;
  handle: string;
  displayName: string;
  /** I concerti con i nomi (pageToDataset). */
  entries: Entry[];
}

/** L'oggetto JSON-LD (`@graph`) della pagina. */
export function jsonLdPagina({ url, urlProfilo = url, handle, displayName, entries }: PaginaPerJsonLd) {
  const persona = { "@id": `${urlProfilo}#persona` };
  const eventi = entries.flatMap(e =>
    concertsOf(e).flatMap(c => {
      const quando = dateIso(c.date);
      if (!quando) return [];
      return [{
        "@type": "MusicEvent",
        name: isFestival(e) ? `${c.artist} · ${e.name}` : c.artist,
        ...quando,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "MusicVenue", name: c.venue, address: { "@type": "PostalAddress", addressLocality: c.city } },
        performer: { "@type": "MusicGroup", name: c.artist },
        attendee: persona,
        ...(isFestival(e) ? { superEvent: { "@type": "Festival", name: e.name } } : {}),
      }];
    }),
  );
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "ProfilePage", "@id": `${url}#pagina`, url, name: `${displayName} ai concerti`, inLanguage: "it-IT", mainEntity: persona },
      { "@type": "Person", ...persona, name: displayName, alternateName: handle, url: urlProfilo },
      ...eventi,
    ],
  };
}

const ESCAPE: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };

/** JSON per un <script> inline: stessi dati, ma niente che il parser HTML possa leggere come tag. */
export const serializzaJsonLd = (dati: unknown): string => JSON.stringify(dati).replace(/[<>&\u2028\u2029]/g, c => ESCAPE[c]);
