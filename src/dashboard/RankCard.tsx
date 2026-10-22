import { useState } from "react";
import { counter, multiCounter, rankCutoff, ranked } from "../../shared/lib/aggregate.ts";
import { useData } from "../filters/FilterContext.tsx";
import { usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ENT_ARTIST, ShowAllBtn } from "../ui/ShowAllBtn.tsx";
import { useTitoloSezione } from "./sezioni.tsx";

export function RankCard({title,obj,plObj,color,min,icon,field,multi,entity}: any){
  const DATA=useData();
  const isPlanned=usePlanned();
  const [expanded,setExpanded]=useState(false);
  const titolo=useTitoloSezione(title);
  const m=min||1;
  const f=field||"artist";
  // planned split: callers counting per-concert pass their own plObj; the
  // default keeps the old per-event behaviour
  const plC=plObj||(multi?multiCounter(DATA.filter(isPlanned),f):counter(DATA.filter(isPlanned),f));
  const all=ranked(obj);
  // Collapsed: only the recurring entries (>= `min`), capped rank by rank.
  // Expanded: the whole list, one-offs included — same as every other card.
  const ent=rankCutoff(all.filter(e=>e[1]>=m));
  const shown=expanded?all:ent;
  const hasMore=all.length>ent.length;
  return (
    <section className="panel">
      <h2><Icon name={icon||"trophy"} size={22} className="h2ic"/>{titolo}</h2>
      {shown.length>0 ? (
        <div className="rank">{shown.map(([name,v])=>{
          const max=shown[0][1];
          const p=plC[name]||0;const a=v-p;
          return (
            <div className="rrow" key={name}>
              <div className="rtop"><span className="name">{name}</span><span className="val">{a>0&&<span className="vpast">{a}</span>}{a>0&&p>0&&<span className="vplus"> + </span>}{p>0&&<span className="vpl">{p}</span>}</span></div>
              <div className="track">
                <div className="fill" style={{width:Math.round(a/max*100)+"%",background:color}}></div>
                {p>0&&<div className="fill fpl" style={{width:Math.round(p/max*100)+"%"}}></div>}
              </div>
            </div>
          );
        })}</div>
      ) : (
        <p className="desc" style={{margin:0}}>Niente che si ripeta finora.</p>
      )}
      {hasMore&&<ShowAllBtn expanded={expanded} onClick={()=>setExpanded(e=>!e)} count={all.length-ent.length} entity={entity||ENT_ARTIST}/>}
    </section>
  );
}
