/* ──────────────────────────────────────────────────────────────
   Lo stile della pagina di un profilo (SPEC "Stile", PIANO traguardo 4,
   §1.40): un preset più quattro token, mai CSS libero.

   - `accent`: un colore esadecimale #rrggbb. Diventa la "lampada" della
     pagina (--lamp e le sue sfumature) in scuro; in chiaro se ne usa una
     versione scurita quanto basta per restare leggibile sulla carta;
   - `fontTitoli`: uno dei quattro font in self-hosting (enum);
   - `raggi`: l'arrotondamento degli angoli (enum);
   - `densita`: quanto respira l'impaginazione (enum).

   themeCss() traduce i token in variabili CSS per un <style> nell'HTML
   SSR. In CSS finisce solo ciò che esce da un enum o da un hex già
   validato, quindi nessuna stringa dell'utente arriva mai a una regola. Il
   preset "predefinito" senza token dà la stringa vuota: la pagina resta
   identica a prima, perché styles.css usa queste variabili con i valori di
   sempre come riserva (`var(--font-titoli, 'Fraunces', …)`).

   problemaStile() è il validatore di `profiles.setTheme` (e del tema da
   descrizione): contrasto in chiaro e in scuro, distanza dal colore dei
   concerti in programma, enum e id delle sezioni. I messaggi non ripetono
   mai i valori ricevuti.
   ────────────────────────────────────────────────────────────── */

import { FONT_TITOLI } from "./schema/profile.ts";
import { isSectionId, SECTION_IDS } from "./sections.ts";

export type FontTitoli = (typeof FONT_TITOLI)[number];
export { FONT_TITOLI };

export const RAGGI = ["morbidi", "netti", "tondi"] as const;
export type Raggi = (typeof RAGGI)[number];
export const DENSITA = ["comoda", "compatta", "ariosa"] as const;
export type Densita = (typeof DENSITA)[number];

export const FONT_LABELS: Record<FontTitoli, string> = {
  fraunces: "Fraunces",
  inter: "Inter",
  "space-grotesk": "Space Grotesk",
  "playfair-display": "Playfair Display",
};
export const RAGGI_LABELS: Record<Raggi, string> = { morbidi: "Morbidi", netti: "Netti", tondi: "Tondi" };
export const DENSITA_LABELS: Record<Densita, string> = { comoda: "Comoda", compatta: "Compatta", ariosa: "Ariosa" };

/** La pila CSS di ogni font dei titoli: i nomi coincidono con le @font-face di styles.css. */
export const FONT_CSS: Record<FontTitoli, string> = {
  fraunces: "'Fraunces',Georgia,serif",
  inter: "'Inter',system-ui,sans-serif",
  "space-grotesk": "'Space Grotesk',system-ui,sans-serif",
  "playfair-display": "'Playfair Display',Georgia,serif",
};

/** Raggi: pannelli e card, riquadri (mappa, avvisi), campi. */
const RAGGI_CSS: Record<Raggi, { pannello: string; riquadro: string; campo: string }> = {
  morbidi: { pannello: "14px", riquadro: "12px", campo: "10px" },
  netti: { pannello: "4px", riquadro: "4px", campo: "4px" },
  tondi: { pannello: "26px", riquadro: "22px", campo: "16px" },
};

/** Densità: padding dei pannelli e spazio tra le sezioni. */
const DENSITA_CSS: Record<Densita, { pannello: string; griglia: string }> = {
  comoda: { pannello: "clamp(20px,3vw,32px)", griglia: "clamp(18px,2.6vw,30px)" },
  compatta: { pannello: "clamp(14px,2vw,22px)", griglia: "clamp(12px,1.8vw,20px)" },
  ariosa: { pannello: "clamp(26px,4vw,44px)", griglia: "clamp(24px,3.4vw,42px)" },
};

/** I token risolti: tutti presenti tranne l'accento (assente = la lampada ambra di sempre). */
export interface TokenTema {
  accent?: string;
  fontTitoli: FontTitoli;
  raggi: Raggi;
  densita: Densita;
}

export interface Preset {
  nome: string;
  descrizione: string;
  token: TokenTema;
}

