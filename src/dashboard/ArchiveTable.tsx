import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { flatConcerts, isFestival, type Entry, type Festival } from "../../shared/model/concert.ts";
import { CN_LABELS, VIC_LABELS } from "../../shared/model/scale.ts";
import { sortKey } from "../../shared/lib/dates.ts";
import { eur2, km0 } from "../../shared/lib/format.ts";
import { commentOf, distKm, festName, giftTitle, hasCN, hasComment, hasCost, hasVic, hasVoto, isAccredito, isCostNa, isGift } from "../../shared/lib/predicates.ts";
import { useData } from "../filters/FilterContext.tsx";
import { useDataset, usePlanned } from "../profile/ProfileContext.tsx";
import { GifterMark } from "../ui/GifterMark.tsx";
import { Icon } from "../ui/Icon.tsx";
import { CommentCell, CommentModal } from "./Comments.tsx";

function hl(text:string,q:string){
  if(!q) return text;
  const i=text.toLowerCase().indexOf(q.toLowerCase());
  if(i<0) return text;
  return <>{text.slice(0,i)}<mark>{text.slice(i,i+q.length)}</mark>{text.slice(i+q.length)}</>;
}

// Does a festival match the free-text query? (name, any concert artist/companion, place, comment)
function festMatches(ev:Festival,q:string){
  const n=q.trim().toLowerCase();
  if(!n) return true;
  if(ev.name.toLowerCase().includes(n)||ev.venue.toLowerCase().includes(n)||ev.city.toLowerCase().includes(n)||commentOf(ev).toLowerCase().includes(n)) return true;
  return ev.concerts.some(c=>c.artist.toLowerCase().includes(n)||(c.with||[]).some(p=>p.toLowerCase().includes(n)));
}

