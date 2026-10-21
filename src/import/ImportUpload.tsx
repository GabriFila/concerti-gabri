/* ──────────────────────────────────────────────────────────────
   Import CSV/JSON (contratto di ondata): file → anteprima con righe ed
   errori → conferma sopra CONFIRM_IMPORT_ROWS → un lotto annullabile.
   Lo implementa la corsia 7; lo usano #agenti e il passo 3 di
   /benvenuto (corsia 3).
   ────────────────────────────────────────────────────────────── */

export interface ImportUploadProps {
  contesto: "agenti" | "onboarding";
  /** Dopo un import riuscito (anche parziale). */
  onImportato?: (esito: { importate: number; totale: number; batchId: string }) => void;
}

export function ImportUpload(_props: ImportUploadProps) {
  return null;
}
