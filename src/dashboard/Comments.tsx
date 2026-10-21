import React, { useMemo, useState } from "react";
import { isFestival, type Entry } from "../../shared/model/concert.ts";
import { sortKey } from "../../shared/lib/dates.ts";
import { commentOf, eventTitle, hasComment } from "../../shared/lib/predicates.ts";
import { useData } from "../filters/FilterContext.tsx";
import { usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ENT_COMMENTO, ShowAllBtn } from "../ui/ShowAllBtn.tsx";

/* "I miei commenti" — what I wrote about an evening, newest first. Per EVENT,
   like the ticket: a festival comment covers its whole weekend, so it is listed
   once and not repeated per set. Starts on the last COMMENTS_PAGE ones and grows
   a page at a time; the whole section is hidden when no event in the current
   filters has a comment (see FullDashboard). */
const COMMENTS_PAGE=5;
export function CommentsCard(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const [limit,setLimit]=useState(COMMENTS_PAGE);
  const commented=useMemo(()=>DATA.filter(hasComment).sort((a,b)=>sortKey(b)-sortKey(a)),[DATA]);
  if(!commented.length) return null;
  const shown=commented.slice(0,limit);
  const rest=commented.length-shown.length;
  const allShown=rest===0;
  return (
    <section className="panel">
      <h2><Icon name="pen" size={22} className="h2ic"/>I miei commenti</h2>
      <p className="desc">Quello che mi sono segnato dopo la serata.</p>
      <div className="commentlist">{shown.map(ev=>(
        <div className="commentitem" key={ev.date+eventTitle(ev)}>
          <div className="notehead">
            <span className="n-art">{eventTitle(ev)}</span>
            <span className={"n-date "+(isPlanned(ev)?"d-planned":"d-past")}>{ev.date}</span>
            <span className="n-meta">{ev.venue} · {ev.city}</span>
          </div>
          <p className="commenttext">{commentOf(ev)}</p>
        </div>
      ))}</div>
      {commented.length>COMMENTS_PAGE&&(
        <ShowAllBtn expanded={allShown} count={Math.min(COMMENTS_PAGE,rest)} entity={ENT_COMMENTO}
          onClick={()=>setLimit(l=>allShown?COMMENTS_PAGE:l+COMMENTS_PAGE)}/>
      )}
    </section>
  );
}

/* A table cell in the Commenti column: the comment itself never sits in the
   table (it would wreck the row heights), only a button opening CommentModal. */
export function CommentCell({ev,onOpen}:{ev:Entry;onOpen:(e:Entry)=>void}){
  if(!hasComment(ev)) return <span style={{color:"var(--dim)"}}>—</span>;
  const label="Leggi il commento su "+eventTitle(ev);
  return (
    <button type="button" className="commentbtn" onClick={()=>onOpen(ev)} title={label} aria-label={label}>
      <Icon name="pen" size={15}/>
    </button>
  );
}

/* The archive's comment reader: one modal for the whole table, driven by the
   event whose Commenti button was tapped (null = closed). The comment belongs to
   the event, so a festival set opens the festival's comment. */
export function CommentModal({ev,onClose}:{ev:Entry|null;onClose:()=>void}){
  React.useEffect(()=>{
    if(!ev) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",onKey);
    const prevOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{ document.removeEventListener("keydown",onKey); document.body.style.overflow=prevOverflow; };
  },[ev,onClose]);
  if(!ev) return null;
  const title=eventTitle(ev);
  return (
    <div className="commentmodal" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="commentpop" role="dialog" aria-modal="true" aria-label={"Commento su "+title}>
        <div className="fp-head">
          <span className="fp-title"><Icon name="pen" size={18} style={{color:"var(--lamp)"}}/>{title}</span>
          <button type="button" className="fp-close" onClick={onClose} aria-label="Chiudi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="commentpop-body">
          <div className="commentpop-meta">{ev.date} · {ev.venue} · {ev.city}{isFestival(ev)&&<span className="commentpop-tag">commento sull'evento</span>}</div>
          <p className="commentpop-text">{commentOf(ev)}</p>
        </div>
      </div>
    </div>
  );
}
