/* Le sezioni di "I dati": fonte unica per il TOC (che aggiunge le icone) e per
   lo strumento `go_to_section` dell'Oracolo. Gli id `sec-*` sono fissi. Una
   sezione può mancare dalla pagina (sec-commenti c'è solo se almeno un evento
   ha un commento): il TOC si risolve sul DOM e `go_to_section` dà ok:false. */

import { etichetta, type EtichettaId, type Forma } from "./labels.ts";

export const SECTIONS = [
  { id: "sec-kpis", label: "Riepilogo" },
  { id: "sec-andamento", label: "Andamento" },
  { id: "sec-mappa", label: "Dove sono andato" },
  { id: "sec-artisti", label: "Chi ho visto di più" },
  { id: "sec-compagni", label: "Con chi vado di più" },
  { id: "sec-venue", label: "Dove torno più spesso" },
  { id: "sec-vicinanza", label: "Quanto sono vicino" },
  { id: "sec-stagionalita", label: "Quando vado" },
  { id: "sec-giorni", label: "Che giorno esco" },
  { id: "sec-voti", label: "Come li giudico" },
  { id: "sec-voti-migliori", label: "I migliori" },
  { id: "sec-voti-vs", label: "Voto a confronto" },
  { id: "sec-canzoni", label: "Quante canzoni conosco" },
  { id: "sec-spesa", label: "Quanto spendo" },
  { id: "sec-spesa-dettaglio", label: "Quando ho speso di più" },
  { id: "sec-spesa-distribuzione", label: "Quanto pago di solito" },
  { id: "sec-trend", label: "Come cambia nel tempo" },
  { id: "sec-commenti", label: "I miei commenti" }, // nascosta se nessun evento ha un commento
  { id: "sec-archivio", label: "Archivio" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const SECTION_IDS = SECTIONS.map(s => s.id) as [SectionId, ...SectionId[]];

export const sectionLabel = (id: string): string | undefined => SECTIONS.find(s => s.id === id)?.label;

/* ── Etichette per forma e layout del profilo (traguardo 4, PIANO §1.35) ──
   SECTIONS qui sopra resta l'elenco fisso con le etichette della forma `m`.
   Due titoli cambiano con la forma grammaticale (shared/labels.ts); il
   layout del profilo sceglie ordine, sezioni nascoste e titoli propri.
   "Riepilogo" (sec-kpis) sta nel palco in cima alla pagina: resta il primo,
   qualunque sia l'ordine scelto, ma si può nascondere e rinominare. */

const PER_FORMA: Partial<Record<SectionId, EtichettaId>> = { "sec-mappa": "secMappa", "sec-vicinanza": "secVicinanza" };

/** L'etichetta di una sezione nella forma data (undefined se l'id non esiste). */
export const sectionLabelFor = (id: string, forma: Forma): string | undefined => {
  const k = PER_FORMA[id as SectionId];
  return k ? etichetta(k, forma) : sectionLabel(id);
};

/** Il layout de "I dati" salvato sul profilo (`profiles.layout`). */
export interface LayoutSezioni {
  ordine: string[];
  nascoste: string[];
  titoli: Record<string, string>;
}

export interface SezioneDelProfilo {
  id: SectionId;
  /** Il titolo da mostrare: quello scelto dal profilo, altrimenti quello della forma. */
  label: string;
  /** true se il titolo è personalizzato. */
  proprio: boolean;
}

export const isSectionId = (id: string): id is SectionId => (SECTION_IDS as string[]).includes(id);

/** Il titolo di una sezione per un profilo (anche se nascosta): personalizzato o della forma. */
export function titoloSezione(id: SectionId, forma: Forma, layout?: Partial<LayoutSezioni> | null): string {
  const proprio = layout?.titoli?.[id]?.trim();
  return proprio || sectionLabelFor(id, forma) || id;
}

/** Le sezioni VISIBILI de "I dati" di un profilo, nell'ordine della pagina. */
export function sezioniDelProfilo(forma: Forma, layout?: Partial<LayoutSezioni> | null): SezioneDelProfilo[] {
  const nascoste = new Set(layout?.nascoste ?? []);
  const scelte = [...new Set((layout?.ordine ?? []).filter(isSectionId))].filter(id => id !== "sec-kpis");
  const ordine: SectionId[] = ["sec-kpis", ...scelte, ...SECTION_IDS.filter(id => id !== "sec-kpis" && !scelte.includes(id))];
  return ordine
    .filter(id => !nascoste.has(id))
    .map(id => ({ id, label: titoloSezione(id, forma, layout), proprio: !!layout?.titoli?.[id]?.trim() }));
}

/** go_to_section sul profilo: `visibile` è falso per una sezione nascosta dal
    layout (o un id sconosciuto), e allora lo Shell risponde ok:false senza
    cercarla nel DOM; `label` è il titolo che il profilo le dà. */
export function bersaglioSezione(id: string, forma: Forma, layout?: Partial<LayoutSezioni> | null): { visibile: boolean; label: string } {
  return {
    visibile: sezioniDelProfilo(forma, layout).some(s => s.id === id),
    label: isSectionId(id) ? titoloSezione(id, forma, layout) : id,
  };
}
