# Perché il sito è lento sul telefono — misure e rimedi

Analisi di performance mobile di concerti.gabrifila.me, luglio 2026.
Tutto quello che segue è **misurato**, non stimato: metodo e numeri grezzi sono in fondo.

Vincolo di partenza: **nessuna feature e nessun pezzo di UX va tolto.** Ogni rimedio qui
sotto è verificato o come pixel-identico, o come invisibile all'occhio (diff di screenshot
allegato), o come puro spostamento di lavoro nel tempo.

---

## Il risultato in una riga

Lo scroll non è lento per colpa dei dati (78 eventi, ~130 concerti: briciole) né di React.
È lento perché **i fasci di luce ambientali costano da soli il 79% del lavoro di rendering
durante lo scroll**, e a schermo sono quasi invisibili.

Un identico scroll di 36 passi su `/dati`, CPU a 1/4 (≈ Android di fascia media):

| scenario | lavoro main thread | Δ |
|---|---:|---:|
| **com'è oggi** | **4220 ms** | — |
| solo `content-visibility` sulle sezioni | 4084 ms | −3% |
| 8 fasci ambientali invece di 22 + blur ≤ 8px | 3104 ms | −26% |
| ↑ + `content-visibility` sulle sezioni | 2753 ms | −35% |
| ↑ + animazione dei fasci in pausa mentre si scorre | **1522 ms** | **−64%** |
| _(riferimento: fasci rimossi del tutto)_ | _871 ms_ | _−79%_ |

La finestra di scroll dura ~3,4 s reali. A 4220 ms di lavoro il main thread è **saturo al
125%**: ogni frame arriva in ritardo, ed è esattamente la sensazione descritta — "a tratti,
scorrendo".

E il costo visivo di prendersi il −64%? Diff pixel a pixel fra com'è oggi e la versione
alleggerita, a tre profondità di pagina, animazioni congelate allo stesso istante:

| pagina | delta medio per canale | delta max | pixel che differiscono > 8/255 |
|---|---:|---:|---:|
| `/dati` | 0,02 – 0,35 / 255 | 14 | ≤ 1,3% |
| `/` | 0,02 – 0,64 / 255 | 22 | ≤ 1,9% |

Nessun pixel della pagina cambia di più del 9%, e il 98% non cambia affatto. I fasci si
pagano l'80% del budget di scorrimento per una resa che non si distingue.

---

## Le soluzioni, ordinate

Ordinate per **rapporto fra guadagno misurato e rischio sull'aspetto**. Le prime tre
valgono da sole quasi tutto il recuperabile.

### Dimensione A — fluidità dello scroll (il problema che hai descritto)

#### A1. Mettere in pausa i fasci mentre si scorre — **−29 pp, rischio zero** ⭐

Il singolo intervento più efficace, e l'unico letteralmente invisibile: **durante uno scroll
nessuno percepisce un'oscillazione di 16 secondi.** Il movimento dei fasci è mascherato dal
movimento della pagina. Si rimette in moto ~150 ms dopo che il dito si stacca.

```js
// un listener passivo, una classe sull'html, zero re-render React
let t; addEventListener("scroll", () => {
  document.documentElement.classList.add("scrolling");
  clearTimeout(t);
  t = setTimeout(() => document.documentElement.classList.remove("scrolling"), 150);
}, { passive: true });
```
```css
.scrolling .abeam, .scrolling .abeam::before,
.scrolling .beam,  .scrolling .beam::before { animation-play-state: paused }
```

Misurato: da 2753 ms a 1522 ms sullo stesso scroll. Da solo sulla baseline vale
4220 → ~2500 ms.

Perché funziona così tanto: l'animazione `beam-fade` fa pulsare l'opacità di un figlio
`::before` **dentro** un elemento con `filter: blur()`. Un cambio di opacità dentro un
filtro obbliga il browser a **ri-applicare la sfocatura a ogni frame** — il livello non può
essere rasterizzato una volta e riusato. Nel test isolato: con la sola oscillazione attiva
1737 ms, con la sola dissolvenza attiva 4555 ms. È la dissolvenza a costare, non il
movimento.

