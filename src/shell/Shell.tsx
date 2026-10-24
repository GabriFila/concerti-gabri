/* ──────────────────────────────────────────────────────────────
   Lo Shell della pagina di un profilo (layout di /$handle): possiede lo
   stato condiviso (filtri, tema, chat) e la cornice (pulsante del tema, lo
   switch Sul palco / I dati, le luci ambientali, l'Oracolo, la barra in
   basso); la rotta attiva si disegna in <Outlet/>.

   Lo switch ha tre stati per il proprietario della pagina (Sul palco · I
   dati · Modifica, SPEC §3) e due per tutti gli altri. Chi è il
   proprietario lo dice useIsOwner() (solo UX: i controlli veri sono nelle
   funzioni Convex), già nell'SSR quando la richiesta ha una sessione.
   ────────────────────────────────────────────────────────────── */

import React from "react";
import { Link, Outlet, getRouteApi, useRouterState } from "@tanstack/react-router";
import { flatConcerts } from "../../shared/model/concert.ts";
import { applyFilters, describeFilters, mergeToolFilters, rebaseFilters, sameBounds } from "../../shared/lib/filters.ts";
import { formaDi } from "../../shared/labels.ts";
import { bersaglioSezione } from "../../shared/sections.ts";
import ChatWidget, { type ChatApi, type ChatSiteContext } from "../chat/ChatWidget.tsx";
import { FilterButton } from "../filters/FilterButton.tsx";
import { FilterContext } from "../filters/FilterContext.tsx";
import { useIsOwner } from "../lib/viewer.ts";
import { useProfile } from "../profile/ProfileContext.tsx";
import { migrateLegacyTheme, resolveTema, writeTemaCookie, type Tema } from "../theme/tema.ts";
import { TocButton } from "../toc/TocButton.tsx";

/* Shared page context: the chat opener, provided by the Shell and consumed by
   the routed pages. */
export const ShellContext=React.createContext<{openChat:(q?:string)=>void}>({openChat:()=>{}});

const rootApi=getRouteApi("__root__");

