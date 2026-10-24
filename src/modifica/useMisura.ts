/* ──────────────────────────────────────────────────────────────
   La larghezza della finestra per le soglie di layout.ts, solo nel
   browser: null prima dell'idratazione (lì decidono le media query di
   modifica.css). Si ascoltano solo le soglie con matchMedia, non ogni
   resize: il valore è il gradino (0, 768, 1024, 1280, 1440, 1680).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { SOGLIE } from "./layout.ts";

const GRADINI = [SOGLIE.conPannello, SOGLIE.enorme, SOGLIE.ampio, SOGLIE.largo, SOGLIE.medio] as const;

function gradino(): number {
  for (const g of GRADINI) if (window.matchMedia(`(min-width:${g}px)`).matches) return g;
  return 0;
}

export function useMisura(): number | null {
  const idratata = useHydrated();
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    if (!idratata) return;
    const aggiorna = () => setW(gradino());
    aggiorna();
    const mq = GRADINI.map(g => window.matchMedia(`(min-width:${g}px)`));
    for (const m of mq) m.addEventListener("change", aggiorna);
    return () => {
      for (const m of mq) m.removeEventListener("change", aggiorna);
    };
  }, [idratata]);
  return w;
}
