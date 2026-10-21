/* Le sezioni di "I dati": fonte unica per il TOC (che aggiunge le icone) e per
   lo strumento `go_to_section` dell'Oracolo. Gli id `sec-*` sono fissi. Una
   sezione può mancare dalla pagina (sec-commenti c'è solo se almeno un evento
   ha un commento): il TOC si risolve sul DOM e `go_to_section` dà ok:false. */

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