export function ArchiveTable(){
  const DATA=useData();
  const {gifters,departures}=useDataset();
  const isPlanned=usePlanned();
  const [q,setQ]=useState("");
  const DEFAULT_SORT={col:"date" as string|null,dir:"desc"}; // default: newest first, shown in the Data column
  const [sort,setSort]=useState<{col:string|null;dir:string}>(DEFAULT_SORT); // col:null => relevance order (only while searching)
  const [commentEv,setCommentEv]=useState<Entry|null>(null); // event whose comment the modal is showing

  // The archive is an archive of CONCERTS: every row is one concert, festival
  // sets included as first-class rows. Fuse also indexes the festival name
  // (ev.name) and the event's comment, so searching "mi ami" surfaces its
  // concerts and a word written in a comment surfaces the evening it belongs to.
  const CONC=useMemo(()=>flatConcerts(DATA),[DATA]);
  const fuse=useMemo(()=>new Fuse(CONC,{
    keys:["artist","venue","city","with","ev.name","ev.comments"],threshold:0.2,ignoreLocation:true,minMatchCharLength:2,
  }),[CONC]);

  const searching=!!q.trim();
  // base order: Fuse relevance when searching, else newest-first by date
  let rows = searching ? fuse.search(q.trim()).map(r=>r.item) : [...CONC].sort((a,b)=>sortKey(b)-sortKey(a));

  // apply an explicit column sort only when the user has picked one; otherwise keep base order (relevance/date)
  if(sort.col){
    const dir=sort.dir==="asc"?1:-1;
    rows=[...rows].sort((a,b)=>{
      let av,bv;
      if(sort.col==="date"){av=sortKey(a);bv=sortKey(b);}
      else if(sort.col==="cost"){av=hasCost(a)?a.cost:-Infinity;bv=hasCost(b)?b.cost:-Infinity;} // festival sets & unknown prices sink to the bottom
      else if(sort.col==="voto"){av=hasVoto(a)?a.voto:-Infinity;bv=hasVoto(b)?b.voto:-Infinity;} // unrated (planned) sink like unknown prices
      else if(sort.col==="vicinanza"){av=hasVic(a)?a.vicinanza:-Infinity;bv=hasVic(b)?b.vicinanza:-Infinity;} // missing sink like unknown prices
      else if(sort.col==="canzoniNote"){av=hasCN(a)?a.canzoniNote:-Infinity;bv=hasCN(b)?b.canzoniNote:-Infinity;} // "na"/missing sink like unknown prices
      else if(sort.col==="km"){av=distKm(a)??-Infinity;bv=distKm(b)??-Infinity;} // festival sets & unknown origins sink like unknown prices
      else if(sort.col==="comments"){av=hasComment(a.ev)?1:0;bv=hasComment(b.ev)?1:0;} // free text: sortable only by presence, commented evenings first (desc)
      else if(sort.col==="with"){av=(a.with||[]).join(", ").toLowerCase();bv=(b.with||[]).join(", ").toLowerCase();}
      else{av=((a as any)[sort.col!]||"").toLowerCase();bv=((b as any)[sort.col!]||"").toLowerCase();}
      return av<bv?-dir:av>bv?dir:0;
    });
  }

  // click cycle: 1st tap sorts (date and comments start desc, others asc), 2nd tap flips, 3rd tap removes the sort
  const DESC_FIRST=["date","comments"]; // the columns whose interesting end is the top one (newest / commented)
  const setCol=(col:string)=>{
    setSort(s=>{
      const first=DESC_FIRST.includes(col)?"desc":"asc";
      const second=first==="asc"?"desc":"asc";
      if(s.col!==col) return {col,dir:first};
      if(s.dir===first) return {col,dir:second};
      return searching?{col:null,dir:"desc"}:DEFAULT_SORT; // remove: back to relevance (searching) or default date order
    });
  };
  const SortIcon=({col}:{col:string})=>{
    const dir=sort.col===col?sort.dir:null;
    return (
      <span className="ar" aria-hidden="true">
        <svg width="8" height="13" viewBox="0 0 8 13">
          <path d="M4 0 L7.6 4.6 L0.4 4.6 Z" className={dir==="asc"?"on":""}/>
          <path d="M4 13 L0.4 8.4 L7.6 8.4 Z" className={dir==="desc"?"on":""}/>
        </svg>
      </span>
    );
  };

  const cols=[["artist","Artista"],["date","Data"],["venue","Venue"],["with","Compagni"],["cost","Costo"],["voto","Voto"],["canzoniNote","Canzoni note"],["city","Città"],["km","Viaggio"],["vicinanza","Vicinanza"],["comments","Commenti"]];
  const orderNote = sort.col ? null : (searching ? "Ordinati per pertinenza" : null);

  // Second table: the festivals (the only multi-concert events), newest first.
  const fests=DATA.filter(isFestival).filter(ev=>festMatches(ev,q)).sort((a,b)=>sortKey(b)-sortKey(a));

  return (
    <section className="panel full">
      <div className="paneltop"><div><h2><Icon name="list" size={22} className="h2ic"/>Archivio</h2></div></div>
      <div className="tabletools">
        <label className="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={q} onChange={e=>{setQ(e.target.value);setSort(e.target.value.trim()?{col:null,dir:"desc"}:DEFAULT_SORT);}} placeholder="Cerca" aria-label="Cerca"/>
        </label>
        {q&&<button className="clr" onClick={()=>{setQ("");setSort(DEFAULT_SORT);}}>Azzera</button>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>{cols.map(([c,l])=>(
            <th key={c} className={sort.col===c?"act":""} onClick={()=>setCol(c)}>{l}<SortIcon col={c}/></th>
          ))}</tr></thead>
          <tbody>
            {rows.map((c,i)=>{const pl=isPlanned(c);const fest=isFestival(c.ev);return (
              <tr key={i}>
                <td className="artist">{hl(c.artist,q)}{fest&&<span className="cfest" title={"Concerto al festival "+festName(c.ev)}>{hl(festName(c.ev),q)}</span>}</td>
                <td className="date">{pl?<span className="d-planned">{c.date}</span>:<span className="d-past">{c.date}</span>}</td>
                <td>{hl(c.venue,q)}</td>
                <td className="with">{(c.with&&c.with.length)?c.with.join(", "):<span style={{color:"var(--dim)"}}>—</span>}</td>
                <td className="cost">{hasCost(c)?<span className="cval">{eur2(c.cost)}</span>:isCostNa(c)?<span className="cnamark" title="Biglietto pagato, prezzo non ricordato">n.d.</span>:isGift(c)?<span className="cgift" title={giftTitle(c,gifters)}><Icon name="gift" size={17}/><GifterMark id={c.giftFrom}/></span>:isAccredito(c)?<span className="cgift" title="Accredito"><Icon name="handshake" size={17}/></span>:fest?<span className="cfestmark" title={"Incluso nel biglietto di "+festName(c.ev)}>festival</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                <td className="voto">{hasVoto(c)?<span style={{color:"var(--lamp)",fontWeight:600,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{c.voto}<span className="star">★</span></span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                <td className="cn">{hasCN(c)?<span className="viccell">{CN_LABELS[c.canzoniNote]}</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                <td className="city"><b>{hl(c.city,q)}</b></td>
                <td className="km">{distKm(c)!==null?<span style={{whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>~{km0(distKm(c)!)} <span style={{color:"var(--muted)"}}>da {departures[c.from!]}</span></span>:fest?<span className="cfestmark" title={"Incluso nel viaggio di "+festName(c.ev)}>festival</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                <td className="vic">{hasVic(c)?<span className="viccell">{VIC_LABELS[c.vicinanza]}</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                <td className="comment"><CommentCell ev={c.ev} onOpen={setCommentEv}/></td>
              </tr>
            );})}
            {rows.length===0&&<tr><td colSpan={11} style={{textAlign:"center",padding:"30px",color:"var(--muted)"}}>Nessun concerto trovato.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="resn">
        {rows.length} concert{rows.length===1?"o":"i"} {q?"su "+CONC.length:""}
        {orderNote && <span className="ordn"> · {orderNote}</span>}
        {sort.col && searching && <button className="relink" onClick={()=>setSort({col:null,dir:"desc"})}>torna alla pertinenza</button>}
      </div>

      {/* Second table: the events that bundle several concerts under one ticket. */}
      {fests.length>0&&(<>
        <div className="archsub"><Icon name="ticket" size={18} className="h2ic"/><h3>Eventi</h3><span className="archsub-d">un biglietto, più concerti</span></div>
        <div className="tablewrap">
          <table>
            <thead><tr>
              <th>Festival</th><th>Data</th><th>Venue</th><th>Città</th><th>Costo</th><th>Viaggio</th><th>Concerti</th><th>Commenti</th>
            </tr></thead>
            <tbody>
              {fests.map((ev,i)=>{const pl=isPlanned(ev);return (
                <tr key={i}>
                  <td className="artist">{hl(ev.name,q)}</td>
                  <td className="date">{pl?<span className="d-planned">{ev.date}</span>:<span className="d-past">{ev.date}</span>}</td>
                  <td>{hl(ev.venue,q)}</td>
                  <td className="city"><b>{hl(ev.city,q)}</b></td>
                  <td className="cost">{hasCost(ev)?<span className="cval">{eur2(ev.cost)}</span>:isCostNa(ev)?<span className="cnamark" title="Biglietto pagato, prezzo non ricordato">n.d.</span>:isGift(ev)?<span className="cgift" title={giftTitle(ev,gifters)}><Icon name="gift" size={17}/><GifterMark id={ev.giftFrom}/></span>:isAccredito(ev)?<span className="cgift" title="Accredito"><Icon name="handshake" size={17}/></span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                  <td className="km">{distKm(ev)!==null?<span style={{whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>~{km0(distKm(ev)!)} <span style={{color:"var(--muted)"}}>da {departures[ev.from!]}</span></span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                  <td className="evconc">{ev.concerts.map((c,j)=>(<span className="evconc-line" key={j}>{c.artist}</span>))}</td>
                  <td className="comment"><CommentCell ev={ev} onOpen={setCommentEv}/></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        <div className="resn">{fests.length} event{fests.length===1?"o":"i"}{q?" trovat"+(fests.length===1?"o":"i"):""}</div>
      </>)}

      <CommentModal ev={commentEv} onClose={()=>setCommentEv(null)}/>
    </section>
  );
}
