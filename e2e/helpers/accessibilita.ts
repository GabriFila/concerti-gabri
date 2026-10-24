/* ──────────────────────────────────────────────────────────────
   Controlli di accessibilità calcolati nel browser, per l'app di modifica
   (spec ux-modifica §9–10; riconciliazione 6: ciò che un agente può
   controllare da solo, mentre VoiceOver, TalkBack, NVDA e il telefono
   vero restano a Gabri).

   - `contrasti(page, radice)`: ogni testo visibile sotto `radice` (e il
     valore dei campi) contro il suo sfondo effettivo, risalendo gli
     antenati fino a uno sfondo pieno e componendo quelli trasparenti.
     WCAG 1.4.3: 4.5:1, 3:1 per il testo grande (≥ 24 px, o ≥ 18.66 px in
     grassetto) e per i soli simboli (★, ·, ✕: 1.4.11). I colori passano
     da un <canvas> 1×1, così vale ogni formato (oklab, color-mix…).
     Saltati: elementi spenti (1.4.3 li esenta), testo solo per lo screen
     reader (ritagliato o da 1 px), sfondi con immagini o sfumature,
     `escludi`.
   - `bersagliPiccoli(page, radice, minimo)`: i controlli visibili più
     piccoli di `minimo` px (2.5.8; la spec vuole 44 sul telefono). Esenti
     i link in linea in una frase; per una casella conta la sua etichetta, per
     un pulsante steso sulla riga (::after) la riga.
   - `fuocoInvisibile(page)`: l'elemento col focus da tastiera cambia
     aspetto (contorno, ombra, bordo, sfondo o sottolineatura, su di sé o
     su uno dei tre antenati) rispetto a quando non ha il focus (2.4.7);
     prima `senzaTransizioni`, così si legge lo stile finale.
   I risultati sono brevi descrizioni, mai valori dei campi.
   ────────────────────────────────────────────────────────────── */

import type { Page } from "@playwright/test";

export interface Contrasto {
  dove: string;
  testo: string;
  colore: string;
  sfondo: string;
  rapporto: number;
  minimo: number;
}

