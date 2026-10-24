/* Gli errori di Convex come li legge il modello dell'Oracolo in scrittura
   (strumenti del catalogo e propose_concert): solo `{code, messaggio,
   campo?, fix?}`. Convex non ripete mai i valori ricevuti nei messaggi e
   `campo` è un percorso (shared/schema/errors.ts `percorsoSicuro`); il resto
   dell'errore (stack, "Args: …") non esce mai. */

export interface ErroreLeggibile {
  code: string;
  messaggio: string;
  campo?: string;
  fix?: string;
}

export function erroreLeggibile(e: unknown): ErroreLeggibile {
  const data = (e as { data?: unknown })?.data;
  if (data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string") {
    const d = data as { code: string; messaggio?: unknown; campo?: unknown; fix?: unknown };
    return {
      code: d.code,
      messaggio: String(d.messaggio ?? ""),
      ...(typeof d.campo === "string" ? { campo: d.campo } : {}),
      ...(typeof d.fix === "string" ? { fix: d.fix } : {}),
    };
  }
  return { code: "errore", messaggio: "operazione non riuscita, riprova" };
}
