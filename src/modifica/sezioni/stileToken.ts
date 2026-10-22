/* ──────────────────────────────────────────────────────────────
   I token dello stile per #stile (T5): preset, font dei titoli, raggi,
   densità e il controllo dell'accento.

   La fonte vera è shared/theme.ts della corsia 4 (preset, `risolviTema`,
   `problemaAccento`, il validatore di profiles.setTheme), che in questo
   worktree non c'è ancora. Questo file ne è uno specchio minimo con gli
   stessi nomi e valori: all'integrazione diventa
     export { … } from "../../../shared/theme.ts";
   e Stile.tsx resta com'è. Il server valida comunque ogni salvataggio.
   ────────────────────────────────────────────────────────────── */

import { FONT_TITOLI } from "../../../shared/schema/profile.ts";

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

/** La pila CSS di ogni font dei titoli (le @font-face stanno in styles.css). */
export const FONT_CSS: Record<FontTitoli, string> = {
  fraunces: "'Fraunces',Georgia,serif",
  inter: "'Inter',system-ui,sans-serif",
  "space-grotesk": "'Space Grotesk',system-ui,sans-serif",
  "playfair-display": "'Playfair Display',Georgia,serif",
};

/** Per l'anteprima: raggio e padding di un pannello. */
export const RAGGI_CSS: Record<Raggi, string> = { morbidi: "14px", netti: "4px", tondi: "26px" };
export const DENSITA_CSS: Record<Densita, string> = { comoda: "22px", compatta: "14px", ariosa: "32px" };

export interface TokenTema {
  accent?: string;
  fontTitoli: FontTitoli;
  raggi: Raggi;
  densita: Densita;
}

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
} as const satisfies Record<string, { nome: string; descrizione: string; token: TokenTema }>;

export type PresetId = keyof typeof PRESET;
export const PRESET_IDS = Object.keys(PRESET) as PresetId[];
export const isPreset = (x: unknown): x is PresetId => typeof x === "string" && Object.hasOwn(PRESET, x);

/** Il tema salvato sul profilo (`profiles.theme`). */
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

/** I token in vigore: quelli del preset, sovrascritti da quelli validi del profilo. */
export function risolviTema(t?: Partial<TemaSalvato> | null): TokenTema {
  const { preset, accent, fontTitoli, raggi, densita } = t ?? {};
  const base: TokenTema = { ...PRESET[isPreset(preset) ? preset : "predefinito"].token };
  if (typeof accent === "string" && HEX_RE.test(accent)) base.accent = accent.toLowerCase();
  if (isFont(fontTitoli)) base.fontTitoli = fontTitoli;
  if (isRaggi(raggi)) base.raggi = raggi;
  if (isDensita(densita)) base.densita = densita;
  return base;
}

/* ── colori ───────────────────────────────────────────────────── */

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

/** Le superfici su cui l'accento compare come testo o icona (styles.css). */
export const SUPERFICI = {
  scuro: ["#0a0a0b", "#101013", "#16161a"],
  chiaro: ["#fffdf9", "#f6f3ee", "#f4efe7"],
} as const;
export const CONTRASTO_MINIMO = 3;
/** Il teal dei concerti in programma: l'accento deve restarne distinguibile. */
const PLANNED = ["#4bb3c4", "#1f93a6"] as const;

export const contrastoMinimo = (hex: string, superfici: readonly string[]) => Math.min(...superfici.map(s => contrasto(hex, s)));

function tinta(hex: string): { h: number; s: number } {
  const [r, g, b] = rgbDi(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

/** L'accento in chiaro: lo stesso colore, scurito a passi finché regge sulla carta. */
export function accentoChiaro(hex: string): string {
  const c = rgbDi(hex);
  for (let i = 0; i <= 20; i++) {
    const x = hexDi(c.map(v => v * (1 - i * 0.05)) as Rgb);
    if (contrastoMinimo(x, SUPERFICI.chiaro) >= CONTRASTO_MINIMO) return x;
  }
  return "#000000";
}

export interface Problema {
  campo: string;
  messaggio: string;
}

/** Il problema dell'accento, o null: contrasto in scuro (in chiaro si scurisce da solo) e distanza dal teal. */
export function problemaAccento(hex: string): Problema | null {
  const p = (messaggio: string): Problema => ({ campo: "theme.accent", messaggio: `accent: ${messaggio}` });
  if (!HEX_RE.test(hex)) return p("serve un colore esadecimale #rrggbb");
  const scuro = contrastoMinimo(hex, SUPERFICI.scuro);
  if (scuro < CONTRASTO_MINIMO) {
    return p(`troppo scuro, sul tema scuro non si legge (contrasto ${scuro.toFixed(1)}:1, minimo ${CONTRASTO_MINIMO}:1); scegli un colore più chiaro`);
  }
  if (contrastoMinimo(accentoChiaro(hex), SUPERFICI.chiaro) < CONTRASTO_MINIMO) return p(`sul tema chiaro non si legge (minimo ${CONTRASTO_MINIMO}:1)`);
  const a = tinta(hex);
  for (const t of PLANNED.map(tinta)) {
    const distanza = Math.min(Math.abs(a.h - t.h), 360 - Math.abs(a.h - t.h));
    if (a.s >= 0.2 && distanza < 30) {
      return p("troppo simile al teal dei concerti in programma, nei grafici non si distinguerebbero; scegli un'altra tinta");
    }
  }
  return null;
}
