/* ──────────────────────────────────────────────────────────────
   L'indirizzo di /<handle>/modifica: la vista è l'hash dell'URL,
   `#<vista>[?k=v&…]` (spec ux-modifica §2). Una rotta sola: i dati del
   proprietario si leggono solo nel browser, quindi sotto-rotte non
   darebbero niente di più all'SSR, e i link che girano già (`fix` di
   Convex → #partenze, #account?elimina=1, #agenti, gli e2e) restano
   validi così come sono.

   Puro e senza React (vista.test.ts). Nei parametri passano solo token
   fissi o id opachi di Convex, mai nomi, testo cercato o indirizzi:
   l'URL arriva a PostHog e nelle tracce di Sentry. Tutto il resto si
   scarta in lettura e in scrittura.
   ────────────────────────────────────────────────────────────── */

/** Le viste, nell'ordine del contratto (le stesse 9 di sezioni.ts). */
export const VISTE = ["concerti", "wishlist", "persone", "partenze", "regali", "stile", "agenti", "attivita", "account"] as const;
export type IdVista = (typeof VISTE)[number];

/** Le chiavi ammesse, nell'ordine canonico con cui si scrivono. */
export const CHIAVI = ["nuovo", "apri", "completa", "filtro", "con", "indirizzo", "parte", "elimina"] as const;
export type Chiave = (typeof CHIAVI)[number];
export type Parametri = Partial<Record<Chiave, string>>;

/** `vista: null` = hash vuoto, oppure una vista che non esiste. */
export interface Posizione {
  vista: IdVista | null;
  parametri: Parametri;
}

/** Un id di Convex (o un altro id opaco): niente spazi, accenti, `@`, `/`. */
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const uno = (...valori: string[]) => (v: string) => valori.includes(v);
const id = (v: string) => ID.test(v);

/** Per ogni vista, le sue chiavi e i valori ammessi. */
const AMMESSI: Partial<Record<IdVista, Partial<Record<Chiave, (v: string) => boolean>>>> = {
  concerti: {
    nuovo: uno("concerto", "festival"),
    apri: id,
    completa: uno("1"),
    filtro: uno("programma", "passati", "da-completare", "festival"),
    con: id,
  },
  persone: { apri: id },
  partenze: { indirizzo: id },
  regali: { apri: id },
  agenti: { parte: uno("import") },
  account: { elimina: uno("1") },
};

export const eVista = (s: string): s is IdVista => (VISTE as readonly string[]).includes(s);

/** Solo le chiavi e i valori ammessi per la vista; `completa` vale solo con `apri`. */
function pulisci(vista: IdVista, parametri: Parametri): Parametri {
  const regole = AMMESSI[vista] ?? {};
  const fuori: Parametri = {};
  for (const k of CHIAVI) {
    const v = parametri[k];
    const ok = regole[k];
    if (v !== undefined && v !== "" && ok && ok(v)) fuori[k] = v;
  }
  if (fuori.completa && !fuori.apri) delete fuori.completa;
  return fuori;
}

/** Legge `location.hash` del router (senza `#`; un `#` in testa si tollera). */
export function leggiHash(hash: string): Posizione {
  const h = hash.replace(/^#/, "");
  const i = h.indexOf("?");
  const nome = i === -1 ? h : h.slice(0, i);
  if (!eVista(nome)) return { vista: null, parametri: {} };
  const grezzi: Parametri = {};
  if (i !== -1) {
    for (const [k, v] of new URLSearchParams(h.slice(i + 1))) {
      if ((CHIAVI as readonly string[]).includes(k) && !(k in grezzi)) grezzi[k as Chiave] = v;
    }
  }
  return { vista: nome, parametri: pulisci(nome, grezzi) };
}

/** L'hash (senza `#`) di una vista con i suoi parametri, in ordine canonico. */
export function scriviHash(vista: IdVista, parametri: Parametri = {}): string {
  const p = pulisci(vista, parametri);
  const coppie = CHIAVI.flatMap(k => (p[k] === undefined ? [] : [`${k}=${encodeURIComponent(p[k])}`]));
  return coppie.length ? `${vista}?${coppie.join("&")}` : vista;
}

/** I parametri che aprono un pannello o una finestra sopra la vista. */
export const CHIAVI_PANNELLO: readonly Chiave[] = ["nuovo", "apri", "indirizzo"];
export const haPannello = (p: Parametri) => CHIAVI_PANNELLO.some(k => p[k] !== undefined);
