import React, { useRef, useState } from "react";
import { CN_LABELS, VIC_LABELS } from "../../shared/model/scale.ts";
import { eur0, km0 } from "../../shared/lib/format.ts";
import { countActive, isDefaultCost, isDefaultKm, isEmptyFilters, type Filters } from "../../shared/lib/filters.ts";
import { useDataset } from "../profile/ProfileContext.tsx";
import { useFilters } from "./FilterContext.tsx";

function FilterChip({active,onClick,children}: any){
  return <button type="button" className={"fchip"+(active?" on":"")} onClick={onClick}>{children}</button>;
}

function FilterSection({label,value,children,wide}: any){
  return <div className={"fsec"+(wide?" fsec-wide":"")}><div className="fsec-h">{label}{value!=null&&<span className="fsec-v">{value}</span>}</div><div className="fsec-b">{children}</div></div>;
}

/* Dual-handle range slider built on two overlaid native range inputs. */
function RangeSlider({min,max,step,valMin,valMax,onChange,fmt}: any){
  const f=fmt||((x:any)=>x);
  const pct=(v:number)=>max>min?((v-min)/(max-min))*100:0;
  const setLo=(v:any)=>onChange(Math.min(+v,valMax),valMax);
  const setHi=(v:any)=>onChange(valMin,Math.max(+v,valMin));
  return (
    <div className="rng">
      <div className="rng-vals"><span>{f(valMin)}</span><span>{f(valMax)}</span></div>
      <div className="rng-track">
        <div className="rng-fill" style={{left:pct(valMin)+"%",right:(100-pct(valMax))+"%"}}></div>
        <input type="range" min={min} max={max} step={step||1} value={valMin}
          onChange={e=>setLo(e.target.value)} aria-label="Minimo"
          style={{zIndex:valMin>max-(max-min)*0.05?5:3}}/>
        <input type="range" min={min} max={max} step={step||1} value={valMax}
          onChange={e=>setHi(e.target.value)} aria-label="Massimo"/>
      </div>
    </div>
  );
}

