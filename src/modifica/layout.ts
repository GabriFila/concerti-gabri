/* ──────────────────────────────────────────────────────────────
   Le misure di /<handle>/modifica (spec ux-modifica §3.1), pure: le
   stesse soglie delle media query di modifica.css, che danno i valori
   dell'SSR finché il browser non le calcola (data-nav, data-oracolo-modo
   su .mf-app).

     compatto  <768     barra in basso + «Altro»   fogli a tutto schermo
     medio     768–1023 binario 72 px              fogli modali a destra
     largo     1024–1279 binario 72 px             pannello accanto, Oracolo agganciato
     ampio     ≥1280    barra laterale 232 px (riducibile a binario)

   Con l'Oracolo agganciato la barra laterale torna binario sotto i 1440
   px, e anche sotto i 1680 se accanto c'è un pannello aperto: barra 232
   + Oracolo 420 + pannello 600 lascerebbero all'elenco meno di 430 px
   (188 a 1440), e il pannello non modale serve proprio a tenerlo in vista.
   ────────────────────────────────────────────────────────────── */

export const SOGLIE = { medio: 768, largo: 1024, ampio: 1280, enorme: 1440, conPannello: 1680 } as const;

export type ModoNav = "schede" | "binario" | "barra";
export type ModoPannello = "foglio" | "laterale-modale" | "laterale";
export type ModoOracolo = "foglio" | "laterale-modale" | "ancorato";

/**
 * La navigazione: schede in basso sul telefono, binario fino a 1280 px,
 * poi la barra laterale, salvo che il proprietario l'abbia ridotta o che
 * l'Oracolo agganciato le rubi lo spazio (sotto i 1440 px, sotto i 1680
 * con un pannello aperto accanto). Il binario che arriva così non è una
 * scelta: non si ricorda, e chiudendo il pannello torna la barra.
 */
export function modoNav(w: number, oracoloAncoratoAperto: boolean, sceltaBinario: boolean, pannelloAperto = false): ModoNav {
  if (w < SOGLIE.medio) return "schede";
  if (w < SOGLIE.ampio) return "binario";
  if (sceltaBinario) return "binario";
  if (oracoloAncoratoAperto && w < SOGLIE.enorme) return "binario";
  if (oracoloAncoratoAperto && pannelloAperto && w < SOGLIE.conPannello) return "binario";
  return "barra";
}

/** I pannelli dei form: foglio a tutto schermo, foglio modale a destra, pannello non modale accanto all'elenco. */
export function modoPannello(w: number): ModoPannello {
  return w < SOGLIE.medio ? "foglio" : w < SOGLIE.largo ? "laterale-modale" : "laterale";
}

/** L'Oracolo in scrittura: come i pannelli, ma da 1024 px sta agganciato a destra. */
export function modoOracolo(w: number): ModoOracolo {
  return w < SOGLIE.medio ? "foglio" : w < SOGLIE.largo ? "laterale-modale" : "ancorato";
}

/** Larghezza dell'Oracolo agganciato. */
export const larghezzaOracolo = (w: number) => (w >= SOGLIE.enorme ? 420 : 380);
