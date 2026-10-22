import React, { useRef, useState } from "react";
import { sezioniDelProfilo } from "../../shared/sections.ts";
import { useForma, useProfile } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";

/* Ids+labels live in shared/sections.ts (shared with the AI chat); only icons are added here.
   The list follows the profile: its forma, and the layout's order, hidden
   sections and custom titles (PIANO §1.35). */
const TOC_ICONS:Record<string,string>={"sec-kpis":"star","sec-andamento":"chart","sec-trend":"chart","sec-mappa":"map","sec-artisti":"mic","sec-compagni":"users","sec-venue":"repeat","sec-vicinanza":"target","sec-stagionalita":"calendar","sec-giorni":"calendar","sec-voti":"star","sec-voti-migliori":"trophy","sec-voti-vs":"target","sec-canzoni":"note","sec-spesa":"wallet","sec-spesa-dettaglio":"euro","sec-spesa-distribuzione":"coins","sec-commenti":"pen","sec-archivio":"list"};

export function TocButton(){
  const forma=useForma();
  const {layout}=useProfile().profile;
  const TOC_ITEMS=sezioniDelProfilo(forma,layout).map(s=>({id:s.id as string,icon:TOC_ICONS[s.id]||"list",label:s.label}));
  const [open,setOpen]=useState(false);
  // a section can be conditional (the comments card is there only when a comment
  // is written), so the index is resolved against the DOM each time it opens —
  // never listing a link that would scroll nowhere.
  const [items,setItems]=useState(TOC_ITEMS);
  const toggle=()=>{
    if(!open) setItems(TOC_ITEMS.filter(it=>document.getElementById(it.id)));
    setOpen(o=>!o);
  };
  const popRef=useRef<HTMLDivElement|null>(null);
  const btnRef=useRef<HTMLButtonElement|null>(null);
  React.useEffect(()=>{
    if(!open) return;
    const onDocDown=(e:MouseEvent)=>{
      if(popRef.current&&!popRef.current.contains(e.target as Node)&&btnRef.current&&!btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("mousedown",onDocDown);
    document.addEventListener("keydown",onKey);
    return ()=>{ document.removeEventListener("mousedown",onDocDown); document.removeEventListener("keydown",onKey); };
  },[open]);
  const go=(id:string)=>{
    const el=document.getElementById(id);
    if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
    setOpen(false);
  };
  return (
    <div className="tocdock">
      {open&&(
        <div className="tocpop" ref={popRef} role="dialog" aria-label="Indice">
          <div className="toc-body">
            {items.map(it=>(
              <button key={it.id} type="button" className="toc-link" onClick={()=>go(it.id)}>
                <Icon name={it.icon} size={18}/>
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        className={"filterbtn"+(open?" open":"")}
        onClick={toggle}
        aria-label="Indice della pagina"
        aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        <span className="filterbtn-lbl">Indice</span>
      </button>
    </div>
  );
}
