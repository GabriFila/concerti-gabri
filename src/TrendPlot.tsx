/* ──────────────────────────────────────────────────────────────
   Il grafico "come cambia nel tempo" — l'unico grafico della pagina
   che non è SVG scritto a mano: serve zoom a due dita e scorrimento
   a un dito, e quello lo dà ECharts (dataZoom "inside").

   Vive in un modulo a parte apposta: App.tsx lo importa con
   React.lazy, così `echarts` finisce in un chunk suo e il resto
   della dashboard non se lo porta dietro.

   Qui dentro sta solo la resa: i punti (già filtrati, già scelti
   per proprietà) arrivano da App.tsx come props.
   ────────────────────────────────────────────────────────────── */

import React, { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { DataZoomInsideComponent, GridComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, DataZoomInsideComponent, MarkLineComponent, CanvasRenderer]);

/* Un punto sul grafico: un concerto (voto/vicinanza/canzoni note) o un
   biglietto (costo/km) — chi chiama ha già scelto l'unità giusta. Niente
   artista né venue: il grafico non li mostra, qui conta solo la forma. */
export interface TrendPoint {
  t: number;        // giorno dell'evento, timestamp a mezzanotte locale
  v: number;        // valore della proprietà scelta
  planned: boolean; // in programma (non ancora avvenuto)
}

export interface TrendPlotProps {
  points: TrendPoint[];
  yMin?: number;              // assente = automatico (costo, km)
  yMax?: number;
  yInterval?: number;         // passo dei tick (1 per le scale ordinali)
  yFormat: (v: number) => string;      // etichetta di un tick
  valueFormat: (v: number) => string;  // valore nel tooltip e sulla media
  label: string;              // nome della proprietà, per il tooltip/aria
}

/* Media mobile centrata: la linea di tendenza. La finestra cresce col numero
   di punti (5 su pochi dati, di più su tanti) così la curva resta leggibile
   sia con 20 concerti sia con 200.
   Sopra i sei mesi di silenzio (2018, 2021…) la linea si interrompe: un
   segmento tirato attraverso un anno senza concerti sembrerebbe un andamento
   che non c'è. Il buco è un `null`, che ECharts non collega. */
const GAP = 1000 * 60 * 60 * 24 * 183;
function movingAverage(points: TrendPoint[]): [number, number | null][] {
  if (points.length < 4) return [];
  const w = Math.max(5, Math.round(points.length / 10) | 1);
  const half = Math.floor(w / 2);
  const out: [number, number | null][] = [];
  points.forEach((p, i) => {
    if (i > 0 && p.t - points[i - 1].t > GAP) out.push([points[i - 1].t + 1, null]);
    const lo = Math.max(0, i - half), hi = Math.min(points.length - 1, i + half);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += points[j].v;
    out.push([p.t, s / (hi - lo + 1)]);
  });
  return out;
}

/* ECharts scrive le date in inglese: qui serve solo la parte "time" del locale
   italiano, così l'asse mostra 2018 · Gen · Feb … e il formattatore di serie
   resta quello di ECharts, che sa quale livello (anno/mese/giorno) sta
   etichettando — cosa che una formatter function non può sapere. */
echarts.registerLocale("IT", {
  time: {
    month: ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"],
    monthAbbr: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
    dayOfWeek: ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"],
    dayOfWeekAbbr: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
  },
} as any);

/* I colori del grafico sono quelli del tema, letti dalle CSS custom properties:
   così il canvas segue il toggle chiaro/scuro come tutto il resto della pagina. */
const THEME_VARS = ["--lamp", "--planned", "--muted", "--dim", "--line", "--text", "--panel-2", "--line-2"] as const;
type ThemeColors = Record<(typeof THEME_VARS)[number], string>;

const readTheme = (): ThemeColors => {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(THEME_VARS.map(v => [v, cs.getPropertyValue(v).trim()])) as ThemeColors;
};

function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(readTheme);
  useEffect(() => {
    // Shell scrive il tema risolto su <html data-theme>, anche quando segue il sistema
    const mo = new MutationObserver(() => setColors(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return colors;
}

/* Chi comanda il dito: il grafico o la pagina?
   ECharts, appena tocchi il canvas, si prende il gesto e blocca lo scroll
   verticale — su un telefono la card diventerebbe una trappola alta 300px.
   Quindi decidiamo noi, in fase di CAPTURE sul contenitore esterno (ECharts
   sta in un div interno, così i nostri listener passano per primi):
   - due dita        → pinch, passa tutto al grafico (zoom)
   - un dito, orizz. → pan del grafico (e preventDefault: la pagina sta ferma)
   - un dito, vert.  → gli eventi non arrivano al grafico e la pagina scorre
   I primi millimetri sono "indecisi": li tratteniamo finché la direzione non
   è chiara (ECharts riparte dalla sua ultima posizione, quindi non salta). */
function useGestureGate(outer: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const THRESHOLD = 7; // px prima di decidere la direzione
    let mode: "idle" | "undecided" | "pan" | "scroll" | "zoom" = "idle";
    let x0 = 0, y0 = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) { mode = "zoom"; return; }
      mode = "undecided"; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (mode === "zoom" || mode === "pan") return;              // il grafico sta lavorando
      if (mode === "scroll") { e.stopPropagation(); return; }     // la pagina sta scorrendo
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) { e.stopPropagation(); return; }
      if (Math.abs(dx) > Math.abs(dy)) {
        mode = "pan";
        if (e.cancelable) e.preventDefault(); // niente scroll a metà gesto
      } else {
        mode = "scroll";
        e.stopPropagation();
      }
    };
    const onEnd = () => { mode = "idle"; };
    const opts = { capture: true, passive: false } as const;
    el.addEventListener("touchstart", onStart, opts);
    el.addEventListener("touchmove", onMove, opts);
    el.addEventListener("touchend", onEnd, opts);
    el.addEventListener("touchcancel", onEnd, opts);
    return () => {
      el.removeEventListener("touchstart", onStart, opts);
      el.removeEventListener("touchmove", onMove, opts);
      el.removeEventListener("touchend", onEnd, opts);
      el.removeEventListener("touchcancel", onEnd, opts);
    };
  }, [outer]);
}