/** I testi sotto `radice` che non arrivano al contrasto minimo (uno per elemento e coppia di colori). */
export async function contrasti(page: Page, radice: string, escludi: string[] = []): Promise<Contrasto[]> {
  return page.evaluate(([radice, escludi]) => {
    const tela = document.createElement("canvas");
    tela.width = tela.height = 1;
    const cx = tela.getContext("2d", { willReadFrequently: true })!;
    type Rgba = [number, number, number, number];
    const rgba = (c: string): Rgba => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "rgba(0,0,0,0)";
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const sopra = (c: Rgba, sotto: Rgba): Rgba => [0, 1, 2].map(i => c[i] * c[3] + sotto[i] * (1 - c[3])).concat(1) as Rgba;
    const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c: Rgba) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const rapporto = (a: Rgba, b: Rgba) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const hex = (c: Rgba) => `#${c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    const pagina = rgba(getComputedStyle(document.documentElement).backgroundColor);
    const base: Rgba = pagina[3] === 1 ? pagina : sopra(pagina, [255, 255, 255, 1]);

    /** Lo sfondo pieno dietro a `el`, o null se dietro c'è un'immagine o una sfumatura. */
    const sfondoDi = (el: Element): Rgba | null => {
      const strati: Rgba[] = [];
      for (let a: Element | null = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.backgroundImage !== "none" && !(a instanceof HTMLSelectElement)) return null;
        const c = rgba(cs.backgroundColor);
        if (c[3] > 0) strati.push(c);
        if (c[3] === 1) break;
        // un <dialog> nel top layer non sta sopra ai suoi antenati
        if (a instanceof HTMLDialogElement && a.open) break;
      }
      let s = base;
      for (const c of strati.reverse()) s = sopra(c, s);
      return s;
    };
    const opacita = (el: Element) => {
      let o = 1;
      for (let a: Element | null = el; a; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
      return o;
    };
    const nome = (el: Element) => {
      const parti: string[] = [];
      for (let a: Element | null = el, i = 0; a && i < 3; a = a.parentElement, i++) {
        const cls = [...a.classList].slice(0, 2).map(c => `.${c}`).join("");
        parti.unshift(`${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ""}${cls}`);
      }
      return parti.join(" > ");
    };
    /** Solo per lo screen reader: ritagliato (`.mf-sr`, il titolo nel binario) o grande un pixel. */
    const nascosto = (el: Element) => {
      for (let a: Element | null = el, i = 0; a && i < 4; a = a.parentElement, i++) {
        const cs = getComputedStyle(a);
        if ((cs.clip !== "auto" && cs.clip !== "") || cs.clipPath !== "none") return true;
        const r = a.getBoundingClientRect();
        if (cs.overflow === "hidden" && (r.width <= 1 || r.height <= 1)) return true;
      }
      return false;
    };
    const saltato = (el: Element) =>
      !!el.closest([":disabled", '[aria-disabled="true"]', "svg", ...escludi].join(",")) ||
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) ||
      nascosto(el);

    const fuori: Contrasto[] = [];
    const visti = new Set<string>();
    const controlla = (el: Element, testo: string) => {
      const cs = getComputedStyle(el);
      const fg = rgba(cs.color);
      fg[3] *= opacita(el);
      if (fg[3] === 0) return;
      const bg = sfondoDi(el);
      if (!bg) return;
      const colore = sopra(fg, bg);
      const r = rapporto(colore, bg);
      const px = parseFloat(cs.fontSize);
      const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      const simboli = !/[\p{L}\p{N}]/u.test(testo);
      const minimo = grande || simboli ? 3 : 4.5;
      if (r + 0.005 >= minimo) return;
      const chiave = `${nome(el)}|${hex(colore)}|${hex(bg)}`;
      if (visti.has(chiave)) return;
      visti.add(chiave);
      fuori.push({ dove: nome(el), testo: testo.slice(0, 40), colore: hex(colore), sfondo: hex(bg), rapporto: Math.round(r * 100) / 100, minimo });
    };

    for (const r of document.querySelectorAll(radice)) {
      const giro = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      for (let n = giro.nextNode(); n; n = giro.nextNode()) {
        const testo = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        const el = n.parentElement;
        if (!testo || !el || saltato(el)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const b = range.getBoundingClientRect();
        if (b.width * b.height < 4) continue;
        controlla(el, testo);
      }
      // il valore scritto nei campi (non i segnaposto)
      for (const c of r.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
        if (c instanceof HTMLInputElement && /^(hidden|checkbox|radio|color|file|range|button|submit)$/.test(c.type)) continue;
        const valore = c instanceof HTMLSelectElement ? (c.selectedOptions[0]?.text ?? "") : c.value;
        if (!valore.trim() || saltato(c)) continue;
        controlla(c, "(valore del campo)");
      }
    }
    return fuori;
  }, [radice, escludi] as const);
}

export interface Bersaglio {
  dove: string;
  nome: string;
  larghezza: number;
  altezza: number;
}

/** I controlli visibili sotto `radice` più piccoli di `minimo` px in larghezza o altezza. */
export async function bersagliPiccoli(page: Page, radice: string, minimo: number, escludi: string[] = []): Promise<Bersaglio[]> {
  return page.evaluate(([radice, minimo, escludi]) => {
    const fuori: Bersaglio[] = [];
    const nome = (el: Element) => {
      const parti: string[] = [];
      for (let a: Element | null = el, i = 0; a && i < 2; a = a.parentElement, i++) {
        const cls = [...a.classList].slice(0, 2).map(c => `.${c}`).join("");
        parti.unshift(`${a.tagName.toLowerCase()}${cls}`);
      }
      return parti.join(" > ");
    };
    const CONTROLLI = 'a[href], button, select, summary, input:not([type="hidden"]), textarea, [role="button"], [role="menuitem"], [role="radio"], [role="switch"]';
    for (const r of document.querySelectorAll(radice)) {
      for (const el of r.querySelectorAll(CONTROLLI)) {
        if (escludi.length && el.closest(escludi.join(","))) continue;
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const b = el.getBoundingClientRect();
        if (b.width * b.height <= 4) continue; // solo per lo screen reader
        // un link (o un pulsante fatto a link) dentro una frase (2.5.8, eccezione "in linea")
        if (getComputedStyle(el).display === "inline") continue;
        // un radio o una casella dentro la loro etichetta: conta l'etichetta;
        // un pulsante steso su tutta la riga col suo ::after (`.mf-riga-apri`): conta la riga
        const dopo = getComputedStyle(el, "::after");
        const steso = dopo.content !== "none" && dopo.position === "absolute";
        const blocco = steso ? (getComputedStyle(el).position !== "static" ? el : (el as HTMLElement).offsetParent) : null;
        const misura = (el instanceof HTMLInputElement && /^(radio|checkbox)$/.test(el.type) && el.closest("label"))
          ? el.closest("label")!.getBoundingClientRect()
          : blocco ? blocco.getBoundingClientRect() : b;
        if (misura.width + 0.5 >= minimo && misura.height + 0.5 >= minimo) continue;
        const etichetta = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        fuori.push({ dove: nome(el), nome: etichetta, larghezza: Math.round(misura.width), altezza: Math.round(misura.height) });
      }
    }
    return fuori;
  }, [radice, minimo, escludi] as const);
}

/** Lo stile che fa vedere il focus, sull'elemento e su tre antenati (la riga di un pulsante steso). */
const ASPETTO = ["outline-style", "outline-width", "outline-color", "box-shadow", "border-top-color", "border-bottom-color", "background-color", "text-decoration-line"] as const;

/** Senza transizioni: lo stile letto subito dopo il cambio di focus è quello finale (prima di `fuocoInvisibile`). */
export async function senzaTransizioni(page: Page): Promise<void> {
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
}

/**
 * L'elemento che ha adesso il focus (da tastiera) si vede: confronta il suo
 * aspetto con il focus e senza. Restituisce la descrizione dell'elemento se
 * niente cambia, null se il focus si vede (o se non c'è un elemento).
 */
export async function fuocoInvisibile(page: Page): Promise<string | null> {
  return page.evaluate(proprieta => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const catena: Element[] = [];
    for (let a: Element | null = el; a && catena.length < 4; a = a.parentElement) catena.push(a);
    const foto = () => catena.map(a => { const cs = getComputedStyle(a); return proprieta.map(p => cs.getPropertyValue(p)).join("|"); }).join("§");
    const con = foto();
    el.blur();
    const senza = foto();
    el.focus({ preventScroll: true });
    if (con !== senza) return null;
    const cls = [...el.classList].slice(0, 2).map(c => `.${c}`).join("");
    const etichetta = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls} «${etichetta}»`;
  }, [...ASPETTO]);
}