export function Shell(){
  const {profile,dataset,today}=useProfile();
  const forma=formaDi(profile.forma);
  const layout=profile.layout;
  const B=dataset.bounds;
  const [filters,setFilters]=React.useState(dataset.emptyFilters);
  // dati dal vivo: se gli estremi cambiano, le fasce "tutto" seguono i nuovi
  // (aggiornamento durante il render: nessun fotogramma con il filtro sbagliato)
  const [boundsSeen,setBoundsSeen]=React.useState(B);
  if(!sameBounds(boundsSeen,B)){
    setBoundsSeen(B);
    setFilters(f=>rebaseFilters(f,boundsSeen,B));
  }
  const DATA=React.useMemo(()=>applyFilters(dataset.entries,filters,B,today),[dataset,filters,B,today]);
  const filterCtx=React.useMemo(()=>({data:DATA,filters,setFilters}),[DATA,filters]);

  // Tema: il valore iniziale arriva dal cookie letto in SSR (loader di root),
  // quindi icona ed etichetta del pulsante coincidono tra server e client.
  const initialTema=rootApi.useLoaderData().tema;
  const [mode,setMode]=React.useState<Tema>(initialTema);
  // ogni cambio voluto passa da qui: stato + cookie (chi non tocca niente non riceve cookie)
  const changeMode=React.useCallback((t:Tema)=>{ setMode(t); writeTemaCookie(t); },[]);
  // migrazione una tantum dal vecchio localStorage.theme del sito su Netlify
  React.useEffect(()=>{ const t=migrateLegacyTheme(); if(t) setMode(t); },[]);

  // which route we're on drives the switch
  const pathname=useRouterState({select:s=>s.location.pathname});
  const isDati=/\/dati\/?$/.test(pathname);
  const isModifica=/\/modifica\/?$/.test(pathname);
  const view=isDati?"dati":isModifica?"modifica":"ritratto";
  const isOwner=useIsOwner(profile.handle);
  const chatApi=React.useRef<ChatApi|null>(null);
  // Callbacks eseguiti dai tool della chat AI. Identità stabile (la chat li tiene
  // nel suo contesto); i filtri correnti si leggono via ref, non via closure.
  const filtersRef=React.useRef(filters);
  filtersRef.current=filters;
  const chatCtx=React.useMemo<ChatSiteContext>(()=>({
    applyFilters:(input)=>{
      const next=mergeToolFilters(filtersRef.current,input,dataset);
      setFilters(next);
      // matchCount counts concerts (sets), coherently with the page's stats
      return {matchCount:flatConcerts(applyFilters(dataset.entries,next,B,today)).length,summary:describeFilters(next,B,forma)};
    },
    clearFilters:()=>{
      setFilters(dataset.emptyFilters);
      return {matchCount:dataset.flat.length};
    },
    goToSection:(id)=>{
      // una sezione nascosta dal layout del profilo non c'è: ok:false, come
      // i commenti quando nessuna serata ne ha uno (PIANO §1.35)
      const {visibile,label}=bersaglioSezione(id,forma,layout);
      const el=visibile?document.getElementById(id):null;
      if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
      return {ok:!!el,label};
    },
    setVisitorTheme:(t)=>{
      changeMode(t);
      return {ok:true,theme:t};
    },
  }),[dataset,B,today,changeMode,forma,layout]);
  React.useEffect(()=>{
    const mq=window.matchMedia("(prefers-color-scheme: dark)");
    const apply=()=>{
      document.documentElement.setAttribute("data-theme",resolveTema(mode));
    };
    apply();
    if(mode==="system"){
      mq.addEventListener("change",apply);
      return ()=>mq.removeEventListener("change",apply);
    }
  },[mode]);
  const cycleMode=()=>changeMode(mode==="dark"?"light":mode==="light"?"system":"dark");
  const modeLabel={dark:"Scuro",light:"Chiaro",system:"Sistema"}[mode];
  // on a phone, the "system" theme icon is a smartphone rather than a monitor;
  // false on the server and in the first client render, then read in an effect
  const [isPhone,setIsPhone]=React.useState(false);
  React.useEffect(()=>{
    let mq:MediaQueryList; try{ mq=matchMedia("(max-width:820px) and (pointer:coarse)"); }catch(e){ return; }
    const on=()=>setIsPhone(mq.matches);
    on();
    mq.addEventListener("change",on);
    return ()=>mq.removeEventListener("change",on);
  },[]);
  /* Fasci in pausa mentre si scorre — la regola sta in styles.css accanto al
     blocco (pointer:coarse), col perché e coi numeri. Qui c'è solo
     l'interruttore: una classe su <html>, un listener passivo, zero stato React
     (uno useState qui rifarebbe il render dell'intera pagina a ogni scroll, che
     è esattamente il lavoro che stiamo togliendo). */
  React.useEffect(()=>{
    const root=document.documentElement;
    let t=0;
    const onScroll=()=>{
      root.classList.add("scrolling");
      clearTimeout(t);
      t=window.setTimeout(()=>root.classList.remove("scrolling"),150);
    };
    window.addEventListener("scroll",onScroll,{passive:true});
    return ()=>{ window.removeEventListener("scroll",onScroll); clearTimeout(t); root.classList.remove("scrolling"); };
  },[]);
  const shellCtx=React.useMemo(()=>({openChat:(q?:string)=>chatApi.current?.open(q)}),[]);
  return (
    <FilterContext.Provider value={filterCtx}>
    <ShellContext.Provider value={shellCtx}>
      <button className="theme-toggle"
        onClick={cycleMode}
        aria-label={"Tema: "+modeLabel+". Cambia tema."}
        title={"Tema: "+modeLabel}>
        {mode==="dark"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          : mode==="light"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          : isPhone
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>}
      </button>
      <div className={"modeswitch"+(isOwner?" modeswitch--tre":"")} role="tablist" aria-label="Modalità di visualizzazione">
        <span className="modeswitch-slide" data-view={view} aria-hidden="true"></span>
        {/* exact: altrimenti /gabrifila/dati inizia con /gabrifila e anche
            "Sul palco" risulterebbe la pagina corrente (aria-current) */}
        <Link to="/$handle" params={{handle:profile.handle}} activeOptions={{exact:true}} role="tab" aria-selected={view==="ritratto"}
          className={"ms-btn"+(view==="ritratto"?" on":"")}>Sul palco</Link>
        <Link to="/$handle/dati" params={{handle:profile.handle}} role="tab" aria-selected={isDati}
          className={"ms-btn"+(isDati?" on":"")}>I dati</Link>
        {/* un link normale: /modifica (traguardo 3) ha il suo guard sul server */}
        {isOwner&&(
          <a href={"/"+profile.handle+"/modifica"} role="tab" aria-selected={isModifica} aria-current={isModifica?"page":undefined}
            className={"ms-btn"+(isModifica?" on":"")}>Modifica</a>
        )}
      </div>
      {/* /modifica è una superficie di lavoro: niente luci ambientali (meno strati da comporre) */}
      {!isModifica&&<div className="ambient" aria-hidden="true">
        <span className="abeam a1"></span>
        <span className="abeam a2"></span>
        <span className="abeam a3"></span>
        <span className="abeam a4"></span>
        <span className="abeam a5"></span>
        <span className="abeam a6"></span>
        <span className="abeam a7"></span>
        <span className="abeam a8"></span>
        <span className="abeam a9"></span>
        <span className="abeam a10"></span>
        <span className="abeam a11"></span>
        <span className="abeam a12"></span>
        <span className="abeam a13"></span>
        <span className="abeam a14"></span>
        <span className="abeam a15"></span>
        <span className="abeam a16"></span>
        <span className="abeam a17"></span>
        <span className="abeam a18"></span>
        <span className="abeam a19"></span>
        <span className="abeam a20"></span>
        <span className="abeam a21"></span>
        <span className="abeam a22"></span>
      </div>}
      <Outlet/>
      <ChatWidget ctx={chatCtx} apiRef={chatApi} corner/>
      {isDati&&(
        <div className="bottombar">
          <FilterButton/>
          <TocButton/>
        </div>
      )}
    </ShellContext.Provider>
    </FilterContext.Provider>
  );
}
