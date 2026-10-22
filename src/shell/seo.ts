/* ──────────────────────────────────────────────────────────────
   Quello che la pagina di un profilo dice di sé fuori dal browser (PIANO
   §1.8, §1.41, §6 head()): titolo, descrizione, Open Graph e Twitter,
   canonical, JSON-LD e manifest. Lo usano head() di routes/$handle.tsx e
   l'immagine OG (routes/og/$handle.ts), con gli stessi numeri delle card
   KPI della pagina (stesso `now`).

   L'origine canonica (PIANO §1.8) non si calcola qui: questo modulo sta
   anche nel bundle del browser. La legge il server nel loader di root
   (root/rootData.ts, la stessa di /mcp) e arriva a head() con i dati di
   root, uguale in SSR e in idratazione; l'immagine OG la legge sul server.
   ────────────────────────────────────────────────────────────── */

import { jsonLdPagina, serializzaJsonLd } from "../../shared/jsonld.ts";
import { isPlanned, todayKey } from "../../shared/lib/dates.ts";
import { concertsOf, type Entry } from "../../shared/model/concert.ts";
import { siteTitle } from "../root/title.ts";

export interface Riassunto {
  concerti: number;
  inProgramma: number;
  artisti: number;
  citta: number;
}

/**
 * I numeri delle card KPI "Concerti", "In programma", "Artisti diversi" e
 * "Città", senza filtri: stesse unità di shared/lib/kpis.ts (concerti per
 * set, città per evento), qui senza il resto dei KPI, perché head() sta nel
 * bundle d'ingresso. seo.test.ts li confronta con computeKpis.
 */
export function riassunto(entries: Entry[], now: number): Riassunto {
  const today = todayKey(now);
  const visti = entries.filter(e => !isPlanned(e, today));
  const concerti = entries.flatMap(concertsOf);
  const set = concerti.filter(c => !isPlanned(c, today));
  return {
    concerti: set.length,
    inProgramma: concerti.length - set.length,
    artisti: new Set(set.map(c => c.artist)).size,
    citta: new Set(visti.map(e => e.city)).size,
  };
}

const conta = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

/** "I concerti di Gabri: 80 visti, 11 in programma, 50 artisti diversi, 13 città." (senza participi marcati: vale per ogni forma). */
export function descrizione(displayName: string, r: Riassunto): string {
  const parti = [
    r.concerti ? conta(r.concerti, "visto", "visti") : "",
    r.inProgramma ? `${r.inProgramma} in programma` : "",
    r.artisti ? conta(r.artisti, "artista", "artisti diversi") : "",
    r.citta ? `${r.citta} città` : "",
  ].filter(Boolean);
  return `I concerti di ${displayName}: ${parti.length ? parti.join(", ") : "la pagina è ancora vuota"}.`;
}

export interface DatiTesta {
  handle: string;
  displayName: string;
  /** "/gabrifila" oppure "/gabrifila/dati". */
  percorso: string;
  entries: Entry[];
  now: number;
  /** L'origine canonica del deployment (RootData.origine), senza barra finale. */
  origine: string;
}

/** meta, link e script di head() per la pagina di un profilo. */
export function testaPagina({ handle, displayName, percorso, entries, now, origine }: DatiTesta) {
  const url = origine + percorso;
  const titolo = `${displayName} ai concerti`;
  const testo = descrizione(displayName, riassunto(entries, now));
  const immagine = `${origine}/og/${handle}`;
  const jsonLd = jsonLdPagina({ url, urlProfilo: `${origine}/${handle}`, handle, displayName, entries });
  return {
    meta: [
      { title: siteTitle(titolo) },
      { name: "description", content: testo },
      { property: "og:type", content: "profile" },
      { property: "og:site_name", content: "Concerti" },
      { property: "og:locale", content: "it_IT" },
      { property: "og:title", content: titolo },
      { property: "og:description", content: testo },
      { property: "og:url", content: url },
      { property: "og:image", content: immagine },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: testo },
      { property: "profile:username", content: handle },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: titolo },
      { name: "twitter:description", content: testo },
      { name: "twitter:image", content: immagine },
    ],
    links: [
      { rel: "canonical", href: url },
      // §1.41: "<nome> ai concerti", start_url /<handle> (il root non ne mette un altro)
      { rel: "manifest", href: `/${handle}/manifest.webmanifest` },
    ],
    scripts: [{ type: "application/ld+json", children: serializzaJsonLd(jsonLd) }],
  };
}