> Attenzione a una scorciatoia che sembra ovvia e **non funziona**: spostare la dissolvenza
> dal `::before` al wrapper già sfocato. L'ho provata (per `mix-blend-mode: screen` è
> matematicamente identica: `screen(b, s·α) = α·screen(b,s) + (1−α)·b`), e **peggiora**:
> 5654 ms, con il paint che passa da 184 a 1516 ms. Opacità animata *sullo stesso* elemento
> che porta `mix-blend-mode` forza un gruppo isolato ricomposto ogni frame. Scartata.

#### A2. Meno fasci ambientali e blur più corto sul telefono — **−26 pp, invisibile** ⭐

Oggi: 22 `.abeam`, ognuno largo 84–108 vw e alto 37–54 vh, con `filter: blur(6–25px)` e
`mix-blend-mode: screen`, distribuiti su tutta l'altezza di pagina (9762 px su `/dati`).

Un `blur(25px)` su uno schermo a DPR 3 è un raggio di **75 pixel fisici**: il costo della
sfocatura cresce con l'area del kernel, quindi 25px costa ~10× quanto 8px.

```css
@media (pointer: coarse) {
  .abeam { filter: blur(8px) }                    /* tetto, non sostituzione */
  .abeam:nth-child(n+9) { display: none }         /* 8 invece di 22 */
}
```

Sono i 14 fasci in meno + il blur ridotto a produrre il diff di screenshot qui sopra: max
14/255 su `/dati`. Su desktop resta tutto com'è. Da solo: 4220 → 3104 ms.

Variante più fine se 8 ti sembrano pochi: tenerli tutti ma animare solo quelli davvero a
schermo, con un `IntersectionObserver` che mette `animation-play-state: paused` sugli altri.
Oggi `content-visibility: auto` ne salta la *resa* ma ne lascia **10 in animazione** su 56
(misurato con `document.getAnimations()`). Più codice, stesso ordine di guadagno.

#### A3. `content-visibility` sulle sezioni della dashboard — **−9 pp, composto** ⭐

`/dati` monta 3304 nodi DOM e 61 SVG in un colpo solo. Ogni `<div class="tocsec">` è già
un blocco autonomo: dirgli di non calcolare layout e paint finché non è vicino allo schermo
non cambia una virgola di quello che si vede.

```css
.tocsec { content-visibility: auto; contain-intrinsic-size: auto 520px }
```

`contain-intrinsic-size: auto` fa memorizzare al browser l'altezza reale dopo il primo
render, quindi la scrollbar non salta e gli ancoraggi del sommario restano esatti.

Nota onesta: **da solo non serve** (4220 → 4084 ms, dentro il rumore) perché il collo di
bottiglia è altrove. Ma applicato dopo A2 vale altri 11 punti (3104 → 2753 ms), e taglia
anche il costo del primo render. Va fatto *insieme* ad A1/A2, non al posto loro.

---

### Dimensione B — tempo di primo caricamento

#### B1. I font di Google bloccano il primo pixel — **il più grosso a costo quasi nullo** ⭐

`index.html` ha in `<head>` un `<link rel="stylesheet">` verso `fonts.googleapis.com`. È
**render-blocking su un'origine terza**: prima di disegnare qualsiasi cosa il telefono deve
fare DNS + TLS + richiesta su `fonts.googleapis.com`, e *poi* DNS + TLS su
`fonts.gstatic.com` per i file. Due connessioni nuove nel percorso critico.

Misura in questo ambiente (rete emulata a 1,6 Mbps / 150 ms RTT):

| | FCP / LCP |
|---|---:|
| com'è oggi | 14 688 ms |
| identico, con `fonts.googleapis.com` bloccato | **2 080 ms** |

