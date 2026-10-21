import React, { useState } from "react";
import { concertsOf, type FlatConcert } from "../../shared/model/concert.ts";
import { CN_LABELS, VIC_LABELS, VIC_ORDER } from "../../shared/model/scale.ts";
import { sortKey } from "../../shared/lib/dates.ts";
import { rankCutoff, sum } from "../../shared/lib/aggregate.ts";
import { eur2, voto1 } from "../../shared/lib/format.ts";
import { hasCN, hasCost, hasVic, hasVoto, type Datum } from "../../shared/lib/predicates.ts";
import { useData } from "../filters/FilterContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ENT_CONCERT, ShowAllBtn } from "../ui/ShowAllBtn.tsx";
import { useSwipeToggle } from "./useSwipeToggle.ts";

// ---- Vote analytics ----------------------------------------------------------
// Everything here runs on attended concerts that carry a `voto` (1..5 stars).
// Planned concerts can't be rated yet, so they never enter these charts.

export function VoteDistribution(){
  const DATA=useData();
  // per concerto: i set dei festival votano individualmente
  const voted=DATA.flatMap(concertsOf).filter(hasVoto);
  const bins=[1,2,3,4,5].map(v=>({v,n:voted.filter(d=>d.voto===v).length}));
  const max=Math.max(...bins.map(b=>b.n),1);
  const peak=bins.slice().sort((a,b)=>b.n-a.n)[0];
  const avg=voted.length?sum(voted.map(d=>d.voto))/voted.length:0;
  return (
    <section className="panel full">
      <div className="paneltop"><div><h2><Icon name="star" size={22} className="h2ic"/>Come li giudico</h2></div></div>
      {voted.length>0?(<>
        <div className="years votedist" style={{"--nb":5}}>{bins.map(b=>{
          const h=b.n?Math.max(8,Math.round(b.n/max*150)):4;
          const cls=b.n===0?"ybar gap":(b===peak?"ybar peak":"ybar");
          return <div className={cls} key={b.v}>
            <div className="bar" style={{height:h+"px"}}>
              <span>{b.n}</span>
              {b.n>0&&<div className="aseg" style={{height:h+"px"}}></div>}
            </div>
            <div className="yl">{b.v}<span className="star">★</span></div>
          </div>;
        })}</div>
        <div className="starlegend">{([
          [5,"Epico","se non ci fossi stato mi sarei buttato"],
          [4,"Top","performance oltre le aspettative"],
          [3,"Bello","ha fatto il suo"],
          [2,"Evitabile","non vorrei rivivere l'evento"],
          [1,"Schifo","dovrebbero rimborsarmi il biglietto"],
        ] as const).map(([v,w,t])=>
          <div className="sli" key={v}><span className="sv">{v}<span className="star">★</span></span><span className="sd"><b style={{color:"var(--text)"}}>{w}</b>, {t}</span></div>
        )}</div>
        <p className="desc" style={{margin:"18px auto 0",textAlign:"center"}}>Voto medio <b style={{color:"var(--lamp)"}}>{voto1(avg)}<span className="star">★</span></b> su {voted.length} concerti votati.</p>
      </>):(
        <p className="desc" style={{margin:0}}>Nessun concerto votato con questi filtri.</p>
      )}
    </section>
  );
}

