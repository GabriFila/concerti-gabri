/* "Esci" (PIANO §1.39): nel footer delle pagine e in #account, visibile
   solo a chi è entrato. Esce e ricarica la pagina per intero. */

import { useState } from "react";
import { esci } from "../lib/auth-client.ts";
import { useViewer } from "../lib/viewer.ts";

export function BottoneEsci({ verso, className = "acc-link" }: { verso?: string; className?: string }) {
  const [attesa, setAttesa] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={attesa}
      onClick={async () => {
        setAttesa(true);
        try {
          await esci(verso);
        } catch {
          setAttesa(false);
        }
      }}
    >
      Esci
    </button>
  );
}

/** La riga "Esci" del footer: niente per i visitatori anonimi. */
export function EsciFooter() {
  const viewer = useViewer();
  if (!viewer) return null;
  return (
    <p className="acc-footer-esci">
      <BottoneEsci />
    </p>
  );
}
