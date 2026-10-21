import { useState } from "react";
import { eur0, eur2 } from "../../shared/lib/format.ts";
import { hasCost, labelOf, type Datum } from "../../shared/lib/predicates.ts";
import { useData } from "../filters/FilterContext.tsx";
import { usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ENT_BIGLIETTO, ShowAllBtn } from "../ui/ShowAllBtn.tsx";

// ---- Cost analytics ----------------------------------------------------------
// Every figure here is computed only over concerts with a known `cost` (all-in,
// single seat). Unknown-price concerts are tolerated and just left out.

function SpendYearChart({rows}:{rows:Array<Datum&{cost:number}>}){
  const isPlanned=usePlanned();
  // total spend per year, split past (amber) vs planned/already-paid (teal)
  const att:Record<number,number>={},pl:Record<number,number>={},cnt:Record<number,number>={},span:number[]=[];
  const endY=Math.max(2026,...rows.map(d=>d.y));
  for(let y=2022;y<=endY;y++){att[y]=0;pl[y]=0;cnt[y]=0;span.push(y);}
  rows.forEach(d=>{ if(d.y<2022) return; (isPlanned(d)?pl:att)[d.y]+=d.cost; cnt[d.y]++; });
  const tot=(y:number)=>att[y]+pl[y];
  const max=Math.max(...span.map(tot),1);
  const peak=span.slice().sort((a,b)=>att[b]-att[a])[0];
  const avgOf=(y:number)=>cnt[y]?tot(y)/cnt[y]:0;
  const avgMax=Math.max(...span.map(avgOf),1);
  return <div className="years spendyears dualbars">{span.map(y=>{
    const a=att[y],p=pl[y],v=a+p;
    const h=v?Math.max(8,Math.round(v/max*150)):4;
    const ph=v?Math.round(p/v*h):0;const ah=h-ph;
    const av=avgOf(y);
    const avh=av?Math.max(8,Math.round(av/avgMax*110)):0;
    const cls=v===0?"ybar gap":(String(y)===String(peak)?"ybar peak":"ybar");
    return <div className={cls} key={y}>
      <div className="barpair">
        <div className="bar" style={{height:h+"px"}}>
          <span>{eur0(v)}</span>
          {p>0&&<div className="pseg" style={{height:ph+"px"}} title={eur0(p)+" in programma"}></div>}
          {a>0&&<div className="aseg" style={{height:ah+"px"}}></div>}
        </div>
        {av>0&&<div className="bar avgbar" style={{height:avh+"px"}} title={eur0(av)+" in media a biglietto"}>
          <span className="avg">{eur0(av)}</span>
          <div className="avseg"></div>
        </div>}
      </div>
      <div className="yl">'{String(y).slice(2)}</div>
    </div>;
  })}</div>;
}

export function CostCard(){
  const DATA=useData();
  const known=DATA.filter(hasCost);
  return (
    <section className="panel full">
      <div className="paneltop">
        <div><h2><Icon name="wallet" size={22} className="h2ic"/>Quanto spendo</h2></div>
      </div>
      <SpendYearChart rows={known}/>
      <div className="ylegend"><span className="lg lg-att">Speso</span><span className="lg lg-pl">In programma</span><span className="lg lg-avg">Media a biglietto</span></div>
    </section>
  );
}

export function TopSpend(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const [expanded,setExpanded]=useState(false);
  const full=DATA.filter(hasCost).sort((a,b)=>b.cost-a.cost);
  const top=expanded?full:full.slice(0,7);
  const hasMore=full.length>7;
  const max=top.length?top[0].cost:1;
  return (
    <section className="panel">
      <h2><Icon name="euro" size={22} className="h2ic"/>Quando ho speso di più</h2>
      <div className="rank">{top.map((d,i)=>(
        <div className="rrow" key={i}>
          <div className="rtop"><span className="name">{labelOf(d)} <span style={{color:"var(--muted)",fontWeight:400}}>· {d.city} '{String(d.y).slice(2)}</span></span><span className="val"><span className="vneu">{eur2(d.cost)}</span></span></div>
          <div className="track"><div className="fill" style={{width:Math.round(d.cost/max*100)+"%",background:isPlanned(d)?"var(--planned)":"var(--lamp)"}}></div></div>
        </div>
      ))}</div>
      {hasMore&&<ShowAllBtn expanded={expanded} onClick={()=>setExpanded(e=>!e)} count={full.length-7} entity={ENT_BIGLIETTO}/>}
    </section>
  );
}

export function PriceDistribution(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const known=DATA.filter(hasCost);
  // bucket into €15 intervals starting at 0: [0,15), [15,30), …
  const W=15;
  const maxCost=known.length?Math.max(...known.map(d=>d.cost)):0;
  const nb=Math.max(1,Math.floor(maxCost/W)+1);
  const bins=Array.from({length:nb},(_,i)=>({lo:i*W,hi:(i+1)*W,n:0,att:0,pl:0}));
  known.forEach(d=>{const i=Math.min(nb-1,Math.floor(d.cost/W));bins[i].n++;if(isPlanned(d)) bins[i].pl++; else bins[i].att++;});
  const max=Math.max(...bins.map(b=>b.n),1);
  const peak=bins.slice().sort((a,b)=>b.n-a.n)[0];
  return (
    <section className="panel full">
      <div className="paneltop">
        <div><h2><Icon name="coins" size={22} className="h2ic"/>Quanto pago di solito</h2></div>
      </div>
      <div className="distscroll"><div className="years" style={{"--nb":nb}}>{bins.map((b,i)=>{
        const h=b.n?Math.max(8,Math.round(b.n/max*150)):4;
        const ph=b.n?Math.round(b.pl/b.n*h):0;const ah=h-ph;
        const cls=b.n===0?"ybar gap":(b===peak?"ybar peak":"ybar");
        return <div className={cls} key={i}>
          <div className="bar" style={{height:h+"px"}}>
            <span>{b.n}</span>
            {b.pl>0&&<div className="pseg" style={{height:ph+"px"}} title={b.pl+" in programma"}></div>}
            {b.att>0&&<div className="aseg" style={{height:ah+"px"}}></div>}
          </div>
          <div className="yl">{b.lo}–{b.hi}</div>
        </div>;
      })}</div></div>
      <div className="ylegend"><span className="lg lg-att">Già visti</span><span className="lg lg-pl">In programma</span></div>
    </section>
  );
}