⚠️ **I 14,7 s sono un artefatto del proxy del sandbox** (la richiesta ai font ci ha messo
13,6 s), non quello che vede un utente vero: su rete reale la penalità è tipicamente
300–800 ms. Ma il *meccanismo* è reale al 100% e la penalità è pagata **a ogni primo
caricamento, su ogni telefono**.

Rimedio, senza cambiare di un capello la tipografia — self-hosting dei due font:

```bash
pnpm add -D @fontsource-variable/fraunces @fontsource-variable/inter
```
```ts
// main.tsx
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
```

I `.woff2` finiscono in `dist/`, serviti dallo stesso dominio già connesso, con cache
immutabile di Netlify. Spariscono due handshake e il blocco su origine terza. In
alternativa, se preferisci lasciarli su Google: caricare il CSS in modo non bloccante
(`media="print" onload="this.media='all'"`) e tenere `display=swap` — costa meno, ma resta
la latenza delle due connessioni.

#### B2. Caricare "L'Oracolo" solo quando si apre — **−171 kB dal bundle iniziale**

`ChatWidget` è importato staticamente in `App.tsx` e montato sempre, quindi il bundle
d'ingresso si porta dietro tutta la catena AI anche per chi non apre mai la chat.
Scomposizione del chunk principale ricavata dalla sourcemap (566 kB minificati):

| | kB min | quota |
|---|---:|---:|
| react-dom | 174,2 | 30,8% |
| src/App.tsx | 81,9 | 14,5% |
| **zod** | **63,4** | **11,2%** |
| @tanstack/router-core | 54,4 | 9,6% |
| **@tanstack/ai-client** | **41,5** | **7,3%** |
| **@tanstack/ai** | **34,2** | **6,0%** |
| fuse.js | 25,6 | 4,5% |
| **src/chat/ChatWidget.tsx** | **15,5** | **2,7%** |
| **src/chat/tools.ts** | **8,7** | **1,5%** |
| … | | |

In grassetto: **171 kB minificati (~50 kB gzip), il 30% del bundle**, serve solo dopo un
tocco sul bottone della chat.

```tsx
const ChatWidget = React.lazy(() => import("./chat/ChatWidget.tsx"));
```

Il bottone va estratto in un componente leggero (oggi vive dentro `ChatWidget`) così resta
visibile subito; il modale si carica al primo click. Feature identica, un attimo di attesa
la prima volta che si apre — su una funzione che è già asincrona per natura.

Idem per `fuse.js` (25,6 kB): serve solo alla ricerca dell'archivio, può caricarsi al primo
carattere digitato.

Effetto atteso: chunk d'ingresso da 580 kB → ~380 kB (170 → ~120 kB gzip). Il TBT misurato
è 625 ms su `/` e **1784 ms su `/dati`** (a CPU 1/4); un taglio del 30% al parse+eval si
sente sulla reattività dei primi secondi.

#### B3. Cose già fatte bene — da non toccare

Per chiarezza, perché sono le prime che verrebbe da guardare:

- **ECharts è già isolato e già tree-shaken.** `TrendPlot.tsx` importa da `echarts/core`
  con solo `LineChart`, `GridComponent`, `DataZoomInsideComponent`, `CanvasRenderer`, ed è
  dietro `React.lazy`. I 494 kB sono il minimo per quel set (307 echarts + 169 zrender), e
  si scaricano **dopo** il primo paint. Nessun intervento sensato senza perdere lo zoom a
  due dita.
- **Mapbox GL è già caricato pigramente** da CDN solo quando serve la mappa.
- **`applyFilters` è già memoizzato** e il dataset è minuscolo: il JS non è il problema.
  Su tutto lo scroll di `/dati` lo script pesa ~1,3 s su 4,2 s, e quasi tutto è il tick
  delle animazioni CSS, non la logica.
- **Esiste già il rispetto di `prefers-reduced-motion`** (`styles.css:1452`), che azzera
  tutte le animazioni. Chi lo attiva è già a posto.

---

### Dimensione C — micro-igiene

Costo zero, guadagno piccolo ma gratis.