export default function TrendPlot({ points, yMin, yMax, yInterval, yFormat, valueFormat, label }: TrendPlotProps) {
  const outer = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const colors = useThemeColors();
  useGestureGate(outer);

  // istanza + resize: creata una volta, distrutta allo smontaggio
  useEffect(() => {
    if (!box.current) return;
    const c = echarts.init(box.current, undefined, { renderer: "canvas", locale: "IT" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(box.current);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const mean = points.length ? points.reduce((s, p) => s + p.v, 0) / points.length : 0;
    const ma = movingAverage(points);
    // Il singolo concerto non è il punto della card: puntini minuti, uniti da una
    // linea sottile, senza tooltip né hover — quello che si legge è la forma.
    // Una serie sola (non due) perché la linea deve attraversare il confine tra
    // già visti e in programma: la differenza la porta il colore del puntino.
    const line = points.flatMap((p, i) => [
      // stessa interruzione della tendenza: sopra i sei mesi di silenzio la
      // linea si stacca, altrimenti disegnerebbe una diagonale lunga due anni
      // tra un concerto e il successivo come se fosse una discesa graduale
      ...(i > 0 && p.t - points[i - 1].t > GAP ? [{ value: [points[i - 1].t + 1, null] }] : []),
      { value: [p.t, p.v], itemStyle: { color: p.planned ? colors["--planned"] : colors["--lamp"] } },
    ]);
    c.setOption({
      // il grafico è già in un pannello: niente titolo, niente legenda (sta sotto, in HTML)
      grid: { left: 6, right: 14, top: 22, bottom: 6, containLabel: true },
      // niente tooltip: il singolo concerto non è il punto della card, e sul
      // telefono un tooltip che sbuca a ogni sfioramento darebbe solo fastidio
      // mentre si trascina il grafico
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: colors["--line-2"] } },
        axisTick: { show: false },
        // i punti agli estremi non devono finire a cavallo del bordo (le serie non sono clippate)
        boundaryGap: ["2%", "2%"],
        axisLabel: {
          color: colors["--muted"], fontFamily: "Inter,sans-serif", fontSize: 11, hideOverlap: true,
          // le tacche "mese" portano anche l'anno: su schermo stretto ECharts le
          // mette una ogni dodici mesi e senza anno si leggerebbe "Lug" otto volte
          formatter: { year: "{yyyy}", month: "{MMM} '{yy}", day: "{d} {MMM}", hour: "{d} {MMM}", minute: "{d} {MMM}", second: "{d} {MMM}", millisecond: "{d} {MMM}", none: "{d}/{M}/{yyyy}" },
        },
        splitLine: { show: true, lineStyle: { color: colors["--line"], type: "dashed" } },
      },
      yAxis: {
        type: "value",
        min: yMin, max: yMax, interval: yInterval,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: colors["--muted"], fontFamily: "Inter,sans-serif", fontSize: 11, formatter: (v: number) => yFormat(v) },
        splitLine: { lineStyle: { color: colors["--line"] } },
      },
      // zoom con due dita (pinch) e scorrimento orizzontale con un dito;
      // su desktop: rotella per lo zoom, trascinamento per scorrere
      dataZoom: [{
        type: "inside", xAxisIndex: 0, filterMode: "filter",
        zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false,
        minValueSpan: 1000 * 60 * 60 * 24 * 30, // non si scende sotto il mese: sotto non c'è più nulla da vedere
      }],
      series: [
        {
          name: "Concerti", type: "line" as const, data: line, symbol: "circle", symbolSize: 4,
          lineStyle: { color: colors["--lamp"], width: 1.5, opacity: 0.5 },
          silent: true, emphasis: { disabled: true },
          clip: false, // i punti sui livelli estremi (1★, 5★) stanno sul bordo: senza clip restano tondi
          z: 2,
        },
        ...(ma.length ? [{
          name: "Tendenza", type: "line" as const, data: ma, smooth: true, symbol: "none",
          lineStyle: { color: colors["--dim"], width: 2, opacity: 0.9 },
          silent: true, emphasis: { disabled: true },
          z: 3,
          markLine: {
            silent: true, symbol: "none",
            data: [{ yAxis: mean }],
            lineStyle: { color: colors["--muted"], type: "dashed", width: 1, opacity: 0.7 },
            label: { formatter: "media " + valueFormat(mean), color: colors["--muted"], fontFamily: "Inter,sans-serif", fontSize: 10, position: "insideStartTop" },
          },
        }] : []),
      ],
      // start/end restano fuori: così cambiare proprietà non azzera lo zoom
    } as echarts.EChartsCoreOption, { replaceMerge: ["series"] });
  }, [points, colors, yMin, yMax, yInterval, yFormat, valueFormat, label]);

  return (
    <div ref={outer} className="trendbox" role="img" aria-label={"Andamento di " + label + " nel tempo"}>
      <div ref={box} className="trendcanvas"/>
    </div>
  );
}