export function TopVoted(){
  const DATA=useData();
  const [expanded,setExpanded]=useState(false);
  // collapsed: best-rated concerts (4★ and up, festival sets included), newest
  // first within the same rating, with rankCutoff keeping whole ranks (a tie is
  // shown in full or held back entirely). Expanded: every rated concert, down to 1★.
  const allVoted=DATA.flatMap(concertsOf).filter(hasVoto)
    .sort((a,b)=>b.voto-a.voto||sortKey(b)-sortKey(a))
    .map((d):[FlatConcert&{voto:number},number]=>[d,d.voto]);
  const eligible=allVoted.filter(([d])=>d.voto>=4);
  const cut=rankCutoff(eligible);
  const shown=expanded?allVoted:cut;
  const hasMore=allVoted.length>cut.length;
  return (
    <section className="panel">
      <h2><Icon name="trophy" size={22} className="h2ic"/>I migliori</h2>
      {shown.length>0?(<>
        <div className="rank">{shown.map(([d,v])=>(
          <div className="rrow" key={d.date+d.artist}>
            <div className="rtop"><span className="name">{d.artist} <span style={{color:"var(--muted)",fontWeight:400}}>· {d.city} '{String(d.y).slice(2)}</span></span><span className="val"><span className="vpast"><span className="star">{"★".repeat(v)}</span></span></span></div>
            <div className="track"><div className="fill" style={{width:Math.round(v/5*100)+"%",background:"var(--lamp)"}}></div></div>
          </div>
        ))}</div>
        {hasMore&&<ShowAllBtn expanded={expanded} onClick={()=>setExpanded(e=>!e)} count={allVoted.length-cut.length} entity={ENT_CONCERT}/>}
      </>):(
        <p className="desc" style={{margin:0}}>Nessun concerto da 4<span className="star">★</span> o più con questi filtri.</p>
      )}
    </section>
  );
}

