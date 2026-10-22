import React, { useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { sum } from "../../shared/lib/aggregate.ts";
import { serieDa } from "../../shared/lib/derive.ts";
import { maWindow, movingAverage, TREND_SPECS, trendFrom } from "../../shared/lib/trend.ts";
import { useData } from "../filters/FilterContext.tsx";
import { useDataset, useToday } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useTitoloSezione } from "./sezioni.tsx";

/* ── Andamento di una proprietà nel tempo ────────────────────────────────────
   Una card con un selettore: scegli la proprietà, la vedi punto per punto
   lungo l'asse del tempo, con la linea di tendenza (media mobile) sopra.
   L'unità segue la proprietà come ovunque nella pagina: voto, vicinanza e
   canzoni note sono per CONCERTO (i set dei festival contano uno a testa),
   costo e km sono per BIGLIETTO/evento (il festival conta una volta sola).
   Il grafico vero sta in TrendPlot.tsx (ECharts, per il pinch-zoom), caricato
   pigramente e solo nel browser: è l'unico pezzo di pagina che paga quella
   libreria, e legge gli stili calcolati già al primo render. */
const TrendPlot=React.lazy(()=>import("./TrendPlot.tsx"));

const TrendLoading=()=><div className="trendbox trendload">Carico il grafico…</div>;

export function TrendCard(){
  const DATA=useData();
  const today=useToday();
  const [k,setK]=useState("voto");
  const spec=TREND_SPECS.find(s=>s.k===k)||TREND_SPECS[0];
  const points=useMemo(()=>spec.points(DATA,today),[DATA,spec,today]);
  const trend=useMemo(()=>movingAverage(points),[points]);
  const titolo=useTitoloSezione("Come cambia nel tempo");
  // la finestra iniziale parte dall'anno della "media per anno" (sulle righe non filtrate)
  const ds=useDataset();
  const since=useMemo(()=>serieDa(ds.entries,today),[ds,today]);
  return (
    <section className="panel full">
      <div className="paneltop">
        <div><h2><Icon name="chart" size={22} className="h2ic"/>{titolo}</h2></div>
        <div className="toggle wrap">
          {TREND_SPECS.map(s=>(
            <button key={s.k} className={"tg"+(s.k===k?" on":"")} onClick={()=>setK(s.k)}>{s.tab}</button>
          ))}
        </div>
      </div>
      {points.length>0?(<>
        <ClientOnly fallback={<TrendLoading/>}>
          <React.Suspense fallback={<TrendLoading/>}>
            <TrendPlot points={points} trend={trend} from={trendFrom(since)??0} yMin={spec.yMin} yMax={spec.yMax} yInterval={spec.yInterval}
              yFormat={spec.yFormat} label={spec.label}/>
          </React.Suspense>
        </ClientOnly>
        {/* la media sta in legenda e non più come riga tratteggiata dentro il
            grafico: era un'etichetta in mezzo ai dati per un numero solo */}
        <div className="ylegend trendlegend">
          <span className="lg lg-att">Già visti</span>
          {points.some(p=>p.planned)&&<span className="lg lg-pl">In programma</span>}
          {trend.length>0&&<span className="lg lg-avg">Media mobile ({maWindow(points.length)} {spec.unit})</span>}
          <span className="lg lg-mean">Media <b>{spec.valueFormat(sum(points.map(p=>p.v))/points.length)}</b></span>
        </div>
        <p className="desc trendhint">Un punto per {spec.unit==="concerti"?"concerto":"biglietto"} ({points.length}). Pizzica con due dita per zoomare, trascina con un dito per scorrere nel tempo.</p>
      </>):(
        <p className="desc" style={{margin:0}}>Nessun dato su {spec.label} con questi filtri.</p>
      )}
    </section>
  );
}