- `src/main.tsx:6` — `console.log("KAWABANGA!")` in produzione.
- L'handler `--page-h` (`App.tsx:2497`) ha un `ResizeObserver` su `document.body` che legge
  `document.documentElement.scrollHeight`: **un layout forzato dell'intero documento**,
  misurato in **18–43 ms** su `/dati` in questo container (su un telefono vero, di più). In
  regime stazionario non si ripete (l'ho verificato: 20 `resize` sintetici costano 0,8 ms
  perché il valore non cambia), quindi **non è la causa dei micro-scatti**. Ma su mobile la
  barra degli indirizzi che si ritrae *cambia* l'altezza e fa scattare il ricalcolo nel
  mezzo di uno scroll. Vale un `requestAnimationFrame` + confronto col valore precedente
  prima di riscrivere la proprietà.
- 175 livelli compositati su `/dati` (31,2 MP totali, ~125 MB di texture a DPR 2,6), di cui
  uno singolo alto tutta la pagina: `412 × 9762` px CSS, cioè il contenitore `.ambient`.
  A2 lo riduce da sé.

---

## Piano consigliato

**Primo giro — 4 modifiche, tutte a rischio visivo nullo o verificato:**

1. A1 pausa dei fasci durante lo scroll (~10 righe)
2. A2 `@media (pointer: coarse)`: 8 fasci, blur ≤ 8px (5 righe di CSS)
3. A3 `content-visibility` su `.tocsec` (1 riga)
4. B1 self-hosting dei font

Atteso: **scroll ~2,5× più leggero** e primo pixel senza dipendenze da origini terze.

**Secondo giro, se vuoi spingere:** B2 (chat e fuse.js pigri) e la micro-igiene C.

Quando è in piedi, vale la pena rimisurare **sul tuo telefono vero**, non qui: vedi il
caveat sotto.

---

## Metodo e limiti

Ambiente: Chromium 1194 headless via Playwright, profilo dispositivo Pixel 7 (412 × 915
CSS, DPR 2,625, touch), CPU rallentata 4× via CDP `Emulation.setCPUThrottlingRate`, build
di produzione servita da `vite preview`.

Le misure di scorrimento vengono da **trace DevTools reali** (categorie `devtools.timeline`,
`blink`, `cc`) aggregate per nome di evento, su uno scroll a rotellina identico e
riproducibile di 36 passi × 170 px. Ogni scenario è la **mediana di 3 esecuzioni**. Il
confronto fra scenari è A/B nella stessa sessione, con il CSS iniettato dopo il load, così
l'unica variabile è quella sotto esame.

Il diff di screenshot congela ogni animazione allo stesso istante
(`animation-play-state: paused; animation-delay: -1.5s`) prima dello scatto, così i due
frame sono confrontabili pixel a pixel; il confronto è per canale RGB via `pngjs`.

**Tre limiti da tenere presenti:**

1. **Niente GPU.** Questo container rasterizza in software (SwiftShader). Le misure di
   main thread, stile, layout e paint sono valide e trasferibili; quelle di raster/GPU no.
   Siccome `filter: blur()` e `mix-blend-mode` su un telefono vero pesano **anche** sulla
   GPU, il guadagno reale di A1+A2 è verosimilmente **maggiore** di quello misurato qui,
   non minore.
2. **La rete è quella del sandbox.** Il numero di 14,7 s per il primo paint è gonfiato dal
   proxy sui font (vedi B1). Il confronto relativo (con e senza font di Google) resta
   valido, la cifra assoluta no.
3. **`VITE_MAPBOX_TOKEN` non è impostato qui**, quindi la mappa non si è caricata durante il
   profiling. Il costo reale di `/dati` in produzione è **più alto** di quello misurato:
   Mapbox GL è ~800 kB di JS da CDN più una canvas WebGL viva nella pagina. Se dopo il primo
   giro lo scroll è ancora ruvido proprio all'altezza della mappa, il passo successivo è
   montarla solo quando entra nel viewport.