/** I preset. "predefinito" è l'aspetto di sempre; gli altri due cambiano tutti i token. */
export const PRESET = {
  predefinito: {
    nome: "Predefinito",
    descrizione: "La sala buia e la lampada ambra di sempre, titoli in Fraunces.",
    token: { fontTitoli: "fraunces", raggi: "morbidi", densita: "comoda" },
  },
  neon: {
    nome: "Neon",
    descrizione: "Insegna magenta, titoli geometrici, angoli netti e impaginazione compatta.",
    token: { accent: "#ff4fa3", fontTitoli: "space-grotesk", raggi: "netti", densita: "compatta" },
  },
  teatro: {
    nome: "Teatro",
    descrizione: "Velluto rosso, titoli classici, angoli tondi e tanto respiro.",
    token: { accent: "#e2553f", fontTitoli: "playfair-display", raggi: "tondi", densita: "ariosa" },
  },
} as const satisfies Record<string, Preset>;

export type PresetId = keyof typeof PRESET;
export const PRESET_IDS = Object.keys(PRESET) as PresetId[];
export const isPreset = (x: unknown): x is PresetId => typeof x === "string" && Object.hasOwn(PRESET, x);

/** Il tema salvato sul profilo (`profiles.theme`): token facoltativi, stringhe nel DB. */
export interface TemaSalvato {
  preset: string;
  accent?: string;
  fontTitoli?: string;
  raggi?: string;
  densita?: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const isFont = (x: unknown): x is FontTitoli => (FONT_TITOLI as readonly unknown[]).includes(x);
const isRaggi = (x: unknown): x is Raggi => (RAGGI as readonly unknown[]).includes(x);
const isDensita = (x: unknown): x is Densita => (DENSITA as readonly unknown[]).includes(x);

/** I token in vigore: quelli del preset, sovrascritti dai token validi del profilo (i non validi si ignorano). */
export function risolviTema(t?: Partial<TemaSalvato> | null): TokenTema {
  const { preset, accent, fontTitoli, raggi, densita } = t ?? {};
  const base: TokenTema = { ...PRESET[isPreset(preset) ? preset : "predefinito"].token };
  if (typeof accent === "string" && HEX_RE.test(accent)) base.accent = accent.toLowerCase();
  if (isFont(fontTitoli)) base.fontTitoli = fontTitoli;
  if (isRaggi(raggi)) base.raggi = raggi;
  if (isDensita(densita)) base.densita = densita;
  return base;
}

/* ── Colori ─────────────────────────────────────────────────────── */

type Rgb = [number, number, number];

const rgbDi = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hexDi = (c: Rgb): string => "#" + c.map(x => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");

/** Luminanza relativa WCAG 2.x. */
export function luminanza(hex: string): number {
  const [r, g, b] = rgbDi(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapporto di contrasto WCAG tra due colori (1…21). */
export function contrasto(a: string, b: string): number {
  const [hi, lo] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Le superfici su cui l'accento compare come testo o icona (valori di styles.css). */
export const SUPERFICI = {
  scuro: ["#0a0a0b", "#101013", "#16161a"],
  chiaro: ["#fffdf9", "#f6f3ee", "#f4efe7"],
} as const;
/** Contrasto minimo dell'accento su ogni superficie (WCAG per testo grande e grafica). */
export const CONTRASTO_MINIMO = 3;
/** Il teal dei concerti in programma: l'accento deve restarne distinguibile nei grafici. */
const PLANNED = ["#4bb3c4", "#1f93a6"] as const;

export const contrastoMinimo = (hex: string, superfici: readonly string[]) => Math.min(...superfici.map(s => contrasto(hex, s)));

/** Tinta (0…360) e saturazione (0…1) HSL. */
function tinta(hex: string): { h: number; s: number } {
  const [r, g, b] = rgbDi(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

/** L'accento in chiaro: lo stesso colore, scurito a passi finché non regge su tutta la carta. */
export function accentoChiaro(hex: string): string {
  const c = rgbDi(hex);
  for (let i = 0; i <= 20; i++) {
    const x = hexDi(c.map(v => v * (1 - i * 0.05)) as Rgb);
    if (contrastoMinimo(x, SUPERFICI.chiaro) >= CONTRASTO_MINIMO) return x;
  }
  return "#000000";
}

const rgba = (hex: string, a: number) => `rgba(${rgbDi(hex).join(",")},${a})`;

/* ── Validazione ────────────────────────────────────────────────── */

export interface Problema {
  campo: string;
  messaggio: string;
}

/** Il primo problema dell'accento, o null: contrasto in scuro (in chiaro si scurisce da solo) e distanza dal teal. */
export function problemaAccento(hex: string): Problema | null {
  if (!HEX_RE.test(hex)) return { campo: "theme.accent", messaggio: "accent: serve un colore esadecimale #rrggbb" };
  const scuro = contrastoMinimo(hex, SUPERFICI.scuro);
  if (scuro < CONTRASTO_MINIMO) {
    return { campo: "theme.accent", messaggio: `accent: troppo scuro, sul tema scuro non si legge (contrasto ${scuro.toFixed(1)}:1, minimo ${CONTRASTO_MINIMO}:1); scegli un colore più chiaro` };
  }
  const chiaro = contrastoMinimo(accentoChiaro(hex), SUPERFICI.chiaro);
  if (chiaro < CONTRASTO_MINIMO) return { campo: "theme.accent", messaggio: `accent: sul tema chiaro non si legge (minimo ${CONTRASTO_MINIMO}:1)` };
  const a = tinta(hex);
  for (const p of PLANNED) {
    const t = tinta(p);
    const distanza = Math.min(Math.abs(a.h - t.h), 360 - Math.abs(a.h - t.h));
    if (a.s >= 0.2 && distanza < 30) {
      return { campo: "theme.accent", messaggio: "accent: troppo simile al teal dei concerti in programma, nei grafici non si distinguerebbero; scegli un'altra tinta" };
    }
  }
  return null;
}

/** Il validatore di `profiles.setTheme`: il primo problema di tema e layout, o null. */
export function problemaStile(input: { theme?: Partial<TemaSalvato>; layout?: { ordine?: string[]; nascoste?: string[]; titoli?: Record<string, string> } }): Problema | null {
  const t = input.theme;
  if (t) {
    if (!isPreset(t.preset)) return { campo: "theme.preset", messaggio: `preset sconosciuto; i preset sono: ${PRESET_IDS.join(", ")}` };
    if (t.fontTitoli !== undefined && !isFont(t.fontTitoli)) return { campo: "theme.fontTitoli", messaggio: `fontTitoli: uno tra ${FONT_TITOLI.join(", ")}` };
    if (t.raggi !== undefined && !isRaggi(t.raggi)) return { campo: "theme.raggi", messaggio: `raggi: uno tra ${RAGGI.join(", ")}` };
    if (t.densita !== undefined && !isDensita(t.densita)) return { campo: "theme.densita", messaggio: `densita: uno tra ${DENSITA.join(", ")}` };
    if (t.accent !== undefined) {
      const p = problemaAccento(t.accent);
      if (p) return p;
    }
  }
  const l = input.layout;
  if (l) {
    const tutti: [string, string[]][] = [["ordine", l.ordine ?? []], ["nascoste", l.nascoste ?? []], ["titoli", Object.keys(l.titoli ?? {})]];
    for (const [campo, ids] of tutti) {
      if (ids.some(id => !isSectionId(id))) return { campo: `layout.${campo}`, messaggio: `layout.${campo}: sezione sconosciuta; sezioni valide: ${SECTION_IDS.join(", ")}` };
    }
  }
  return null;
}

/* ── CSS ────────────────────────────────────────────────────────── */

/**
 * Le variabili CSS del tema, da mettere in un <style> dopo styles.css.
 * Solo i token diversi da quelli di sempre: "predefinito" senza token dà "".
 * Con l'accento ci sono due regole, scuro (:root) e chiaro, nell'ordine
 * giusto per vincere su quelle di styles.css a parità di specificità.
 */
export function themeCss(t?: Partial<TemaSalvato> | null): string {
  const k = risolviTema(t);
  const base = PRESET.predefinito.token;
  const vars: string[] = [];
  if (k.fontTitoli !== base.fontTitoli) vars.push(`--font-titoli:${FONT_CSS[k.fontTitoli]}`);
  if (k.raggi !== base.raggi) {
    const r = RAGGI_CSS[k.raggi];
    vars.push(`--r-pannello:${r.pannello}`, `--r-riquadro:${r.riquadro}`, `--r-campo:${r.campo}`);
  }
  if (k.densita !== base.densita) {
    const d = DENSITA_CSS[k.densita];
    vars.push(`--pad-pannello:${d.pannello}`, `--gap-griglia:${d.griglia}`);
  }
  const lampada = (hex: string, soft: number, faint: number) => [`--lamp:${hex}`, `--lamp-soft:${rgba(hex, soft)}`, `--lamp-faint:${rgba(hex, faint)}`];
  let chiaro = "";
  if (k.accent && !problemaAccento(k.accent)) {
    vars.push(...lampada(k.accent, 0.5, 0.12));
    chiaro = `[data-theme="light"]{${lampada(accentoChiaro(k.accent), 0.42, 0.15).join(";")}}`;
  }
  return (vars.length ? `:root{${vars.join(";")}}` : "") + chiaro;
}