/* Searchable multi-select: a field that opens a filterable, checkable list. */
function SearchSelect({options,selected,onToggle,onClear,placeholder,leadLabel,leadActive,onLeadToggle}: any){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const ref=useRef<HTMLDivElement|null>(null);
  React.useEffect(()=>{
    if(!open) return;
    const onDown=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",onDown);
    return ()=>document.removeEventListener("mousedown",onDown);
  },[open]);
  const norm=(s:string)=>s.toLowerCase();
  const shown=q.trim()?options.filter((o:string)=>norm(o).includes(norm(q.trim()))):options;
  const showLead = leadLabel && (!q.trim() || norm(leadLabel).includes(norm(q.trim())));
  const label = leadActive ? leadLabel
    : selected.length===0 ? (placeholder||"Tutti")
    : selected.length===1 ? selected[0]
    : selected.length+" selezionati";
  const hasSel = selected.length>0 || leadActive;
  return (
    <div className={"ssel"+(open?" open":"")} ref={ref}>
      <button type="button" className={"ssel-field"+(hasSel?" has":"")} onClick={()=>setOpen(o=>!o)}>
        <span className="ssel-lbl">{label}</span>
        {hasSel
          ? <span className="ssel-x" role="button" tabIndex={0} onClick={e=>{e.stopPropagation();onClear();if(leadActive&&onLeadToggle)onLeadToggle();}} aria-label="Pulisci">×</span>
          : <svg className="ssel-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>}
      </button>
      {open&&(
        <div className="ssel-pop">
          <div className="ssel-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca…" aria-label="Cerca"/>
          </div>
          <div className="ssel-list">
            {showLead&&(
              <button type="button" className={"ssel-opt"+(leadActive?" on":"")} onClick={()=>onLeadToggle&&onLeadToggle()}>
                <span className={"ssel-cb"+(leadActive?" on":"")}>{leadActive&&<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6"/></svg>}</span>
                <span className="ssel-otxt">{leadLabel}</span>
              </button>
            )}
            {shown.length===0&&!showLead&&<div className="ssel-empty">Nessun risultato</div>}
            {shown.map((o:string)=>{
              const on=selected.includes(o);
              return (
                <button type="button" key={o} className={"ssel-opt"+(on?" on":"")} onClick={()=>onToggle(o)}>
                  <span className={"ssel-cb"+(on?" on":"")}>{on&&<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6"/></svg>}</span>
                  <span className="ssel-otxt">{o}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterButton(){
  const {filters,setFilters}=useFilters();
  const ds=useDataset();
  const B=ds.bounds;
  const [open,setOpen]=useState(false);
  const popRef=useRef<HTMLDivElement|null>(null);
  const btnRef=useRef<HTMLButtonElement|null>(null);
  const active=countActive(filters,B);
  const has=!isEmptyFilters(filters,B);

  React.useEffect(()=>{
    if(!open) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("keydown",onKey);
    const prevOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{ document.removeEventListener("keydown",onKey); document.body.style.overflow=prevOverflow; };
  },[open]);

  const toggleIn=(key:string,val:any)=>setFilters(f=>{
    const arr=(f as any)[key] as any[];
    return {...f,[key]:arr.includes(val)?arr.filter((x:any)=>x!==val):[...arr,val]} as Filters;
  });
  const clearKey=(key:string)=>setFilters(f=>({...f,[key]:[]} as Filters));
  const setVal=(key:string,val:any)=>setFilters(f=>({...f,[key]:(f as any)[key]===val?"all":val} as Filters));
  const toggleBool=(key:string)=>setFilters(f=>({...f,[key]:!(f as any)[key]} as Filters));
  const setDate=(key:string,val:string)=>setFilters(f=>({...f,[key]:val} as Filters));
  const setCost=(lo:number,hi:number)=>setFilters(f=>({...f,costMin:lo,costMax:hi}));
  const setKm=(lo:number,hi:number)=>setFilters(f=>({...f,kmMin:lo,kmMax:hi}));
  const clearAll=()=>setFilters(ds.emptyFilters);

  const costLabel = isDefaultCost(filters,B)?null:(eur0(filters.costMin)+"–"+eur0(filters.costMax));
  const kmLabel = isDefaultKm(filters,B)?null:(filters.kmMin+"–"+filters.kmMax+" km");

  return (
    <div className="filterdock">
      {open&&(
        <div className="filtermodal" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
        <div className="filterpop" ref={popRef} role="dialog" aria-modal="true" aria-label="Filtri">
          <div className="fp-head">
            <span className="fp-title">Filtri{active>0&&<span className="fp-count">{active}</span>}</span>
            <div className="fp-headactions">
              <button type="button" className={"fp-clear"+(has?"":" dis")} onClick={clearAll} disabled={!has}>Azzera</button>
              <button type="button" className="fp-close" onClick={()=>setOpen(false)} aria-label="Chiudi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div className="fp-body">
            <FilterSection label="Stato">
              <FilterChip active={filters.status==="attended"} onClick={()=>setVal("status","attended")}>Già visti</FilterChip>
              <FilterChip active={filters.status==="planned"} onClick={()=>setVal("status","planned")}>In programma</FilterChip>
            </FilterSection>
            <FilterSection label="Periodo" wide>
              <div className="datefields">
                <label className="datefield">
                  <span className="datefield-l">Da</span>
                  <input type="date" value={filters.dateFrom} min={ds.dateLo} max={filters.dateTo||ds.dateHi}
                    onChange={e=>setDate("dateFrom",e.target.value)}/>
                  {filters.dateFrom&&<button type="button" className="datefield-x" onClick={()=>setDate("dateFrom","")} aria-label="Cancella data iniziale">×</button>}
                </label>
                <label className="datefield">
                  <span className="datefield-l">A</span>
                  <input type="date" value={filters.dateTo} min={filters.dateFrom||ds.dateLo} max={ds.dateHi}
                    onChange={e=>setDate("dateTo",e.target.value)}/>
                  {filters.dateTo&&<button type="button" className="datefield-x" onClick={()=>setDate("dateTo","")} aria-label="Cancella data finale">×</button>}
                </label>
              </div>
              <div className="fsec-note">Entrambe opzionali.</div>
            </FilterSection>
            <FilterSection label="Prezzo">
              <FilterChip active={filters.price==="paid"} onClick={()=>setVal("price","paid")}>Pagato</FilterChip>
              <FilterChip active={filters.price==="gift"} onClick={()=>setVal("price","gift")}>Regalato</FilterChip>
              <FilterChip active={filters.price==="accredito"} onClick={()=>setVal("price","accredito")}>Accredito</FilterChip>
              <FilterChip active={filters.price==="unknown"} onClick={()=>setVal("price","unknown")}>Senza prezzo</FilterChip>
            </FilterSection>
            <FilterSection label="Fascia di prezzo" value={costLabel} wide>
              <RangeSlider min={B.costMin} max={B.costMax} step={5}
                valMin={filters.costMin} valMax={filters.costMax} onChange={setCost} fmt={eur0}/>
              <div className="fsec-note">Solo concerti con prezzo noto.</div>
            </FilterSection>
            <FilterSection label="Città" wide>
              <SearchSelect options={ds.cities} selected={filters.cities}
                onToggle={(c:string)=>toggleIn("cities",c)} onClear={()=>clearKey("cities")} placeholder="Tutte le città"/>
            </FilterSection>
            <FilterSection label="Compagni" wide>
              <SearchSelect options={ds.people} selected={filters.people}
                onToggle={(p:string)=>toggleIn("people",p)} onClear={()=>clearKey("people")} placeholder="Tutti i compagni"
                leadLabel="Da solo" leadActive={filters.solo} onLeadToggle={()=>toggleBool("solo")}/>
            </FilterSection>
            <FilterSection label="Vicinanza">
              {ds.vic.map(v=>(
                <FilterChip key={v} active={filters.vicinanze.includes(v)} onClick={()=>toggleIn("vicinanze",v)}>{VIC_LABELS[v]}</FilterChip>
              ))}
            </FilterSection>
            <FilterSection label="Canzoni note">
              {ds.cn.map(v=>(
                <FilterChip key={v} active={filters.canzoni.includes(v)} onClick={()=>toggleIn("canzoni",v)}>{CN_LABELS[v]}</FilterChip>
              ))}
            </FilterSection>
            <FilterSection label="Distanza del viaggio" value={kmLabel} wide>
              <RangeSlider min={B.kmMin} max={B.kmMax} step={10}
                valMin={filters.kmMin} valMax={filters.kmMax} onChange={setKm} fmt={km0}/>
              <div className="fsec-note">Km di sola andata; solo concerti con viaggio noto.</div>
            </FilterSection>
          </div>
        </div>
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        className={"filterbtn"+(open?" open":"")+(has?" hasf":"")}
        onClick={()=>setOpen(o=>!o)}
        aria-label={"Filtri"+(active>0?" ("+active+" attivi)":"")}
        aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>
        <span className="filterbtn-lbl">Filtri</span>
        {has&&<span className="filterdot" aria-hidden="true"></span>}
      </button>
    </div>
  );
}

