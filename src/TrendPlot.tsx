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
import { DataZoomInsideComponent, GridComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, DataZoomInsideComponent, CanvasRenderer]);

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
  from: number;               // inizio della finestra iniziale (timestamp)
  yMin?: number;              // assente = automatico (costo, km)
  yMax?: number;
  yInterval?: number;         // passo dei tick (1 per le scale ordinali)
  yFormat: (v: number) => string;      // etichetta di un tick
  label: string;              // nome della proprietà, per l'aria-label
}

/* Media mobile centrata: la linea di tendenza. La finestra cresce col numero
   di punti (5 su pochi dati, di più su tanti) così la curva resta leggibile
   sia con 20 concerti sia con 200. */
function movingAverage(points: TrendPoint[]): [number, number][] {
  if (points.length < 4) return [];
  const w = Math.max(5, Math.round(points.length / 10) | 1);
  const half = Math.floor(w / 2);
  return points.map((p, i) => {
    const lo = Math.max(0, i - half), hi = Math.min(points.length - 1, i + half);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += points[j].v;
    return [p.t, s / (hi - lo + 1)] as [number, number];
  });
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

/* Tetto "tondo" sopra un massimo: 231 → 250, 978 → 1000, 147 → 150. Serve
   perché un massimo esatto darebbe tacche come 46,2 · 92,4 · 138,6. */
const niceMax = (v: number) => { const step = Math.pow(10, Math.floor(Math.log10(v))) / 2; return Math.ceil(v / step) * step; };

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

export default function TrendPlot({ points, from, yMin, yMax, yInterval, yFormat, label }: TrendPlotProps) {
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
    const ma = movingAverage(points);
    // Il singolo concerto non è il punto della card: puntini minuti, uniti da una
    // linea sottile, senza tooltip né hover — quello che si legge è la forma.
    // Una serie sola (non due) perché la linea deve attraversare il confine tra
    // già visti e in programma: la differenza la porta il colore del puntino.
    // La linea non si interrompe mai: né sui mesi vuoti né al bordo della
    // finestra. Il punto vicino può essere lontano nel tempo o fuori campo,
    // ma il segmento che ci arriva resta, e si vede da dove viene la curva.
    const line = points.map(p => ({
      value: [p.t, p.v],
      itemStyle: { color: p.planned ? colors["--planned"] : colors["--lamp"] },
    }));
    c.setOption({
      // il grafico è già in un pannello: niente titolo, niente legenda (sta sotto, in HTML)
      // le etichette dell'asse Y si prendevano una fetta di larghezza notevole
      // ("Anello alto", "1.000 km"): corpo più piccolo, margine stretto e
      // nessun rientro a sinistra, il resto è grafico
      grid: { left: 0, right: 14, top: 22, bottom: 6, containLabel: true },
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
        // null, non undefined: in un merge undefined lascerebbe in piedi il
        // valore della proprietà precedente, null vuol dire "deciditelo tu"
        min: yMin ?? null, max: yMax ?? null, interval: yInterval ?? null,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: colors["--muted"], fontFamily: "Inter,sans-serif", fontSize: 10, margin: 5, formatter: (v: number) => yFormat(v) },
        splitLine: { lineStyle: { color: colors["--line"] } },
      },
      // zoom con due dita (pinch) e scorrimento orizzontale con un dito;
      // su desktop: rotella per lo zoom, trascinamento per scorrere
      dataZoom: [{
        // filterMode "none": i punti fuori finestra restano nella serie (li taglia
        // il bordo del grafico, non il filtro), così la linea entra ed esce dai
        // margini invece di fermarsi all'ultimo punto visibile
        type: "inside", xAxisIndex: 0, filterMode: "none",
        zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false,
        minValueSpan: 1000 * 60 * 60 * 24 * 30, // non si scende sotto il mese: sotto non c'è più nulla da vedere
      }],
      series: [
        {
          name: "Concerti", type: "line" as const, data: line, symbol: "circle", symbolSize: 3,
          lineStyle: { color: colors["--lamp"], width: 1.5, opacity: 0.9 },
          silent: true, emphasis: { disabled: true },
          z: 2,
        },
        ...(ma.length ? [{
          name: "Tendenza", type: "line" as const, data: ma, smooth: true, symbol: "none",
          lineStyle: { color: colors["--dim"], width: 2, opacity: 0.9 },
          silent: true, emphasis: { disabled: true },
          z: 3,
        }] : []),
      ],
      // la finestra iniziale la imposta l'effetto qui sotto: tenerla fuori da
      // qui vuol dire che un cambio di tema non rimanda lo zoom da capo
    } as echarts.EChartsCoreOption, { replaceMerge: ["series"] });
  }, [points, colors, yMin, yMax, yInterval, yFormat]);

  /* Finestra iniziale: dal primo punto del 2022 all'ultimo che la proprietà
     scelta ha davvero — ogni proprietà finisce dove finiscono i suoi dati (il
     voto si ferma all'ultimo concerto visto, il costo arriva ai biglietti già
     comprati per il 2027). Quello che sta prima non sparisce: basta zoomare
     fuori. Gira dopo l'effetto dell'opzione, che crea le serie. */
  useEffect(() => {
    const c = chart.current;
    if (!c || !points.length) return;
    const start = points.find(p => p.t >= from)?.t ?? points[0].t;
    c.dispatchAction({ type: "dataZoom", startValue: start, endValue: points[points.length - 1].t });
  }, [points, from]);

  /* Scale automatiche (costo, km): il tetto segue la finestra visibile.
     Le serie non vengono filtrate — è quello che tiene le linee attaccate ai
     bordi — quindi senza questo il viaggio a Brno (978 km, 2020) schiaccerebbe
     il grafico anche stando fuori campo. Le scale ordinali hanno già i loro
     estremi e non passano di qui. */
  useEffect(() => {
    const c = chart.current;
    if (!c || yMax !== undefined || !points.length) return;
    const fit = () => {
      const dz = (c.getOption() as any).dataZoom?.[0];
      const lo = dz?.startValue ?? points[0].t, hi = dz?.endValue ?? points[points.length - 1].t;
      const seen = points.filter(p => p.t >= lo && p.t <= hi);
      const top = Math.max(...(seen.length ? seen : points).map(p => p.v));
      c.setOption({ yAxis: { max: top > 0 ? niceMax(top) : null } });
    };
    fit();
    c.on("datazoom", fit);
    return () => { c.off("datazoom", fit); };
  }, [points, yMax]);

  return (
    <div ref={outer} className="trendbox" role="img" aria-label={"Andamento di " + label + " nel tempo"}>
      <div ref={box} className="trendcanvas"/>
    </div>
  );
}