export function VoteScatter(){
  const DATA=useData();
  const DIMS=["cost","vic","cn"]; // tab order — swipe steps through it
  const DIM_NAMES:Record<string,string>={cost:"prezzo",vic:"vicinanza",cn:"canzoni note"};
  const [dim,setDim]=useState("cost"); // "cost" | "vic" | "cn"
  const swipe=useSwipeToggle(
    ()=>setDim(d=>DIMS[Math.max(0,DIMS.indexOf(d)-1)]),
    ()=>setDim(d=>DIMS[Math.min(DIMS.length-1,DIMS.indexOf(d)+1)])
  );
  const hasDim:(c:Datum)=>boolean=dim==="cost"?hasCost:dim==="vic"?hasVic:hasCN;
  // per concerto. Sui set dei festival il prezzo non è definito (il biglietto è
  // dell'evento), quindi la vista Prezzo li esclude da sé; Vicinanza e Canzoni
  // note sono per-concerto e li includono.
  const pts=DATA.flatMap(concertsOf).filter(c=>hasVoto(c)&&hasDim(c));
  // svg geometry — viewBox scales with the panel width
  const W=720,H=310,ML=48,MR=16,MT=14,MB=42;
  const iw=W-ML-MR,ih=H-MT-MB;
  const yOf=(v:number)=>MT+ih*(1-(v-0.5)/5); // votes 1..5 with half-step padding
  const costMax=Math.max(50,Math.ceil(Math.max(0,...pts.map(d=>hasCost(d)?d.cost:0))/25)*25);
  // vicinanza: l'asse segue l'ordine di lettura (VIC_ORDER), non il numero — la
  // transenna resta a sinistra come nella card e nei filtri, anche se vale 6
  const xVic=(v:number)=>ML+((VIC_ORDER.indexOf(v)+0.5)/6)*iw;
  const xOf=(d:FlatConcert)=>dim==="cost"
    ? ML+((d.cost as number)/costMax)*iw
    : dim==="vic"
    ? xVic(d.vicinanza as number)
    : ML+(((d.canzoniNote as number)-0.5)/5)*iw;
  const xTicks=dim==="cost"
    ? Array.from({length:costMax/25+1},(_,i)=>i*25).filter(t=>costMax<=150||t%50===0)
    : dim==="vic"?VIC_ORDER:[1,2,3,4,5];
  // overlapping points get a small deterministic offset so every dot stays visible
  const OFF=[[0,0],[0,11],[0,-11],[11,0],[-11,0],[11,11],[-11,-11],[11,-11],[-11,11],[0,22],[0,-22],[22,0],[-22,0],[22,11],[-22,-11],[22,-11],[-22,11],[11,22],[-11,-22]];
  const seen:Record<string,number>={};
  const nodes=pts.map(d=>{
    const bx=Math.round(xOf(d)/10),by=d.voto;
    const k=bx+"-"+by;
    const i=(seen[k]=(seen[k]||0)+1)-1;
    const [dx,dy]=OFF[i%OFF.length];
    const sc=dim==="cost"?0.55:1; // gentler nudge on the continuous axis
    return {d,x:xOf(d)+dx*sc,y:yOf(d.voto as number)+dy};
  });
  // Dot detail: the native <title> only showed up on desktop, after a delay,
  // and never on tap — so the dots drive an HTML tooltip instead. Hover opens
  // it with a mouse, tap toggles it on touch; a tap anywhere else in the chart
  // (or switching view) closes it.
  const [active,setActive]=useState<number|null>(null);
  React.useEffect(()=>{setActive(null)},[dim,pts.length]); // view/filters changed → indices no longer match
  const dimValue=(d:FlatConcert)=>dim==="cost"?eur2(d.cost as number)
    :dim==="vic"?VIC_LABELS[d.vicinanza as number]
    :CN_LABELS[d.canzoniNote as number];
  const act=active!=null&&nodes[active]?nodes[active]:null;
  return (
    <section className="panel full" {...swipe}>
      <div className="paneltop">
        <div><h2><Icon name="target" size={22} className="h2ic"/>Il voto a confronto</h2></div>
        <div className="toggle">
          <button className={"tg"+(dim==="cost"?" on":"")} onClick={()=>setDim("cost")}>Prezzo</button>
          <button className={"tg"+(dim==="vic"?" on":"")} onClick={()=>setDim("vic")}>Vicinanza</button>
          <button className={"tg"+(dim==="cn"?" on":"")} onClick={()=>setDim("cn")}>Canzoni note</button>
        </div>
      </div>
      {pts.length>0?(
        // touch pointers fire pointerleave on release, so only a mouse leaving closes the tooltip
        <div className="scwrap" onPointerDown={()=>setActive(null)} onPointerLeave={e=>{if(e.pointerType!=="touch")setActive(null);}}>
        <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}} role="img" aria-label={"Grafico a dispersione: voto contro "+DIM_NAMES[dim]}>
          {[1,2,3,4,5].map(v=>(
            <g key={v}>
              <line x1={ML} y1={yOf(v)} x2={W-MR} y2={yOf(v)} stroke="var(--line)" strokeWidth="1"/>
              <text x={ML-10} y={yOf(v)+4} textAnchor="end" fontSize="12" fill="var(--muted)" fontFamily="Inter,sans-serif">{v}<tspan dy="-1">★</tspan></text>
            </g>
          ))}
          {xTicks.map(t=>{
            const x=dim==="cost"?ML+(t/costMax)*iw:dim==="vic"?xVic(t):ML+((t-0.5)/5)*iw;
            return <g key={t}>
              <line x1={x} y1={MT} x2={x} y2={MT+ih} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 5" opacity="0.6"/>
              <text x={x} y={H-14} textAnchor="middle" fontSize={dim==="cost"?14:12} fill="var(--muted)" fontFamily="Inter,sans-serif">{dim==="cost"?"€"+t:dim==="vic"?VIC_LABELS[t]:CN_LABELS[t]}</text>
            </g>;
          })}
          {nodes.map(({x,y},i)=>(
            <g key={i} className={"scdot"+(active===i?" on":"")}
              onPointerEnter={e=>{if(e.pointerType!=="touch")setActive(i);}}
              onPointerDown={e=>{e.stopPropagation();setActive(a=>a===i?null:i);}}>
              {/* invisible, finger-sized hit area around each dot */}
              <circle cx={x} cy={y} r="11" fill="transparent"/>
              <circle className="scd" cx={x} cy={y} r={active===i?6:4} fill="var(--lamp)" fillOpacity="0.82" stroke="var(--bg-2)" strokeWidth="1.2"/>
            </g>
          ))}
        </svg>
        {act&&(
          <div className={"sctip"+(act.y<H*0.3?" below":"")}
            style={{left:Math.min(88,Math.max(12,act.x/W*100))+"%",top:(act.y/H*100)+"%"}}>
            <span className="sct-art">{act.d.artist}</span>
            <span className="sct-meta">{act.d.date} · {act.d.city}</span>
            <span className="sct-val"><span className="star">{"★".repeat(act.d.voto as number)}</span> · {dimValue(act.d)}</span>
          </div>
        )}
        </div>
      ):(
        <p className="desc" style={{margin:0}}>Nessun concerto con voto e {DIM_NAMES[dim]} con questi filtri.</p>
      )}
    </section>
  );
}
