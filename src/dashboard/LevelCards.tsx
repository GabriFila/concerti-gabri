import { useState } from "react";
import { concertsOf } from "../../shared/model/concert.ts";
import { CN_LABELS, VIC_LABELS, VIC_ORDER } from "../../shared/model/scale.ts";
import { counter, rankCutoff, ranked } from "../../shared/lib/aggregate.ts";
import { useData } from "../filters/FilterContext.tsx";
import { usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ENT_VENUE, ShowAllBtn } from "../ui/ShowAllBtn.tsx";

// Dove torno più spesso: per EVENTO (un festival è una visita alla venue)
export function VenueCard(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const [expanded,setExpanded]=useState(false);
  const MIN_VISITS=3; // keep this a tight, truly-recurring shortlist — 1x/2x venues are noise in a half-width recap
  const full=ranked(counter(DATA,"venue")).filter(([,n])=>n>=MIN_VISITS);
  const vcap=rankCutoff(full);
  const vc=expanded?full:vcap;
  const hasMore=full.length>vcap.length;
  return (
    <section className="panel">
      <h2><Icon name="repeat" size={22} className="h2ic"/>Dove torno più spesso</h2>
      {vc.length>0 ? (<>
        <div className="rank">{vc.map(([v,n])=>{
          const max=vc[0][1];
          const rows=DATA.filter(d=>d.venue===v);
          const p=rows.filter(isPlanned).length;const a=n-p;
          const cities=[...new Set(rows.map(d=>d.city))].join(", ");
          return (
            <div className="rrow" key={v}>
              <div className="rtop"><span className="name">{v} · <span style={{color:"var(--muted)",fontWeight:400}}>{cities}</span></span><span className="val">{a>0&&<span className="vpast">{a}</span>}{a>0&&p>0&&<span className="vplus"> + </span>}{p>0&&<span className="vpl">{p}</span>}</span></div>
              <div className="track">
                <div className="fill" style={{width:Math.round(a/max*100)+"%",background:"var(--lamp)"}}></div>
                {p>0&&<div className="fill fpl" style={{width:Math.round(p/max*100)+"%"}}></div>}
              </div>
            </div>
          );
        })}</div>
        {hasMore&&<ShowAllBtn expanded={expanded} onClick={()=>setExpanded(e=>!e)} count={full.length-vcap.length} entity={ENT_VENUE}/>}
      </>) : (
        <p className="desc" style={{margin:0}}>Nessuna venue ripetuta finora.</p>
      )}
    </section>
  );
}

export function VicinanzaCard(){
  const DATA=useData();
  const isPlanned=usePlanned();
  // per concerto (ogni set di un festival ha la sua vicinanza); solo valori
  // veri (numerici): i non-definiti restano fuori.
  const CONC=DATA.flatMap(concertsOf);
  const rows=VIC_ORDER.map(v=>{
    const list=CONC.filter(c=>c.vicinanza===v);
    const pl=list.filter(isPlanned).length;
    return {v,n:list.length,a:list.length-pl,pl};
  }).filter(r=>r.n>0);
  const total=rows.reduce((s,r)=>s+r.n,0);
  const max=Math.max(1,...rows.map(r=>r.n));
  return (
    <section className="panel">
      <h2><Icon name="target" size={22} className="h2ic"/>Quanto sono vicino</h2>
      {total>0 ? (<>
        <div className="rank vicrank" style={{"--sn":rows.length}}>{rows.map(({v,n,a,pl},ri)=>(
          <div className="rrow" key={v}>
            <div className="rtop" style={{"--si":ri}}><span className="name">{VIC_LABELS[v]} · <span style={{color:"var(--muted)",fontWeight:400}}>{Math.round(n/total*100)}%</span></span><span className="val">{a>0&&<span className="vpast">{a}</span>}{a>0&&pl>0&&<span className="vplus"> + </span>}{pl>0&&<span className="vpl">{pl}</span>}</span></div>
            <div className="track">
              <div className="fill" style={{width:Math.round(a/max*100)+"%",background:"var(--lamp)"}}></div>
              {pl>0&&<div className="fill fpl" style={{width:Math.round(pl/max*100)+"%"}}></div>}
            </div>
          </div>
        ))}</div>
      </>) : (
        <p className="desc" style={{margin:0}}>Nessuna posizione definita.</p>
      )}
    </section>
  );
}

export function CanzoniNoteCard(){
  const DATA=useData();
  const isPlanned=usePlanned();
  // breakdown per livello di "Canzoni note" (Tutte in cima), solo valori veri:
  // "na" e non-definiti restano fuori, come in VicinanzaCard.
  const CONC=DATA.flatMap(concertsOf); // per concerto, come vicinanza
  const rows=[5,4,3,2,1].map(v=>{
    const list=CONC.filter(c=>c.canzoniNote===v);
    const pl=list.filter(isPlanned).length;
    return {v,n:list.length,a:list.length-pl,pl};
  }).filter(r=>r.n>0);
  const total=rows.reduce((s,r)=>s+r.n,0);
  const max=Math.max(1,...rows.map(r=>r.n));
  return (
    <section className="panel">
      <h2><Icon name="note" size={22} className="h2ic"/>Quante canzoni conosco</h2>
      {total>0?(<>
        <div className="rank">{rows.map(({v,n,a,pl})=>(
          <div className="rrow" key={v}>
            <div className="rtop"><span className="name">{CN_LABELS[v]} · <span style={{color:"var(--muted)",fontWeight:400}}>{Math.round(n/total*100)}%</span></span><span className="val">{a>0&&<span className="vpast">{a}</span>}{a>0&&pl>0&&<span className="vplus"> + </span>}{pl>0&&<span className="vpl">{pl}</span>}</span></div>
            <div className="track">
              <div className="fill" style={{width:Math.round(a/max*100)+"%",background:"var(--lamp)"}}></div>
              {pl>0&&<div className="fill fpl" style={{width:Math.round(pl/max*100)+"%"}}></div>}
            </div>
          </div>
        ))}</div>
      </>):(
        <p className="desc" style={{margin:0}}>Nessun dato sulle canzoni note con questi filtri.</p>
      )}
    </section>
  );
}
