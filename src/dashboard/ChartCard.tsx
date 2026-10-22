import { useMemo, useState } from "react";
import { concertsOf } from "../../shared/model/concert.ts";
import { sortKey } from "../../shared/lib/dates.ts";
import { counter, ranked } from "../../shared/lib/aggregate.ts";
import { anniAsse, primoAnno } from "../../shared/lib/derive.ts";
import { useData } from "../filters/FilterContext.tsx";
import { useDataset, usePlanned, useProfile } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useTitoloSezione } from "./sezioni.tsx";
import { useSwipeToggle } from "./useSwipeToggle.ts";

function YearChart(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const ds=useDataset();
  const {now}=useProfile();
  // per concerto: un festival contribuisce con un'unità per set visto
  const CONC=DATA.flatMap(concertsOf);
  const att=counter(CONC.filter(c=>!isPlanned(c)),"y");
  const pl=counter(CONC.filter(isPlanned),"y");
  // dal primo anno del profilo a max(anno corrente, ultimo anno con dati) (PIANO §1.33)
  const span=anniAsse(primoAnno(ds.entries),DATA.map(d=>d.y),now);
  const yc:Record<number,number>={};for(const y of span) yc[y]=(att[y]||0)+(pl[y]||0);
  const max=Math.max(...Object.values(yc),1);
  // glow goes on the year with the most PAST events (planned excluded)
  const peak=ranked(att)[0]?.[0];
  return <div className="years">{span.map(y=>{
    const a=att[y]||0,p=pl[y]||0,v=a+p;
    const h=v?Math.max(8,Math.round(v/max*160)):4;
    const ph=v?Math.round(p/v*h):0;const ah=h-ph;
    const cls=v===0?"ybar gap":(String(y)===String(peak)?"ybar peak":"ybar");
    return <div className={cls} key={y}>
      <div className="bar" style={{height:h+"px"}}>
        <span>{v}</span>
        {p>0&&<div className="pseg" style={{height:ph+"px"}} title={p+" in programma"}></div>}
        {a>0&&<div className="aseg" style={{height:ah+"px"}}></div>}
      </div>
      <div className="yl">'{String(y).slice(2)}</div>
    </div>;
  })}</div>;
}

function Timeline(){
  const DATA=useData();
  const isPlanned=usePlanned();
  // per concerto: i set dei festival compaiono singolarmente sulla linea
  const CHRON=useMemo(()=>DATA.flatMap(concertsOf).sort((a,b)=>sortKey(a)-sortKey(b)),[DATA]);
  let lastYear:number|null=null;
  return (
    <div>
      <div className="tlscroll">
        <div className="tltrack">
          {CHRON.map((d,i)=>{
            const first=d.y!==lastYear; lastYear=d.y;
            return (
              <div className="tlcol" key={i}>
                {first&&<span className="yflag">{d.y}</span>}
                <div className={"dot"+(isPlanned(d)?" dpl":" dpast")}></div>
                <div className="tlcard">
                  <div className="d">{d.date}</div>
                  <div className="a">{d.artist}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChartCard(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const [view,setView]=useState("year");
  const swipe=useSwipeToggle(()=>setView("year"),()=>setView("time"));
  const titolo=useTitoloSezione("Concerti per anno");
  // The heading is the card's name, not the active view's: it stays put while
  // the toggle switches between the year bars and the timeline.
  return (
    <section className="panel full" {...swipe}>
      <div className="paneltop">
        <div><h2><Icon name="chart" size={22} className="h2ic"/>{titolo}</h2></div>
        <div className="toggle">
          <button className={"tg"+(view==="year"?" on":"")} onClick={()=>setView("year")}>Per anno</button>
          <button className={"tg"+(view==="time"?" on":"")} onClick={()=>setView("time")}>Timeline</button>
        </div>
      </div>
      {view==="year"?<><YearChart/>{DATA.some(isPlanned)&&<div className="ylegend"><span className="lg lg-att">Già visti</span><span className="lg lg-pl">In programma</span></div>}</>:<Timeline/>}
    </section>
  );
}
