import React, { useState, useMemo, useRef } from "react";
import Fuse from "fuse.js";
import { ALLDATA, PEOPLE, VENUE_COORDS, CITY_COORDS, CANZONI_NOTE_LABELS, concertsOf, flatConcerts } from "./data.ts";
import { SECTIONS } from "./chat/tools.ts";
import ChatWidget from "./chat/ChatWidget.tsx";

const MESI=["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"];
/* ── Compagni: enum delle persone con cui vado ai concerti.
   Aggiungi qui i nomi consentiti, poi popola il campo "with" di ogni evento. ── */

/* ── Live-music glyphs: thin line icons, inherit currentColor ── */
const PATHS={
  // KPI stats
  ticket:<><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z"/><path d="M14 7v10" strokeDasharray="1.5 2"/></>,
  mic:<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></>,
  repeat:<><path d="M4 8a4 4 0 0 1 4-4h9M17 4l-3-3M17 4l-3 3"/><path d="M20 16a4 4 0 0 1-4 4H7M7 20l3 3M7 20l3-3"/></>,
  pin:<><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></>,
  star:<><path d="M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.2L6.2 19.4l1.3-6-4.5-4 6-.7L12 3Z"/></>,
  users:<><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M16.5 14.2A5.5 5.5 0 0 1 20.5 19.5"/></>,
  user:<><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
  // card titles
  calendar:<><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>,
  trophy:<><path d="M7 4h10v4a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 16h6M12 13v3M9 20h6"/></>,
  map:<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></>,
  chart:<><path d="M4 4v16h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/></>,
  list:<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
  seat:<><path d="M5 11V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5"/><path d="M4 11h13a2 2 0 0 1 2 2v3H6a2 2 0 0 1-2-2v-3Z"/><path d="M6 16v4M17 16v4"/></>,
  target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></>,
  note:<><circle cx="6.5" cy="17.5" r="2.8"/><circle cx="17" cy="15.5" r="2.8"/><path d="M9.3 17.5V6.2l10.5-2.1v11.4M9.3 9.7l10.5-2.1"/></>,
  eyeclosed:<><path d="M3 10c2.6 3 5.7 4.5 9 4.5s6.4-1.5 9-4.5"/><path d="M12 14.5v3.2M6.1 13.3l-2 2.6M17.9 13.3l2 2.6M8.9 14.2l-1.1 3M15.1 14.2l1.1 3"/></>,
  euro:<><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5a4 4 0 1 0 0 7M7 11h6M7 13.5h5"/></>,
  gift:<><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8S10.5 4 8 4a2 2 0 0 0 0 4h4ZM12 8s1.5-4 4-4a2 2 0 0 1 0 4h-4Z"/></>,
  handshake:<><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></>,
  coins:<><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></>,
  wallet:<><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z"/><circle cx="17" cy="14" r="1"/></>,
  chevron:<><path d="M6 9l6 6 6-6"/></>,
};
function Icon({name,size=16,stroke=1.5,className,style}: any){
  return <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>;
}

/* ============================================================
   MAP CONFIG — paste your Mapbox public token below (starts with "pk.")
   Get one free at https://account.mapbox.com/access-tokens/
   Tip: restrict it by URL in your Mapbox account for safety.
   ============================================================ */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

// Venue coordinates [lng, lat] — hardcoded, no runtime geocoding

const sortKey=d=>{const m=d.date.match(/(\d{1,2})(?:–\d{1,2})?\/(\d{2})\/(\d{4})/);return m?(+m[3])*10000+(+m[2])*100+(+m[1]):0;};
// weekday 0=lunedì..6=domenica; multi-day events count on their first day, like sortKey
const GIORNI=["LUN","MAR","MER","GIO","VEN","SAB","DOM"];
const weekdayOf=d=>{const m=d.date.match(/(\d{1,2})(?:–\d{1,2})?\/(\d{2})\/(\d{4})/);return m?(new Date(+m[3],+m[2]-1,+m[1]).getDay()+6)%7:0;};
const todayKey=()=>{const t=new Date();return t.getFullYear()*10000+(t.getMonth()+1)*100+t.getDate();};
const isPlanned=d=>sortKey(d)>=todayKey();
const monthOf=d=>parseInt(d.date.split("/")[1],10)-1;
const CHRON=[...ALLDATA].sort((a,b)=>sortKey(a)-sortKey(b));
// Event vs concert: an ALLDATA row is an EVENT (ticket/trip/evening); a
// festival row contains several CONCERTS in `sets`. FLAT_ALL is every
// concert, with its event context spread in (see concertsOf in data.ts).
// Money/trip/posto stats stay on events; artist/voto/vicinanza/canzoni/
// compagni stats run on concerts.
const FLAT_ALL=flatConcerts(ALLDATA);
const counter=(arr,k)=>{const m={};arr.forEach(x=>{const v=typeof k==="function"?k(x):x[k];m[v]=(m[v]||0)+1});return m;};
// like counter, but for array-valued fields (e.g. "with"): counts each element
const multiCounter=(arr,k)=>{const m={};arr.forEach(x=>{(x[k]||[]).forEach(v=>{m[v]=(m[v]||0)+1});});return m;};
const ranked=(o:Record<string,number>)=>Object.entries(o).sort((a,b)=>b[1]-a[1]);
// Rank-aware cutoff for "top" cards. Walks a ranked [name,value] list and grows
// the visible set rank by rank (a "rank" = all items sharing the same value).
// Rules: keep going while under `soft` (a comfortable target count); whenever a
// rank is shown, show ALL of its members; but never exceed `hard` (the height
// ceiling) — so a rank that would push past `hard` is dropped whole, not split.
const rankCutoff=(rows,soft=8,hard=8)=>{
  const out=[];
  for(let i=0;i<rows.length;){
    const v=rows[i][1];let j=i;while(j<rows.length&&rows[j][1]===v)j++; // [i,j) = this rank
    if(out.length>0&&j>hard) break;          // adding this whole rank blows the ceiling → stop
    for(let k=i;k<j;k++) out.push(rows[k]);   // show the rank in full
    i=j;
    if(out.length>=soft) break;               // hit the comfortable target → stop after completing the rank
  }
  return out;
};
// cost helpers — `cost` is the all-in price paid for a single seat (fees included), in EUR.
// Many concerts have no known price; those are simply excluded from every cost stat.
const hasCost=d=>typeof d.cost==="number";
// a concert can be: priced (cost number) · a gift (someone paid for it) ·
// an accredito (guest list/press pass, free entry) · unknown.
// gifts, accrediti and unknowns never enter the money stats.
const isGift=d=>d.gift===true;
const isAccredito=d=>d.accredito===true;
// voto — personal 1..5-star rating, given only after attending. Planned concerts
// can't have one yet; any past concert without a voto is simply left out of vote stats.
const hasVoto=d=>typeof d.voto==="number";
// from — città di partenza del viaggio ("m" Milano / "g" Genova). Come voto e
// vicinanza si può impostare anche dopo l'evento: assente = non ancora definita.
// I km sono precalcolati offline e salvati per-concerto in data.ts (vedi CLAUDE.md):
// nessuna coordinata di partenza né formula di distanza deve vivere nel bundle.
const FROM_LABELS={m:"Milano",g:"Genova"};
const hasFrom=d=>d.from==="m"||d.from==="g";
const fromMissing=d=>!isPlanned(d)&&!hasFrom(d);   // passato senza partenza -> da segnalare
// one-way km from home; null if origin unknown or km not yet computed
const distKm=d=>hasFrom(d)&&typeof d.km==="number"?d.km:null;
const km0=n=>Math.round(n).toLocaleString("it-IT")+" km";
const voto1=n=>n.toLocaleString("it-IT",{minimumFractionDigits:1,maximumFractionDigits:1});
const eur0=n=>"€"+Math.round(n).toLocaleString("it-IT");
const eur2=n=>"€"+n.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
const sum=a=>a.reduce((s,x)=>s+x,0);

/* ── Filtri: dimensioni sensate sul dataset, AND tra dimensioni, OR dentro una dimensione ── */
const ALL_YEARS=[...new Set(ALLDATA.map(d=>d.y))].sort((a,b)=>a-b);
const YEAR_MIN=ALL_YEARS[0], YEAR_MAX=ALL_YEARS[ALL_YEARS.length-1];
// ISO bounds (YYYY-MM-DD) for the native date pickers, spanning all events
const keyToISO=k=>{const s=String(k).padStart(8,"0");return s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8);};
const DATE_LO=keyToISO(Math.min(...ALLDATA.map(sortKey)));
const DATE_HI=keyToISO(Math.max(...ALLDATA.map(sortKey)));
const ALL_CITIES=[...new Set(ALLDATA.map(d=>d.city))].sort((a,b)=>a.localeCompare(b,"it"));
const ALL_PEOPLE=[...new Set(FLAT_ALL.flatMap(c=>c.with||[]))].sort((a,b)=>a.localeCompare(b,"it"));
// posto = dove ero nella venue. Ordine fisso e sensato (vicino→lontano, in piedi→seduto).
const POSTO_ORDER=["Pit/Gold","Prato/Parterre","Platea","Gradinata"];
const ALL_POSTI=POSTO_ORDER.filter(p=>ALLDATA.some(d=>d.posto===p));
// ---- Vicinanza (vantaggio sul palco): scala ordinale 1..6 -------------------
// 1 Transenna, 2 Sottopalco, 3 Centro = "vicino"; 4 Fondo, 5 Tribuna, 6 Anello alto = "lontano".
// Per-CONCERTO: nei festival ogni set ha la sua. Assente = non ancora definita (eventi futuri).
const VIC_LABELS={1:"Transenna",2:"Sottopalco",3:"Centro",4:"Fondo",5:"Tribuna",6:"Anello alto"};
const VIC_ORDER=[1,2,3,4,5,6];
const hasVic=d=>typeof d.vicinanza==="number";        // valore vero, entra nel recap
const vicMissing=c=>!isPlanned(c)&&!hasVic(c);        // concerto passato senza valore -> da segnalare
const votoMissing=c=>!isPlanned(c)&&!hasVoto(c);      // concerto passato senza voto -> da segnalare
// canzoniNote ("Canzoni note"): scala ordinale 1..5, per-concerto come vicinanza
// (assente = non ancora definita, "na" = non ricordo e fuori dal recap).
const hasCN=d=>typeof d.canzoniNote==="number";
const ALL_VIC=VIC_ORDER.filter(v=>FLAT_ALL.some(c=>c.vicinanza===v));
const CN_ORDER=[1,2,3,4,5];
const ALL_CN=CN_ORDER.filter(v=>FLAT_ALL.some(c=>c.canzoniNote===v));
const COST_MIN=0;
const COST_MAX=Math.ceil(Math.max(...ALLDATA.filter(hasCost).map(d=>d.cost))/10)*10;
const KM_MIN=0;
const KM_MAX=Math.ceil(Math.max(...ALLDATA.map(d=>distKm(d)).filter(k=>k!==null))/10)*10;
// ISO YYYY-MM-DD (from a native date input) → comparable YYYYMMDD integer
const isoKey=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");return m?(+m[1])*10000+(+m[2])*100+(+m[3]):null;};

const EMPTY_FILTERS={dateFrom:"",dateTo:"",cities:[],people:[],posti:[],vicinanze:[],canzoni:[],status:"all",price:"all",solo:false,costMin:COST_MIN,costMax:COST_MAX,kmMin:KM_MIN,kmMax:KM_MAX};
const isDefaultDate=f=>!f.dateFrom&&!f.dateTo;
const isDefaultCost=f=>f.costMin===COST_MIN&&f.costMax===COST_MAX;
const isDefaultKm=f=>f.kmMin===KM_MIN&&f.kmMax===KM_MAX;
const isEmptyFilters=f=>isDefaultDate(f)&&f.cities.length===0&&f.people.length===0&&f.posti.length===0&&f.vicinanze.length===0&&f.canzoni.length===0&&f.status==="all"&&f.price==="all"&&!f.solo&&isDefaultCost(f)&&isDefaultKm(f);
const countActive=f=>(f.dateFrom?1:0)+(f.dateTo?1:0)+f.cities.length+f.people.length+f.posti.length+f.vicinanze.length+f.canzoni.length+(f.status!=="all"?1:0)+(f.price!=="all"?1:0)+(f.solo?1:0)+(isDefaultCost(f)?0:1)+(isDefaultKm(f)?0:1);

/* Recap testuale dei filtri attivi — usato dalla chat AI per confermare cosa mostra la pagina. */
function describeFilters(f){
  const parts=[];
  if(f.status==="attended") parts.push("solo già visti");
  if(f.status==="planned") parts.push("solo in programma");
  if(f.dateFrom) parts.push("dal "+f.dateFrom);
  if(f.dateTo) parts.push("fino al "+f.dateTo);
  if(f.cities.length) parts.push("città: "+f.cities.join(", "));
  if(f.people.length) parts.push("con: "+f.people.join(", "));
  if(f.solo) parts.push("da solo");
  if(f.posti.length) parts.push("posto: "+f.posti.join(", "));
  if(f.vicinanze.length) parts.push("vicinanza: "+f.vicinanze.map(v=>VIC_LABELS[v]||v).join(", "));
  if(f.canzoni.length) parts.push("canzoni note: "+f.canzoni.map(v=>CANZONI_NOTE_LABELS[v]||v).join(", "));
  if(f.price==="paid") parts.push("solo con prezzo");
  if(f.price==="gift") parts.push("solo regalati");
  if(f.price==="accredito") parts.push("solo con accredito");
  if(f.price==="unknown") parts.push("solo senza prezzo");
  if(!isDefaultCost(f)) parts.push("costo €"+f.costMin+"–€"+f.costMax);
  if(!isDefaultKm(f)) parts.push("viaggio "+f.kmMin+"–"+f.kmMax+" km");
  return parts.length?parts.join("; "):"nessun filtro attivo";
}

/* Applica l'input del tool AI `set_filters` (già validato dallo schema) allo stato filtri. */
function mergeToolFilters(cur,input){
  const next={...(input.replace?EMPTY_FILTERS:cur)};
  const iso=s=>s===""||isoKey(s)!=null?s:undefined; // "" clears, invalid dates ignored
  if(input.status!==undefined) next.status=input.status;
  if(input.dateFrom!==undefined&&iso(input.dateFrom)!==undefined) next.dateFrom=input.dateFrom;
  if(input.dateTo!==undefined&&iso(input.dateTo)!==undefined) next.dateTo=input.dateTo;
  if(input.cities!==undefined) next.cities=input.cities.filter(c=>ALL_CITIES.includes(c));
  if(input.people!==undefined) next.people=input.people.filter(p=>ALL_PEOPLE.includes(p));
  if(input.solo!==undefined) next.solo=!!input.solo;
  if(input.posti!==undefined) next.posti=input.posti.filter(p=>ALL_POSTI.includes(p));
  if(input.vicinanze!==undefined) next.vicinanze=input.vicinanze.map(Number).filter(v=>ALL_VIC.includes(v));
  if(input.canzoniNote!==undefined) next.canzoni=input.canzoniNote.map(Number).filter(v=>ALL_CN.includes(v));
  if(input.price!==undefined) next.price=input.price;
  const clampCost=v=>Math.min(COST_MAX,Math.max(COST_MIN,Math.round(v)));
  if(input.costMin!==undefined) next.costMin=clampCost(input.costMin);
  if(input.costMax!==undefined) next.costMax=clampCost(input.costMax);
  if(next.costMin>next.costMax) [next.costMin,next.costMax]=[next.costMax,next.costMin];
  const clampKm=v=>Math.min(KM_MAX,Math.max(KM_MIN,Math.round(v)));
  if(input.kmMin!==undefined) next.kmMin=clampKm(input.kmMin);
  if(input.kmMax!==undefined) next.kmMax=clampKm(input.kmMax);
  if(next.kmMin>next.kmMax) [next.kmMin,next.kmMax]=[next.kmMax,next.kmMin];
  return next;
}

// Per-concert criteria, checked against anything with with/vicinanza/canzoniNote
// (a single-concert event or one festival set).
const concertMatches=(f,c)=>{
  if(f.people.length && !(c.with||[]).some(p=>f.people.includes(p))) return false;
  if(f.solo && (c.with&&c.with.length)) return false;
  if(f.vicinanze.length && !(hasVic(c)&&f.vicinanze.includes(c.vicinanza))) return false;
  if(f.canzoni.length && !(hasCN(c)&&f.canzoni.includes(c.canzoniNote))) return false;
  return true;
};
const hasConcertFilters=f=>f.people.length>0||f.solo||f.vicinanze.length>0||f.canzoni.length>0;

function applyFilters(data,f){
  const from=isoKey(f.dateFrom), to=isoKey(f.dateTo);
  const out=[];
  for(const d of data){
    // event-level criteria: the whole row passes or fails
    const dk=sortKey(d);
    if(from!=null && dk<from) continue;
    if(to!=null && dk>to) continue;
    if(f.cities.length && !f.cities.includes(d.city)) continue;
    if(f.posti.length && !f.posti.includes(d.posto)) continue;
    if(f.status==="attended" && isPlanned(d)) continue;
    if(f.status==="planned" && !isPlanned(d)) continue;
    if(f.price==="paid" && !hasCost(d)) continue;
    if(f.price==="gift" && !isGift(d)) continue;
    if(f.price==="accredito" && !isAccredito(d)) continue;
    if(f.price==="unknown" && (hasCost(d)||isGift(d)||isAccredito(d))) continue;
    // cost range: only constrains events with a known price; gifts/accrediti/unknowns pass through
    // unless the range is narrowed from the default, in which case only priced ones in range qualify
    if(!isDefaultCost(f)){
      if(!hasCost(d)) continue;
      if(d.cost<f.costMin || d.cost>f.costMax) continue;
    }
    // km range: like the cost range, it only kicks in when narrowed from the
    // default, and then admits only events with a known trip distance
    if(!isDefaultKm(f)){
      const k=distKm(d);
      if(k===null || k<f.kmMin || k>f.kmMax) continue;
    }
    // per-concert criteria: a festival stays if at least one set matches, and
    // is narrowed to the matching sets so every card downstream sees only those
    if(d.sets){
      const keep=hasConcertFilters(f)?d.sets.filter(s=>concertMatches(f,s)):d.sets;
      if(!keep.length) continue;
      out.push(keep.length===d.sets.length?d:{...d,sets:keep});
    }else{
      if(hasConcertFilters(f) && !concertMatches(f,d)) continue;
      out.push(d);
    }
  }
  return out;
}

const FilterContext=React.createContext<any>({data:ALLDATA,filters:EMPTY_FILTERS,setFilters:()=>{}});
const useData=()=>React.useContext(FilterContext).data;
const useFilters=()=>React.useContext(FilterContext);

function KPIs(){
  const DATA=useData();
  // events (tickets/trips) vs concerts (sets watched): each stat picks its unit
  const ATTENDED=DATA.filter(d=>!isPlanned(d));
  const PLANNED=DATA.filter(isPlanned);
  const CONC=DATA.flatMap(concertsOf);
  const ATT_C=CONC.filter(c=>!isPlanned(c));
  const PL_C=CONC.filter(isPlanned);
  const total=ATT_C.length;          // concerti visti (un festival ne conta uno per set)
  const planned=PL_C.length;
  const artists=new Set(ATT_C.map(c=>c.artist)).size;
  const cities=new Set(ATTENDED.map(d=>d.city)).size;
  const companions=new Set(ATT_C.flatMap(c=>c.with||[])).size;
  const evTotal=ATTENDED.length;
  const milano=evTotal?Math.round(ATTENDED.filter(d=>d.city==="Milano").length/evTotal*100):0;
  const since=2022;
  const dataSince=ATT_C.filter(c=>c.y>=since);
  // continuous-time rate: attended concerts ÷ years elapsed since 1 Jan 2022, so a
  // barely-started current year doesn't weigh like a full one in the denominator
  const elapsedYSince=(Date.now()-new Date(since,0,1).getTime())/(365.25*24*3600*1000);
  const avgSince=(dataSince.length/elapsedYSince).toFixed(1);
  // most frequent companion across attended concerts (per set: who's actually next to me)
  const topMate=ranked(counter(ATT_C.flatMap(c=>c.with||[]),x=>x))[0]||["—",0];
  // concerts watched alone (a festival set counts even if I had company earlier that day)
  const solo=ATT_C.filter(c=>!(c.with&&c.with.length)).length;
  // voto — per concerto: average over rated (attended) sets
  const voted=ATT_C.filter(hasVoto);
  const avgVoto=voted.length?sum(voted.map(c=>c.voto))/voted.length:0;
  // money — per biglietto (event): only events with a known price (gifts/unknowns excluded)
  const priced=DATA.filter(hasCost);
  const totalSpent=sum(priced.map(d=>d.cost));
  const avgSpent=priced.length?totalSpent/priced.length:0;
  // km — round trip from the origin city, per event, only attended with a known `from`
  // (planned trips haven't happened yet, so they don't belong in a "km traveled" total)
  const trips=ATTENDED.map(d=>distKm(d)).filter(k=>k!==null);
  const totalKm=sum(trips)*2;
  const nextPlanned=[...PLANNED].sort((a,b)=>sortKey(a)-sortKey(b))[0];
  // alla cieca — concerti visti conoscendo nessuna o poche canzoni; il "su M"
  // è sui concerti con un valore vero di canzoniNote ("na"/assenti esclusi)
  const cnKnown=CONC.filter(hasCN).length;
  const cieca=CONC.filter(c=>hasCN(c)&&c.canzoniNote<=2).length;
  const items:any[]=[
    {num:total,lbl:"Concerti",hint:"sino ad oggi",ic:"ticket",accent:"amber"},
    {num:planned,lbl:"In programma",ic:"calendar",accent:"planned",hint:nextPlanned?"prossimo "+nextPlanned.date:undefined},
    {num:avgSince,lbl:"media per anno",hint:"dal 2022 a oggi",ic:"repeat"},
    {num:voted.length?<>{voto1(avgVoto)}<span className="star" style={{fontSize:"0.58em"}}>★</span></>:"—",lbl:"Voto medio",hint:voted.length+" concerti votati",ic:"star"},
    {num:eur0(totalSpent),lbl:"Speso in totale",hint:priced.length+" biglietti",ic:"coins"},
    {num:eur0(avgSpent),lbl:"Spesa media",hint:priced.length+" biglietti",ic:"wallet"},
    {num:cities,lbl:"Città",hint:milano+"% a Milano",ic:"pin"},
    {num:artists,lbl:"Artisti diversi",hint:(total-artists)+" repliche",ic:"mic"},
    {num:companions,lbl:"Compagni",ic:"users",hint:"#1 "+topMate[0]},
    {num:solo,lbl:"Concerti da solo",ic:"user",hint:(total?Math.round(solo/total*100):0)+"% del totale"},
    {num:cieca,lbl:"Alla cieca",ic:"eyeclosed",hint:cnKnown?"su "+cnKnown+" concerti":undefined},
    {num:"~"+Math.round(totalKm).toLocaleString("it-IT"),lbl:"Km di viaggi",hint:"andata e ritorno",ic:"map"},
  ];
  return <section className="kpis">{items.map((k,i)=>(
    <div className="kpi" key={i}><div className={"num"+(k.accent?" acc-"+k.accent:"")}>{k.num}</div><div className="lbl"><Icon name={k.ic} size={13} className="kic"/>{k.lbl}</div>{k.hint&&<div className="hint">{k.hint}</div>}{k.note&&<div className="pnote">{k.note}</div>}</div>
  ))}</section>;
}

function YearChart(){
  const DATA=useData();
  // per concerto: un festival contribuisce con un'unità per set visto
  const CONC=DATA.flatMap(concertsOf);
  const att=counter(CONC.filter(c=>!isPlanned(c)),"y");
  const pl=counter(CONC.filter(isPlanned),"y");
  const yc:Record<number,number>={};const span:number[]=[];const endY=Math.max(2026,...DATA.map(d=>d.y));for(let y=2017;y<=endY;y++){span.push(y);yc[y]=(att[y]||0)+(pl[y]||0);}
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
  const CHRON=useMemo(()=>[...DATA].sort((a,b)=>sortKey(a)-sortKey(b)),[DATA]);
  let lastYear=null;
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

function ChartCard(){
  const DATA=useData();
  const [view,setView]=useState("year");
  const swipe=useSwipeToggle(()=>setView("year"),()=>setView("time"));
  const meta = view==="year"
    ? {t:"Concerti per anno",d:"La frequenza nel tempo. Gli anni vuoti (2018, 2021) segnano lo stop dei live; dal 2024 la curva esplode."}
    : {t:"Timeline",d:"Ogni evento in ordine cronologico lungo una linea orizzontale scorrevole."};
  return (
    <section className="panel full" {...swipe}>
      <div className="paneltop">
        <div><h2><Icon name="chart" size={22} className="h2ic"/>{meta.t}</h2></div>
        <div className="toggle">
          <button className={"tg"+(view==="year"?" on":"")} onClick={()=>setView("year")}>Per anno</button>
          <button className={"tg"+(view==="time"?" on":"")} onClick={()=>setView("time")}>Timeline</button>
        </div>
      </div>
      {view==="year"?<><YearChart/>{DATA.some(isPlanned)&&<div className="ylegend"><span className="lg lg-att">Già visti</span><span className="lg lg-pl">In programma</span></div>}</>:<Timeline/>}
    </section>
  );
}

// Swipe support for cards with a view toggle: on touch devices a horizontal
// swipe on the card switches view (left = next tab, right = previous tab).
// Swipes that start inside horizontally-scrollable areas (e.g. the timeline
// track) are ignored so they keep scrolling normally.
function useSwipeToggle(onPrev,onNext){
  const start=useRef(null);
  const onTouchStart=e=>{
    if(e.target.closest&&e.target.closest(".tlscroll,input,select,textarea")){start.current=null;return;}
    const t=e.touches[0];
    start.current={x:t.clientX,y:t.clientY};
  };
  const onTouchEnd=e=>{
    if(!start.current)return;
    const t=e.changedTouches[0];
    const dx=t.clientX-start.current.x,dy=t.clientY-start.current.y;
    start.current=null;
    if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5){ dx<0?onNext():onPrev(); }
  };
  return {onTouchStart,onTouchEnd};
}

// Toggle for cards that cap their list. `count` = how many extra rows are hidden.
// `entity` carries Italian agreement for both number and gender:
//   {one:"altro",noun1:"artista", other:"altri",noun:"artisti"}
// so the label reads "Mostra altri 5 artisti" or, for a single hidden row,
// "Mostra altro 1 artista" / "Mostra un'altra città".
function ShowAllBtn({expanded,onClick,count,entity}: any){
  const label=expanded
    ? "Mostra meno"
    : (count===1
        ? `Mostra ${entity.one} ${entity.noun1}`
        : `Mostra ${entity.other} ${count} ${entity.noun}`);
  return (
    <button className={"showall"+(expanded?" exp":"")} onClick={onClick}>
      {label}<Icon name="chevron" size={14} className="chev"/>
    </button>
  );
}
// agreement presets per entity (singular drops the redundant "1": "un altro artista")
const ENT_ARTIST={one:"un altro",noun1:"artista",other:"altri",noun:"artisti"};
const ENT_PEOPLE={one:"un'altra",noun1:"persona",other:"altre",noun:"persone"};
const ENT_VENUE={one:"un'altra",noun1:"venue",other:"altre",noun:"venue"};
const ENT_CONCERT={one:"un altro",noun1:"concerto",other:"altri",noun:"concerti"};
const ENT_BIGLIETTO={one:"un altro",noun1:"biglietto",other:"altri",noun:"biglietti"};

function RankCard({title,desc,obj,plObj,color,min,unit,icon,field,multi,entity}: any){
  const DATA=useData();
  const [expanded,setExpanded]=useState(false);
  const m=min||1;
  const f=field||"artist";
  // planned split: callers counting per-concert pass their own plObj; the
  // default keeps the old per-event behaviour
  const plC=plObj||(multi?multiCounter(DATA.filter(isPlanned),f):counter(DATA.filter(isPlanned),f));
  const all=ranked(obj);
  const eligible=all.filter(e=>e[1]>=m);
  const ent=rankCutoff(eligible);
  const shown=expanded?eligible:ent;
  const hasMore=eligible.length>ent.length;
  return (
    <section className="panel">
      <h2><Icon name={icon||"trophy"} size={22} className="h2ic"/>{title}</h2>
      {shown.length>0 ? (<>
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
        {hasMore&&<ShowAllBtn expanded={expanded} onClick={()=>setExpanded(e=>!e)} count={eligible.length-ent.length} entity={entity||ENT_ARTIST}/>}
      </>) : (
        <p className="desc" style={{margin:0}}>Niente che si ripeta finora.</p>
      )}
    </section>
  );
}

function Months(){
  const DATA=useData();
  const mc:Record<number,number>={},mp:Record<number,number>={};for(let i=0;i<12;i++){mc[i]=0;mp[i]=0;}
  DATA.forEach(d=>{mc[monthOf(d)]++;if(isPlanned(d))mp[monthOf(d)]++;});
  const max=Math.max(...Object.values(mc),1);
  return (
    <section className="panel">
      <h2><Icon name="calendar" size={22} className="h2ic"/>Quando vado</h2>
      <div className="months">{Object.keys(mc).map(i=>{
        const v=mc[i],p=mp[i],a=v-p;const h=v?Math.max(4,Math.round(v/max*105)):2;
        const ph=v?Math.round(p/v*h):0;const ah=h-ph;
        return <div className={"mcol"+(v===max&&v>0?" top":"")} key={i}>
          <div className="mn">{a>0&&<span className="mnpast">{a}</span>}{p>0&&<span className="mnpl">{p}</span>}</div>
          <div className="mbar" style={{height:h+"px",opacity:v?1:.3}}>
            {p>0&&<div className="mseg mpl" style={{height:ph+"px"}}></div>}
            <div className="mseg ma" style={{height:(v?ah:h)+"px"}}></div>
          </div>
          <div className="ml">{MESI[i][0]}</div>
        </div>;
      })}</div>
    </section>
  );
}

function Weekdays(){
  const DATA=useData();
  const wc:Record<number,number>={},wp:Record<number,number>={};for(let i=0;i<7;i++){wc[i]=0;wp[i]=0;}
  DATA.forEach(d=>{wc[weekdayOf(d)]++;if(isPlanned(d))wp[weekdayOf(d)]++;});
  const max=Math.max(...Object.values(wc),1);
  return (
    <section className="panel">
      <h2><Icon name="calendar" size={22} className="h2ic"/>Che giorno esco</h2>
      <div className="days">{Object.keys(wc).map(i=>{
        const v=wc[i],p=wp[i],a=v-p;const h=v?Math.max(4,Math.round(v/max*105)):2;
        const ph=v?Math.round(p/v*h):0;const ah=h-ph;
        return <div className={"mcol"+(v===max&&v>0?" top":"")} key={i}>
          <div className="mn">{a>0&&<span className="mnpast">{a}</span>}{p>0&&<span className="mnpl">{p}</span>}</div>
          <div className="mbar" style={{height:h+"px",opacity:v?1:.3}}>
            {p>0&&<div className="mseg mpl" style={{height:ph+"px"}}></div>}
            <div className="mseg ma" style={{height:(v?ah:h)+"px"}}></div>
          </div>
          <div className="ml">{GIORNI[i]}</div>
        </div>;
      })}</div>
    </section>
  );
}

function VenueCard(){
  const DATA=useData();
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

function PostoCard(){
  const DATA=useData();
  // breakdown per categoria di posto, in ordine fisso; ogni barra split già-visti / in programma
  const rows=POSTO_ORDER.map(p=>{
    const list=DATA.filter(d=>d.posto===p);
    const pl=list.filter(isPlanned).length;
    return {p,n:list.length,a:list.length-pl,pl};
  }).filter(r=>r.n>0).sort((a,b)=>b.n-a.n);
  const total=rows.reduce((s,r)=>s+r.n,0);
  const max=Math.max(1,...rows.map(r=>r.n));
  return (
    <section className="panel">
      <h2><Icon name="seat" size={22} className="h2ic"/>Che biglietto prendo</h2>
      {rows.length>0 ? (
        <div className="rank">{rows.map(({p,n,a,pl})=>(
          <div className="rrow" key={p}>
            <div className="rtop"><span className="name">{p} · <span style={{color:"var(--muted)",fontWeight:400}}>{Math.round(n/total*100)}%</span></span><span className="val">{a>0&&<span className="vpast">{a}</span>}{a>0&&pl>0&&<span className="vplus"> + </span>}{pl>0&&<span className="vpl">{pl}</span>}</span></div>
            <div className="track">
              <div className="fill" style={{width:Math.round(a/max*100)+"%",background:"var(--lamp)"}}></div>
              {pl>0&&<div className="fill fpl" style={{width:Math.round(pl/max*100)+"%"}}></div>}
            </div>
          </div>
        ))}</div>
      ) : (
        <p className="desc" style={{margin:0}}>Nessun posto registrato.</p>
      )}
    </section>
  );
}

function VicinanzaCard(){
  const DATA=useData();
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

// ---- Cost analytics ----------------------------------------------------------
// Every figure here is computed only over concerts with a known `cost` (all-in,
// single seat). Unknown-price concerts are tolerated and just left out.

function SpendYearChart({rows}: any){
  // total spend per year, split past (amber) vs planned/already-paid (teal)
  const att={},pl={},cnt={},span=[];
  const endY=Math.max(2026,...rows.map(d=>d.y));
  for(let y=2022;y<=endY;y++){att[y]=0;pl[y]=0;cnt[y]=0;span.push(y);}
  rows.forEach(d=>{ if(d.y<2022) return; (isPlanned(d)?pl:att)[d.y]+=d.cost; cnt[d.y]++; });
  const tot=y=>att[y]+pl[y];
  const max=Math.max(...span.map(tot),1);
  const peak=span.slice().sort((a,b)=>att[b]-att[a])[0];
  const avgOf=y=>cnt[y]?tot(y)/cnt[y]:0;
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

function CostCard(){
  const DATA=useData();
  const known=DATA.filter(hasCost);
  const gifts=DATA.filter(isGift);
  return (
    <section className="panel full">
      <div className="paneltop">
        <div><h2><Icon name="wallet" size={22} className="h2ic"/>Quanto spendo</h2></div>
      </div>
      <SpendYearChart rows={known}/>
      <div className="ylegend"><span className="lg lg-att">Speso</span><span className="lg lg-pl">In programma (già pagato)</span><span className="lg lg-avg">Media a biglietto</span></div>
    </section>
  );
}

function TopSpend(){
  const DATA=useData();
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
          <div className="rtop"><span className="name">{d.artist} <span style={{color:"var(--muted)",fontWeight:400}}>· {d.city} '{String(d.y).slice(2)}</span></span><span className="val"><span className="vneu">{eur2(d.cost)}</span></span></div>
          <div className="track"><div className="fill" style={{width:Math.round(d.cost/max*100)+"%",background:isPlanned(d)?"var(--planned)":"var(--lamp)"}}></div></div>
        </div>
      ))}</div>
      {hasMore&&<ShowAllBtn expanded={expanded} onClick={()=>setExpanded(e=>!e)} count={full.length-7} entity={ENT_BIGLIETTO}/>}
    </section>
  );
}

function PriceDistribution(){
  const DATA=useData();
  const known=DATA.filter(hasCost);
  // bucket into €15 intervals starting at 0: [0,15), [15,30), …
  const W=15;
  const maxCost=known.length?Math.max(...known.map(d=>d.cost)):0;
  const nb=Math.max(1,Math.floor(maxCost/W)+1);
  const bins=Array.from({length:nb},(_,i)=>({lo:i*W,hi:(i+1)*W,n:0,att:0,pl:0}));
  known.forEach(d=>{const i=Math.min(nb-1,Math.floor(d.cost/W));bins[i].n++;(isPlanned(d)?(bins[i].pl++):(bins[i].att++));});
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

// ---- Vote analytics ----------------------------------------------------------
// Everything here runs on attended concerts that carry a `voto` (1..5 stars).
// Planned concerts can't be rated yet, so they never enter these charts.

function VoteDistribution(){
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
        <div className="starlegend">{[
          [5,"Epico","se non ci fossi stato mi sarei buttato"],
          [4,"Top","performance oltre le aspettative"],
          [3,"Bello","ha fatto il suo"],
          [2,"Evitabile","non vorrei rivivere l'evento"],
          [1,"Schifo","dovrebbero rimborsarmi il biglietto"],
        ].map(([v,w,t])=>
          <div className="sli" key={v}><span className="sv">{v}<span className="star">★</span></span><span className="sd"><b style={{color:"var(--text)"}}>{w}</b>, {t}</span></div>
        )}</div>
        <p className="desc" style={{margin:"18px auto 0",textAlign:"center"}}>Voto medio <b style={{color:"var(--lamp)"}}>{voto1(avg)}<span className="star">★</span></b> su {voted.length} concerti votati.</p>
      </>):(
        <p className="desc" style={{margin:0}}>Nessun concerto votato con questi filtri.</p>
      )}
    </section>
  );
}

function TopVoted(){
  const DATA=useData();
  const [expanded,setExpanded]=useState(false);
  // collapsed: best-rated concerts (4★ and up, festival sets included), newest
  // first within the same rating, with rankCutoff keeping whole ranks (a tie is
  // shown in full or held back entirely). Expanded: every rated concert, down to 1★.
  const allVoted=DATA.flatMap(concertsOf).filter(hasVoto)
    .sort((a,b)=>b.voto-a.voto||sortKey(b)-sortKey(a))
    .map(d=>[d,d.voto]);
  const eligible=allVoted.filter(([d])=>d.voto>=4);
  const cut=rankCutoff(eligible);
  const shown=expanded?allVoted:cut;
  const hasMore=allVoted.length>cut.length;
  return (
    <section className="panel">
      <h2><Icon name="trophy" size={22} className="h2ic"/>I migliori</h2>
      {shown.length>0?(<>
        <div className="rank">{shown.map(([d,v],i)=>(
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

function VoteScatter(){
  const DATA=useData();
  const DIMS=["cost","vic","cn"]; // tab order — swipe steps through it
  const DIM_NAMES={cost:"prezzo",vic:"vicinanza",cn:"canzoni note"};
  const [dim,setDim]=useState("cost"); // "cost" | "vic" | "cn"
  const swipe=useSwipeToggle(
    ()=>setDim(d=>DIMS[Math.max(0,DIMS.indexOf(d)-1)]),
    ()=>setDim(d=>DIMS[Math.min(DIMS.length-1,DIMS.indexOf(d)+1)])
  );
  const hasDim=dim==="cost"?hasCost:dim==="vic"?hasVic:hasCN;
  // per concerto. Sui set dei festival il prezzo non è definito (il biglietto è
  // dell'evento), quindi la vista Prezzo li esclude da sé; Vicinanza e Canzoni
  // note sono per-concerto e li includono.
  const pts=DATA.flatMap(concertsOf).filter(c=>hasVoto(c)&&hasDim(c));
  // svg geometry — viewBox scales with the panel width
  const W=720,H=310,ML=48,MR=16,MT=14,MB=42;
  const iw=W-ML-MR,ih=H-MT-MB;
  const yOf=v=>MT+ih*(1-(v-0.5)/5); // votes 1..5 with half-step padding
  const costMax=Math.max(50,Math.ceil(Math.max(0,...pts.map(d=>d.cost||0))/25)*25);
  const xOf=d=>dim==="cost"
    ? ML+(d.cost/costMax)*iw
    : dim==="vic"
    ? ML+((d.vicinanza-0.5)/6)*iw
    : ML+((d.canzoniNote-0.5)/5)*iw;
  const xTicks=dim==="cost"
    ? Array.from({length:costMax/25+1},(_,i)=>i*25).filter(t=>costMax<=150||t%50===0)
    : dim==="vic"?VIC_ORDER:[1,2,3,4,5];
  // overlapping points get a small deterministic offset so every dot stays visible
  const OFF=[[0,0],[0,11],[0,-11],[11,0],[-11,0],[11,11],[-11,-11],[11,-11],[-11,11],[0,22],[0,-22],[22,0],[-22,0],[22,11],[-22,-11],[22,-11],[-22,11],[11,22],[-11,-22]];
  const seen={};
  const nodes=pts.map(d=>{
    const bx=Math.round(xOf(d)/10),by=d.voto;
    const k=bx+"-"+by;
    const i=(seen[k]=(seen[k]||0)+1)-1;
    const [dx,dy]=OFF[i%OFF.length];
    const sc=dim==="cost"?0.55:1; // gentler nudge on the continuous axis
    return {d,x:xOf(d)+dx*sc,y:yOf(d.voto)+dy};
  });
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
      {pts.length>0?(<>
        <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}} role="img" aria-label={"Grafico a dispersione: voto contro "+DIM_NAMES[dim]}>
          {[1,2,3,4,5].map(v=>(
            <g key={v}>
              <line x1={ML} y1={yOf(v)} x2={W-MR} y2={yOf(v)} stroke="var(--line)" strokeWidth="1"/>
              <text x={ML-10} y={yOf(v)+4} textAnchor="end" fontSize="12" fill="var(--muted)" fontFamily="Inter,sans-serif">{v}<tspan dy="-1">★</tspan></text>
            </g>
          ))}
          {xTicks.map(t=>{
            const x=dim==="cost"?ML+(t/costMax)*iw:dim==="vic"?ML+((t-0.5)/6)*iw:ML+((t-0.5)/5)*iw;
            return <g key={t}>
              <line x1={x} y1={MT} x2={x} y2={MT+ih} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 5" opacity="0.6"/>
              <text x={x} y={H-14} textAnchor="middle" fontSize={dim==="cost"?14:12} fill="var(--muted)" fontFamily="Inter,sans-serif">{dim==="cost"?"€"+t:dim==="vic"?VIC_LABELS[t]:CANZONI_NOTE_LABELS[t]}</text>
            </g>;
          })}
          {nodes.map(({d,x,y},i)=>(
            <circle key={i} cx={x} cy={y} r="6" fill="var(--lamp)" fillOpacity="0.82" stroke="var(--bg-2)" strokeWidth="1.5">
              <title>{d.artist+" · "+d.date+" · "+"★".repeat(d.voto)+" · "+(dim==="cost"?eur2(d.cost):dim==="vic"?VIC_LABELS[d.vicinanza]:CANZONI_NOTE_LABELS[d.canzoniNote])}</title>
            </circle>
          ))}
        </svg>
      </>):(
        <p className="desc" style={{margin:0}}>Nessun concerto con voto e {DIM_NAMES[dim]} con questi filtri.</p>
      )}
    </section>
  );
}

function CanzoniNoteCard(){
  const DATA=useData();
  // breakdown per livello di "Canzoni note" (Tutte in cima), solo valori veri:
  // "na" e non-definiti restano fuori, come in VicinanzaCard. Ogni riga mostra
  // anche il voto medio dei concerti votati di quel livello: è la statistica
  // interessante — conoscere le canzoni cambia quanto mi godo il concerto?
  const CONC=DATA.flatMap(concertsOf); // per concerto, come vicinanza
  const rows=[5,4,3,2,1].map(v=>{
    const list=CONC.filter(c=>c.canzoniNote===v);
    const pl=list.filter(isPlanned).length;
    const voted=list.filter(hasVoto);
    return {v,n:list.length,a:list.length-pl,pl,avg:voted.length?sum(voted.map(d=>d.voto))/voted.length:null};
  }).filter(r=>r.n>0);
  const total=rows.reduce((s,r)=>s+r.n,0);
  const max=Math.max(1,...rows.map(r=>r.n));
  return (
    <section className="panel">
      <h2><Icon name="note" size={22} className="h2ic"/>Quante canzoni conosco</h2>
      {total>0?(<>
        <div className="rank">{rows.map(({v,n,a,pl,avg})=>(
          <div className="rrow" key={v}>
            <div className="rtop"><span className="name">{CANZONI_NOTE_LABELS[v]} · <span style={{color:"var(--muted)",fontWeight:400}}>{Math.round(n/total*100)}%{avg!=null&&<> · voto {voto1(avg)}<span className="star" style={{fontSize:"0.85em"}}>★</span></>}</span></span><span className="val">{a>0&&<span className="vpast">{a}</span>}{a>0&&pl>0&&<span className="vplus"> + </span>}{pl>0&&<span className="vpl">{pl}</span>}</span></div>
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

function hl(text,q){
  if(!q) return text;
  const i=text.toLowerCase().indexOf(q.toLowerCase());
  if(i<0) return text;
  return <>{text.slice(0,i)}<mark>{text.slice(i,i+q.length)}</mark>{text.slice(i+q.length)}</>;
}

function ArchiveTable(){
  const DATA=useData();
  const [q,setQ]=useState("");
  const DEFAULT_SORT={col:"date",dir:"desc"}; // default: newest first, shown in the Data column
  const [sort,setSort]=useState(DEFAULT_SORT); // col:null => relevance order (only while searching)

  const fuse=useMemo(()=>new Fuse(DATA,{
    keys:["artist","venue","city","with","sets.artist","sets.with"],threshold:0.2,ignoreLocation:true,minMatchCharLength:2,
  }),[DATA]);

  const searching=!!q.trim();
  // base order: Fuse relevance when searching, else newest-first by date
  let rows = searching ? fuse.search(q.trim()).map(r=>r.item) : [...DATA].sort((a,b)=>sortKey(b)-sortKey(a));

  // apply an explicit column sort only when the user has picked one; otherwise keep base order (relevance/date)
  if(sort.col){
    const dir=sort.dir==="asc"?1:-1;
    // per-concert columns: a festival row sorts on its best set value in the
    // sort direction (asc → min, desc → max); missing values sink like before
    const best=(d,has,get)=>{
      const vs=concertsOf(d).filter(has).map(get) as number[];
      return vs.length?(dir===1?Math.min(...vs):Math.max(...vs)):-Infinity;
    };
    rows=[...rows].sort((a,b)=>{
      let av,bv;
      if(sort.col==="date"){av=sortKey(a);bv=sortKey(b);}
      else if(sort.col==="cost"){av=hasCost(a)?a.cost:-Infinity;bv=hasCost(b)?b.cost:-Infinity;} // unknown prices sink to the bottom
      else if(sort.col==="voto"){av=best(a,hasVoto,c=>c.voto);bv=best(b,hasVoto,c=>c.voto);} // unrated (planned) sink like unknown prices
      else if(sort.col==="vicinanza"){av=best(a,hasVic,c=>c.vicinanza);bv=best(b,hasVic,c=>c.vicinanza);} // missing sink like unknown prices
      else if(sort.col==="canzoniNote"){av=best(a,hasCN,c=>c.canzoniNote);bv=best(b,hasCN,c=>c.canzoniNote);} // "na"/missing sink like unknown prices
      else if(sort.col==="km"){av=distKm(a)??-Infinity;bv=distKm(b)??-Infinity;} // unknown origins sink like unknown prices
      else if(sort.col==="with"){av=concertsOf(a).flatMap(c=>c.with||[]).join(", ").toLowerCase();bv=concertsOf(b).flatMap(c=>c.with||[]).join(", ").toLowerCase();}
      else{av=(a[sort.col]||"").toLowerCase();bv=(b[sort.col]||"").toLowerCase();}
      return av<bv?-dir:av>bv?dir:0;
    });
  }

  // click cycle: 1st tap sorts (date starts desc, others asc), 2nd tap flips, 3rd tap removes the sort
  const setCol=col=>{
    setSort(s=>{
      const first=col==="date"?"desc":"asc";
      const second=first==="asc"?"desc":"asc";
      if(s.col!==col) return {col,dir:first};
      if(s.dir===first) return {col,dir:second};
      return searching?{col:null,dir:"desc"}:DEFAULT_SORT; // remove: back to relevance (searching) or default date order
    });
  };
  const SortIcon=({col})=>{
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

  const cols=[["artist","Artista"],["date","Data"],["venue","Venue"],["with","Compagni"],["cost","Costo"],["voto","Voto"],["canzoniNote","Canzoni note"],["city","Città"],["km","Viaggio"],["posto","Posto"],["vicinanza","Vicinanza"]];
  const orderNote = sort.col ? null : (searching ? "Ordinati per pertinenza" : null);

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
            {rows.flatMap((d,i)=>{
              const pl=isPlanned(d);
              const dateCell=<td className="date">{pl?<span className="d-planned">{d.date}</span>:<span className="d-past">{d.date}</span>}</td>;
              const costCell=<td className="cost">{hasCost(d)?<span className="cval">{eur2(d.cost)}</span>:isGift(d)?<span className="cgift" title="Regalo"><Icon name="gift" size={17}/></span>:isAccredito(d)?<span className="cgift" title="Accredito"><Icon name="handshake" size={17}/></span>:<span style={{color:"var(--dim)"}}>—</span>}</td>;
              const kmCell=<td className="km">{distKm(d)!==null?<span style={{whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>~{km0(distKm(d))} <span style={{color:"var(--muted)"}}>da {FROM_LABELS[d.from]}</span></span>:<span style={{color:"var(--dim)"}}>—</span>}</td>;
              const postoCell=<td className="posto">{d.posto?<span className="postocell">{d.posto}</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>;
              if(!d.sets) return [(
                <tr key={i}>
                  <td className="artist">{hl(d.artist,q)}</td>
                  {dateCell}
                  <td>{hl(d.venue,q)}</td>
                  <td className="with">{(d.with&&d.with.length)?d.with.join(", "):<span style={{color:"var(--dim)"}}>—</span>}</td>
                  {costCell}
                  <td className="voto">{hasVoto(d)?<span style={{color:"var(--lamp)",fontWeight:600,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{d.voto}<span className="star">★</span></span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                  <td className="cn">{hasCN(d)?<span className="viccell">{CANZONI_NOTE_LABELS[d.canzoniNote]}</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                  <td className="city"><b>{hl(d.city,q)}</b></td>
                  {kmCell}
                  {postoCell}
                  <td className="vic">{hasVic(d)?<span className="viccell">{VIC_LABELS[d.vicinanza]}</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                </tr>
              )];
              // festival: an event header row (shared facts: date, venue, ticket,
              // trip, posto) with its concerts nested underneath (per-set facts)
              return [
                <tr key={i} className="evrow">
                  <td className="artist"><span className="evname">{hl(d.artist,q)}</span><span className="evcount">{d.sets.length} concerti</span></td>
                  {dateCell}
                  <td>{hl(d.venue,q)}</td>
                  <td className="with"></td>
                  {costCell}
                  <td className="voto"></td>
                  <td className="cn"></td>
                  <td className="city"><b>{hl(d.city,q)}</b></td>
                  {kmCell}
                  {postoCell}
                  <td className="vic"></td>
                </tr>,
                ...d.sets.map((s,si)=>(
                  <tr key={i+"-"+si} className="setrow">
                    <td className="artist setartist">{hl(s.artist,q)}</td>
                    <td className="date">{s.date?<span className="setdate">{s.date}</span>:null}</td>
                    <td></td>
                    <td className="with">{(s.with&&s.with.length)?s.with.join(", "):<span style={{color:"var(--dim)"}}>—</span>}</td>
                    <td className="cost"></td>
                    <td className="voto">{hasVoto(s)?<span style={{color:"var(--lamp)",fontWeight:600,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{s.voto}<span className="star">★</span></span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                    <td className="cn">{hasCN(s)?<span className="viccell">{CANZONI_NOTE_LABELS[s.canzoniNote]}</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                    <td className="city"></td>
                    <td className="km"></td>
                    <td className="posto"></td>
                    <td className="vic">{hasVic(s)?<span className="viccell">{VIC_LABELS[s.vicinanza]}</span>:<span style={{color:"var(--dim)"}}>—</span>}</td>
                  </tr>
                )),
              ];
            })}
            {rows.length===0&&<tr><td colSpan={11} style={{textAlign:"center",padding:"30px",color:"var(--muted)"}}>Nessun concerto trovato.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="resn">
        {(()=>{const n=rows.reduce((s,d)=>s+(d.sets?d.sets.length:1),0);const tot=DATA.reduce((s,d)=>s+(d.sets?d.sets.length:1),0);
          return <>{n} concert{n===1?"o":"i"} {q?"su "+tot:""}</>;})()}
        {orderNote && <span className="ordn"> · {orderNote}</span>}
        {sort.col && searching && <button className="relink" onClick={()=>setSort({col:null,dir:"desc"})}>torna alla pertinenza</button>}
      </div>
    </section>
  );
}

function MapCard(){
  const DATA=useData();
  const ref=useRef(null);
  const mapRef=useRef(null);
  const popRef=useRef(null);
  const [mode]=useState("venue"); // venue only
  const hasToken = MAPBOX_TOKEN && MAPBOX_TOKEN.indexOf("pk.")===0;

  // Build GeoJSON for the current mode
  const buildGeo=React.useCallback((m)=>{
    const coords = m==="venue"?VENUE_COORDS:CITY_COORDS;
    const keyOf = d=> m==="venue"?d.venue:d.city;
    const counts={};
    DATA.forEach(d=>{const k=keyOf(d);counts[k]=(counts[k]||0)+1;});
    const features=Object.keys(counts).map(k=>{
      const c=coords[k];
      if(!c) return null;
      const sample=DATA.find(d=>keyOf(d)===k);
      const group=DATA.filter(d=>keyOf(d)===k);
      const planned=group.filter(isPlanned).length;
      const attended=group.length-planned;
      // primary = dominant type, secondary = the other (only meaningful when mixed)
      const mixed = planned>0 && attended>0;
      const total = group.length;
      // Fixed roles: attended (amber) is always the inner disc, planned (teal)
      // is always the outer ring. When a venue has no attended shows the whole
      // marker is teal; with no planned shows it's the usual amber disc.
      const onlyPlanned = planned>0 && attended===0;
      // equal-RADIUS split: inner amber radius = attended share of the total
      const attendedShare = total ? attended/total : 1;
      const innerFactor = mixed ? Math.min(attendedShare, 0.78) : 1;
      const items=group
        .sort((a,b)=>sortKey(b)-sortKey(a))
        .map(d=>({artist:d.artist,year:d.y,planned:isPlanned(d)}));
      return {type:"Feature",geometry:{type:"Point",coordinates:c},
        properties:{name:k, city:m==="venue"?sample.city:k, count:counts[k],
          attended, planned, mixed, onlyPlanned, attendedShare, innerFactor,
          items:JSON.stringify(items)}};
    }).filter(Boolean);
    return {type:"FeatureCollection",features};
  },[DATA]);

  const maxCount=useMemo(()=>{
    const coords=mode==="venue"?VENUE_COORDS:CITY_COORDS;
    const keyOf=d=>mode==="venue"?d.venue:d.city;
    const counts:Record<string,number>={};DATA.forEach(d=>{const k=keyOf(d);counts[k]=(counts[k]||0)+1;});
    return Math.max(...Object.values(counts),1);
  },[mode,DATA]);

  const fitToData=React.useCallback(()=>{
    const map=mapRef.current; if(!map||!window.mapboxgl) return;
    const geo=buildGeo(mode);
    if(!geo.features.length) return;
    const b=new mapboxgl.LngLatBounds();
    geo.features.forEach(f=>b.extend(f.geometry.coordinates));
    map.fitBounds(b,{padding:60,maxZoom:11,duration:700});
  },[buildGeo,mode]);

  // Custom paint tinting applied to a vector basemap (see map.on('load'))

  const [mapboxReady,setMapboxReady]=useState(typeof window!=="undefined" && !!window.mapboxgl);
  const [loadError,setLoadError]=useState(false);

  // Ensure the Mapbox GL library is present; load it lazily if the CDN <script> didn't take.
  React.useEffect(()=>{
    if(!hasToken) return;
    if(window.mapboxgl){ setMapboxReady(true); return; }
    const VER="3.9.3";
    if(!document.querySelector('link[data-mapbox-css]')){
      const l=document.createElement("link");
      l.rel="stylesheet"; l.href=`https://api.mapbox.com/mapbox-gl-js/v${VER}/mapbox-gl.css`;
      l.setAttribute("data-mapbox-css","1"); document.head.appendChild(l);
    }
    let s=document.querySelector('script[data-mapbox-js]') as HTMLScriptElement|null;
    const onLoad=()=>{ if(window.mapboxgl) setMapboxReady(true); else setLoadError(true); };
    if(s){ s.addEventListener("load",onLoad); s.addEventListener("error",()=>setLoadError(true)); }
    else{
      s=document.createElement("script");
      s.src=`https://api.mapbox.com/mapbox-gl-js/v${VER}/mapbox-gl.js`;
      s.async=true; s.setAttribute("data-mapbox-js","1");
      s.addEventListener("load",onLoad);
      s.addEventListener("error",()=>setLoadError(true));
      document.head.appendChild(s);
    }
    return ()=>{ if(s){ s.removeEventListener("load",onLoad); } };
  },[hasToken]);

  React.useEffect(()=>{
    if(!hasToken || !mapboxReady || !ref.current) return;
    if(!window.mapboxgl){ setLoadError(true); return; }
    mapboxgl.accessToken=MAPBOX_TOKEN;
    const map=new mapboxgl.Map({
      container:ref.current,
      style:"mapbox://styles/mapbox/dark-v11",
      center:[9.6,45.0],
      zoom:5.4,
      attributionControl:true,
      // Don't hijack page scrolling: zoom needs Ctrl/Cmd+scroll on desktop and
      // two fingers on touch; a plain swipe/scroll over the map scrolls the page.
      cooperativeGestures:true,
      locale:{
        "ScrollZoomBlocker.CtrlMessage":"Usa Ctrl + scroll per zoomare la mappa",
        "ScrollZoomBlocker.CmdMessage":"Usa ⌘ + scroll per zoomare la mappa",
        "TouchPanBlocker.Message":"Usa due dita per muovere la mappa",
      },
    });
    mapRef.current=map;
    map.addControl(new mapboxgl.NavigationControl({showCompass:false}),"top-right");

    const css=getComputedStyle(document.documentElement);
    const bg=css.getPropertyValue("--bg").trim()||"#0a0a0b";
    const bg2=css.getPropertyValue("--bg-2").trim()||"#0d0d0f";
    const panel=css.getPropertyValue("--panel").trim()||"#101013";
    const amber=css.getPropertyValue("--lamp").trim()||"#d9a441";
    const teal=css.getPropertyValue("--planned").trim()||"#4bb3c4";
    const line=css.getPropertyValue("--line-2").trim()||"#2b2b32";
    const text=css.getPropertyValue("--text").trim()||"#e9e7e3";
    const muted=css.getPropertyValue("--muted").trim()||"#85838c";

    map.on("load",()=>{
      // Re-tint the dark basemap toward the stage palette
      const setIf=(id,prop,val)=>{ if(map.getLayer(id)){ try{map.setPaintProperty(id,prop,val);}catch(e){} } };
      const layers=map.getStyle().layers||[];
      layers.forEach(l=>{
        if(l.type==="background") setIf(l.id,"background-color",bg);
        if(l.id.includes("water")) setIf(l.id,"fill-color",bg2);
        if(l.id.includes("land")&&l.type==="fill") setIf(l.id,"fill-color",bg);
        if(l.type==="fill"&&(l.id.includes("landuse")||l.id.includes("park"))) { setIf(l.id,"fill-color",panel); setIf(l.id,"fill-opacity",.5); }
        if(l.type==="line"&&l.id.includes("road")) { setIf(l.id,"line-color",line); setIf(l.id,"line-opacity",.5); }
        if(l.type==="symbol") { setIf(l.id,"text-color",muted); setIf(l.id,"text-halo-color",bg); setIf(l.id,"text-halo-width",1.2); }
      });

      map.addSource("concerts",{type:"geojson",data:buildGeo("venue"),
        cluster:true, clusterRadius:38, clusterMaxZoom:14,
        clusterProperties:{
          attendedSum:["+",["get","attended"]],
          plannedSum:["+",["get","planned"]],
        }});

      // ---- Clustered points: same attended/planned split as single venues,
      // aggregated over all events in the cluster. Outer disc is teal when the
      // cluster contains any planned show; an inner amber disc carves out the
      // attended share by radius, leaving a teal "in programma" outer ring. ----
      const clMixed=["all",[">",["get","attendedSum"],0],[">",["get","plannedSum"],0]];
      const clOnlyPlanned=["all",["==",["get","attendedSum"],0],[">",["get","plannedSum"],0]];
      const clBaseR=["interpolate",["linear"],["get","point_count"],2,11,5,16,10,22];
      // inner amber radius = baseR · (attendedSum / point_count), but capped so a
      // teal "in programma" ring is always visible when the cluster is mixed.
      const clShare=["/",["get","attendedSum"],["max",["get","point_count"],1]];
      const clInnerR=["*",clBaseR,["min",clShare,0.78]];
      map.addLayer({
        id:"cl-glow",type:"circle",source:"concerts",
        filter:["has","point_count"],
        paint:{
          "circle-radius":["interpolate",["linear"],["get","point_count"],2,16,5,24,10,34],
          "circle-color":["case",clOnlyPlanned,teal,["case",clMixed,teal,amber]],
          "circle-opacity":.1,"circle-blur":1,
        }
      });
      map.addLayer({
        id:"clusters",type:"circle",source:"concerts",
        filter:["has","point_count"],
        paint:{
          "circle-radius":clBaseR,
          "circle-color":["case",["any",clMixed,clOnlyPlanned],teal,amber],
          "circle-opacity":.78,
          "circle-stroke-color":bg,
          "circle-stroke-width":["case",clMixed,0,1.5],
        }
      });
      map.addLayer({
        id:"cluster-inner",type:"circle",source:"concerts",
        filter:clMixed,
        paint:{
          "circle-radius":clInnerR,
          "circle-color":amber,"circle-opacity":.78,
        }
      });
      map.addLayer({
        id:"cluster-count",type:"symbol",source:"concerts",
        filter:["has","point_count"],
        layout:{
          "text-field":["to-string",["+",["get","attendedSum"],["get","plannedSum"]]],
          "text-size":["interpolate",["linear"],["get","point_count"],2,10,10,13],
          "text-font":["DIN Pro Bold","Arial Unicode MS Bold"],
          "text-allow-overlap":true,
        },
        paint:{"text-color":bg,"text-halo-color":["case",["any",clMixed,clOnlyPlanned],teal,amber],"text-halo-width":.3}
      });

      map.addLayer({
        id:"c-glow",type:"circle",source:"concerts",
        filter:["!",["has","point_count"]],
        paint:{
          "circle-radius":["interpolate",["linear"],["get","count"],1,14,2,16,4,21,8,30],
          "circle-color":["case",["get","onlyPlanned"],teal,
            ["case",["get","mixed"],teal,amber]],
          "circle-opacity":.1,
          "circle-blur":1,
        }
      });
      // Shared base radius for a marker (the full/outer disc)
      const baseR=["interpolate",["linear"],["get","count"],1,8,2,10,4,13,8,19];
      // Outer disc = planned (teal) whenever the venue has any upcoming show,
      // otherwise the usual attended (amber) disc. The inner amber disc on top
      // carves out the attended share by radius, leaving a teal outer ring.
      map.addLayer({
        id:"c-circles",type:"circle",source:"concerts",
        filter:["!",["has","point_count"]],
        paint:{
          "circle-radius":baseR,
          "circle-color":["case",["any",["get","mixed"],["get","onlyPlanned"]],teal,amber],
          "circle-opacity":.7,
          // thin bg separator only on pure markers; mixed ones get their edge
          // from the inner disc sitting inside the outer one
          "circle-stroke-color":bg,
          "circle-stroke-width":["case",["get","mixed"],0,1.5],
        }
      });
      // Inner disc (mixed only): always amber (attended), radius = baseR·attendedShare
      // (equal-radius split) so the teal outer ring width tracks the planned share.
      map.addLayer({
        id:"c-inner",type:"circle",source:"concerts",
        filter:["all",["!",["has","point_count"]],["get","mixed"]],
        paint:{
          "circle-radius":["*",baseR,["get","innerFactor"]],
          "circle-color":amber,
          "circle-opacity":.78,
        }
      });
      map.addLayer({
        id:"c-labels",type:"symbol",source:"concerts",
        filter:["!",["has","point_count"]],
        layout:{
          "text-field":["get","count"],
          "text-size":["interpolate",["linear"],["get","count"],1,10,8,12],
          "text-font":["DIN Pro Bold","Arial Unicode MS Bold"],
          "text-allow-overlap":true,
        },
        paint:{"text-color":bg,"text-halo-color":["case",["any",["get","mixed"],["get","onlyPlanned"]],teal,amber],"text-halo-width":.3}
      });

      // Popups
      const pop=new mapboxgl.Popup({offset:14,className:"mappop",closeButton:true});
      popRef.current=pop;
      map.on("click","c-circles",(e)=>{
        const f=e.features[0],p=f.properties;
        const isVenue = mode==="venue";
        let items=[];
        try{ items=JSON.parse(p.items||"[]"); }catch(_){}
        const list=items.map(it=>`<div class="pv-item"><span class="pv-art">${it.artist}</span><span class="pv-yr ${it.planned?"pv-yr-pl":"pv-yr-past"}">${it.year}</span></div>`).join("");
        pop.setLngLat(f.geometry.coordinates)
           .setHTML(`<div class="pv-name">${p.name}</div><div class="pv-meta">${isVenue?p.city:"Città"}</div><div class="pv-list">${list}</div>`)
           .addTo(map);
      });
      map.on("mouseenter","c-circles",()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave","c-circles",()=>map.getCanvas().style.cursor="");

      // Click a cluster to zoom in and expand it
      map.on("click","clusters",(e)=>{
        const f=map.queryRenderedFeatures(e.point,{layers:["clusters"]})[0];
        if(!f) return;
        const id=f.properties.cluster_id;
        const src=map.getSource("concerts");
        src.getClusterExpansionZoom(id,(err,zoom)=>{
          if(err) return;
          map.easeTo({center:f.geometry.coordinates,zoom,duration:500});
        });
      });
      map.on("mouseenter","clusters",()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave","clusters",()=>map.getCanvas().style.cursor="");
    });

    return ()=>{ map.remove(); mapRef.current=null; };
  },[hasToken,mapboxReady]);

  // Update data on mode change
  React.useEffect(()=>{
    const map=mapRef.current;
    if(!map||!map.getSource||!map.isStyleLoaded()) {
      if(map){ map.once("idle",()=>{ const s=map.getSource("concerts"); if(s) s.setData(buildGeo(mode)); }); }
      return;
    }
    const s=map.getSource("concerts");
    if(s) s.setData(buildGeo(mode));
    if(popRef.current) popRef.current.remove();
  },[mode,buildGeo]);

  return (
    <section className="panel full">
      <div className="paneltop">
        <div>
          <h2><Icon name="map" size={22} className="h2ic"/>Dove sono andato</h2>
        </div>
      </div>
      <div className="mapwrap">
        <div ref={ref} style={{position:"absolute",inset:0}}></div>
        {hasToken && mapboxReady && !loadError && DATA.some(isPlanned) && (
          <div className="mapnote">
            <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
              <span style={{width:12,height:12,borderRadius:"50%",background:"var(--lamp)",flexShrink:0}}></span>
              Già visti
            </span>
            <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
              <span style={{width:12,height:12,borderRadius:"50%",background:"var(--planned)",flexShrink:0}}></span>
              In programma
            </span>
          </div>
        )}
        {hasToken && mapboxReady && !loadError && (
          <button className="mapfit" onClick={fitToData} title="Adatta alla mappa">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>
            Adatta
          </button>
        )}
        {hasToken && !mapboxReady && !loadError && (
          <div className="maptokenwarn">
            <div style={{fontFamily:"'Fraunces',serif",fontSize:"1rem",color:"var(--muted)"}}>Carico la mappa…</div>
          </div>
        )}
        {hasToken && loadError && (
          <div className="maptokenwarn">
            <div>
              <div style={{fontFamily:"'Fraunces',serif",fontWeight:500,fontSize:"1.2rem",marginBottom:10}}>Mappa non disponibile</div>
              <p className="desc" style={{maxWidth:"42ch",margin:"0 auto"}}>Non riesco a caricare la libreria Mapbox GL (api.mapbox.com). Controlla la connessione o eventuali blocchi di rete, poi ricarica la pagina.</p>
            </div>
          </div>
        )}
        {!hasToken && (
          <div className="maptokenwarn">
            <div>
              <div style={{fontFamily:"'Fraunces',serif",fontWeight:500,fontSize:"1.2rem",marginBottom:10}}>Manca il token Mapbox</div>
              <p className="desc" style={{maxWidth:"40ch",margin:"0 auto"}}>Incolla il tuo token pubblico Mapbox (inizia con <code>pk.</code>) nella costante <code>MAPBOX_TOKEN</code> in cima allo script. È gratuito su account.mapbox.com.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

class MapBoundary extends React.Component<any,{err:boolean}>{
  constructor(p){super(p);this.state={err:false};}
  static getDerivedStateFromError(){return {err:true};}
  componentDidCatch(e){console.error("Map error:",e);}
  render(){
    if(this.state.err) return (
      <section className="panel full">
        <h2><Icon name="map" size={22} className="h2ic"/>Dove sono andato</h2>
        <p className="desc" style={{margin:0}}>La mappa non è riuscita a caricarsi. Ricarica la pagina; il resto della dashboard funziona normalmente.</p>
      </section>
    );
    return this.props.children;
  }
}

function FilterChip({active,onClick,children}: any){
  return <button type="button" className={"fchip"+(active?" on":"")} onClick={onClick}>{children}</button>;
}

function FilterSection({label,value,children,wide}: any){
  return <div className={"fsec"+(wide?" fsec-wide":"")}><div className="fsec-h">{label}{value!=null&&<span className="fsec-v">{value}</span>}</div><div className="fsec-b">{children}</div></div>;
}

/* Dual-handle range slider built on two overlaid native range inputs. */
function RangeSlider({min,max,step,valMin,valMax,onChange,fmt}: any){
  const f=fmt||(x=>x);
  const pct=v=>max>min?((v-min)/(max-min))*100:0;
  const setLo=v=>onChange(Math.min(+v,valMax),valMax);
  const setHi=v=>onChange(valMin,Math.max(+v,valMin));
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
  const ref=useRef(null);
  React.useEffect(()=>{
    if(!open) return;
    const onDown=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",onDown);
    return ()=>document.removeEventListener("mousedown",onDown);
  },[open]);
  const norm=s=>s.toLowerCase();
  const shown=q.trim()?options.filter(o=>norm(o).includes(norm(q.trim()))):options;
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
            {shown.map(o=>{
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

function FilterButton(){
  const {filters,setFilters}=useFilters();
  const [open,setOpen]=useState(false);
  const popRef=useRef(null);
  const btnRef=useRef(null);
  const active=countActive(filters);
  const has=!isEmptyFilters(filters);

  React.useEffect(()=>{
    if(!open) return;
    const onKey=e=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("keydown",onKey);
    const prevOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{ document.removeEventListener("keydown",onKey); document.body.style.overflow=prevOverflow; };
  },[open]);

  const toggleIn=(key,val)=>setFilters(f=>{
    const arr=f[key];
    return {...f,[key]:arr.includes(val)?arr.filter(x=>x!==val):[...arr,val]};
  });
  const clearKey=key=>setFilters(f=>({...f,[key]:[]}));
  const setVal=(key,val)=>setFilters(f=>({...f,[key]:f[key]===val?"all":val}));
  const toggleBool=key=>setFilters(f=>({...f,[key]:!f[key]}));
  const setDate=(key,val)=>setFilters(f=>({...f,[key]:val}));
  const setCost=(lo,hi)=>setFilters(f=>({...f,costMin:lo,costMax:hi}));
  const setKm=(lo,hi)=>setFilters(f=>({...f,kmMin:lo,kmMax:hi}));
  const clearAll=()=>setFilters(EMPTY_FILTERS);

  const costLabel = isDefaultCost(filters)?null:(eur0(filters.costMin)+"–"+eur0(filters.costMax));
  const kmLabel = isDefaultKm(filters)?null:(filters.kmMin+"–"+filters.kmMax+" km");

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
                  <input type="date" value={filters.dateFrom} min={DATE_LO} max={filters.dateTo||DATE_HI}
                    onChange={e=>setDate("dateFrom",e.target.value)}/>
                  {filters.dateFrom&&<button type="button" className="datefield-x" onClick={()=>setDate("dateFrom","")} aria-label="Cancella data iniziale">×</button>}
                </label>
                <label className="datefield">
                  <span className="datefield-l">A</span>
                  <input type="date" value={filters.dateTo} min={filters.dateFrom||DATE_LO} max={DATE_HI}
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
              <RangeSlider min={COST_MIN} max={COST_MAX} step={5}
                valMin={filters.costMin} valMax={filters.costMax} onChange={setCost} fmt={eur0}/>
              <div className="fsec-note">Solo concerti con prezzo noto.</div>
            </FilterSection>
            <FilterSection label="Città" wide>
              <SearchSelect options={ALL_CITIES} selected={filters.cities}
                onToggle={c=>toggleIn("cities",c)} onClear={()=>clearKey("cities")} placeholder="Tutte le città"/>
            </FilterSection>
            <FilterSection label="Compagni" wide>
              <SearchSelect options={ALL_PEOPLE} selected={filters.people}
                onToggle={p=>toggleIn("people",p)} onClear={()=>clearKey("people")} placeholder="Tutti i compagni"
                leadLabel="Da solo" leadActive={filters.solo} onLeadToggle={()=>toggleBool("solo")}/>
            </FilterSection>
            <FilterSection label="Posto">
              {ALL_POSTI.map(p=>(
                <FilterChip key={p} active={filters.posti.includes(p)} onClick={()=>toggleIn("posti",p)}>{p}</FilterChip>
              ))}
            </FilterSection>
            <FilterSection label="Vicinanza">
              {ALL_VIC.map(v=>(
                <FilterChip key={v} active={filters.vicinanze.includes(v)} onClick={()=>toggleIn("vicinanze",v)}>{VIC_LABELS[v]}</FilterChip>
              ))}
            </FilterSection>
            <FilterSection label="Canzoni note">
              {ALL_CN.map(v=>(
                <FilterChip key={v} active={filters.canzoni.includes(v)} onClick={()=>toggleIn("canzoni",v)}>{CANZONI_NOTE_LABELS[v]}</FilterChip>
              ))}
            </FilterSection>
            <FilterSection label="Distanza del viaggio" value={kmLabel} wide>
              <RangeSlider min={KM_MIN} max={KM_MAX} step={10}
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

/* Ids+labels live in chat/tools.ts (shared with the AI chat); only icons are added here. */
const TOC_ICONS={"sec-kpis":"star","sec-andamento":"chart","sec-mappa":"map","sec-artisti":"mic","sec-compagni":"users","sec-venue":"repeat","sec-posto":"seat","sec-vicinanza":"target","sec-stagionalita":"calendar","sec-giorni":"calendar","sec-voti":"star","sec-voti-migliori":"trophy","sec-voti-vs":"target","sec-canzoni":"note","sec-spesa":"wallet","sec-spesa-dettaglio":"euro","sec-spesa-distribuzione":"coins","sec-archivio":"list"};
const TOC_ITEMS=SECTIONS.map(s=>({id:s.id,icon:TOC_ICONS[s.id]||"list",label:s.label}));
function TocButton(){
  const [open,setOpen]=useState(false);
  const popRef=useRef(null);
  const btnRef=useRef(null);
  React.useEffect(()=>{
    if(!open) return;
    const onDocDown=e=>{
      if(popRef.current&&!popRef.current.contains(e.target)&&btnRef.current&&!btnRef.current.contains(e.target)) setOpen(false);
    };
    const onKey=e=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("mousedown",onDocDown);
    document.addEventListener("keydown",onKey);
    return ()=>{ document.removeEventListener("mousedown",onDocDown); document.removeEventListener("keydown",onKey); };
  },[open]);
  const go=id=>{
    const el=document.getElementById(id);
    if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
    setOpen(false);
  };
  return (
    <div className="tocdock">
      {open&&(
        <div className="tocpop" ref={popRef} role="dialog" aria-label="Indice">
          <div className="toc-body">
            {TOC_ITEMS.map(it=>(
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
        onClick={()=>setOpen(o=>!o)}
        aria-label="Indice della pagina"
        aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        <span className="filterbtn-lbl">Indice</span>
      </button>
    </div>
  );
}

function VicinanzaAlert(){
  // segnala i concerti GIÀ passati a cui non ho ancora assegnato una posizione
  // (per-concerto: anche i singoli set dei festival). i futuri (planned) sono
  // esclusi: la posizione non è ancora conoscibile.
  const missing=FLAT_ALL.filter(vicMissing);
  if(missing.length===0) return null;
  return (
    <div className="vicalert">
      <Icon name="pin" size={17} className="vicalert-ic"/>
      <span><b>{missing.length}</b> {missing.length===1?"concerto passato è":"concerti passati sono"} senza posizione:
        <ul className="vicalert-list">{missing.map((d,i)=>(
          <li key={i}>{d.artist} '{String(d.y).slice(2)}</li>
        ))}</ul>
      </span>
    </div>
  );
}

function VotoAlert(){
  // segnala i concerti GIÀ passati a cui non ho ancora assegnato un voto
  // (per-concerto: anche i singoli set dei festival). i futuri (planned)
  // sono esclusi: il voto non è ancora conoscibile.
  const missing=FLAT_ALL.filter(votoMissing);
  if(missing.length===0) return null;
  return (
    <div className="vicalert">
      <Icon name="star" size={17} className="vicalert-ic"/>
      <span><b>{missing.length}</b> {missing.length===1?"concerto passato è":"concerti passati sono"} senza voto:
        <ul className="vicalert-list">{missing.map((d,i)=>(
          <li key={i}>{d.artist} '{String(d.y).slice(2)}</li>
        ))}</ul>
      </span>
    </div>
  );
}

function FromAlert(){
  // segnala i concerti GIÀ passati senza città di partenza.
  // i futuri (planned) sono esclusi: si può decidere anche all'ultimo.
  const missing=ALLDATA.filter(fromMissing);
  if(missing.length===0) return null;
  return (
    <div className="vicalert">
      <Icon name="map" size={17} className="vicalert-ic"/>
      <span><b>{missing.length}</b> {missing.length===1?"concerto passato è":"concerti passati sono"} senza città di partenza:
        <ul className="vicalert-list">{missing.map((d,i)=>(
          <li key={i}>{d.artist} '{String(d.y).slice(2)}</li>
        ))}</ul>
      </span>
    </div>
  );
}

function App(){
  const [filters,setFilters]=React.useState(EMPTY_FILTERS);
  const DATA=React.useMemo(()=>applyFilters(ALLDATA,filters),[filters]);
  const CONC=React.useMemo(()=>DATA.flatMap(concertsOf),[DATA]);
  const filterCtx=React.useMemo(()=>({data:DATA,filters,setFilters}),[DATA,filters]);
  const [mode,setMode]=React.useState(()=>{
    try{ const s=localStorage.getItem("theme"); if(s==="dark"||s==="light"||s==="system") return s; }catch(e){}
    return "dark";
  });
  // Callbacks eseguiti dai tool della chat AI. Identità stabile (la chat li tiene
  // nel suo contesto); i filtri correnti si leggono via ref, non via closure;
  // setMode è un setter di useState, quindi stabile anche lui.
  const filtersRef=React.useRef(filters);
  filtersRef.current=filters;
  const chatCtx=React.useMemo(()=>({
    applyFilters:(input)=>{
      const next=mergeToolFilters(filtersRef.current,input);
      setFilters(next);
      // matchCount counts concerts (sets), coherently with the page's stats
      return {matchCount:flatConcerts(applyFilters(ALLDATA,next)).length,summary:describeFilters(next)};
    },
    clearFilters:()=>{
      setFilters(EMPTY_FILTERS);
      return {matchCount:FLAT_ALL.length};
    },
    goToSection:(id)=>{
      const el=document.getElementById(id);
      if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
      const s=SECTIONS.find(x=>x.id===id);
      return {ok:!!el,label:s?s.label:id};
    },
    setTheme:(t)=>{
      setMode(t);
      return {ok:true,theme:t};
    },
  }),[]);
  React.useEffect(()=>{
    const mq=window.matchMedia("(prefers-color-scheme: dark)");
    const apply=()=>{
      const resolved = mode==="system" ? (mq.matches?"dark":"light") : mode;
      document.documentElement.setAttribute("data-theme",resolved);
    };
    apply();
    try{ localStorage.setItem("theme",mode); }catch(e){}
    if(mode==="system"){
      mq.addEventListener("change",apply);
      return ()=>mq.removeEventListener("change",apply);
    }
  },[mode]);
  const cycleMode=()=>setMode(m=>m==="dark"?"light":m==="light"?"system":"dark");
  const modeLabel={dark:"Scuro",light:"Chiaro",system:"Sistema"}[mode];
  React.useEffect(()=>{
    const root=document.getElementById("root");
    if(!root) return;
    const setH=()=>{
      // full scrollable page height, independent of viewport
      const h=Math.max(document.documentElement.scrollHeight, root.scrollHeight, document.body.scrollHeight);
      root.style.setProperty("--page-h", h+"px");
    };
    setH();
    const ro=new ResizeObserver(setH);
    ro.observe(document.body);
    window.addEventListener("resize",setH);
    window.addEventListener("load",setH);
    // re-measure after async content (map, fonts) settles
    const t1=setTimeout(setH,400), t2=setTimeout(setH,1500), t3=setTimeout(setH,3500);
    return ()=>{ ro.disconnect(); window.removeEventListener("resize",setH); window.removeEventListener("load",setH); clearTimeout(t1);clearTimeout(t2);clearTimeout(t3); };
  },[]);
  return (
    <FilterContext.Provider value={filterCtx}>
      <button className="theme-toggle"
        onClick={cycleMode}
        aria-label={"Tema: "+modeLabel+". Cambia tema."}
        title={"Tema: "+modeLabel}>
        {mode==="dark"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          : mode==="light"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>}
      </button>
      <div className="ambient" aria-hidden="true">
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
      </div>
      <div className="stage">
        <div className="beams">
          <span className="beam b1"></span>
          <span className="beam b2"></span>
          <span className="beam b3"></span>
          <span className="beam b4"></span>
          <span className="beam b5"></span>
          <span className="beam b6"></span>
          <span className="fixture f1"></span>
          <span className="fixture f2"></span>
          <span className="fixture f3"></span>
          <span className="fixture f4"></span>
          <span className="fixture f5"></span>
          <span className="fixture f6"></span>
        </div>
        <span className="spot"></span>
        <header>
          <h1>Gabri<br/><span className="t2">ai concerti</span></h1>
          <p className="sub">Per chiunque voglia sapere come Gabri passa il suo tempo</p>
          <VicinanzaAlert/>
          <VotoAlert/>
          <FromAlert/>
        </header>
        <div id="sec-kpis" className="tocsec"><KPIs/></div>
      </div>
      <main>
        <div id="sec-andamento" className="tocsec"><ChartCard/></div>
        <div id="sec-mappa" className="tocsec"><MapBoundary><MapCard/></MapBoundary></div>
        <div className="grid2">
          <div id="sec-artisti" className="tocsec"><RankCard title="Chi ho visto di più" desc="" obj={counter(CONC,"artist")} plObj={counter(CONC.filter(isPlanned),"artist")} color="var(--lamp)" min={2} icon="mic" field="artist" entity={ENT_ARTIST}/></div>
          <div id="sec-compagni" className="tocsec"><RankCard title="Con chi vado di più" desc="Le persone che mi accompagnano più spesso." obj={multiCounter(CONC,"with")} plObj={multiCounter(CONC.filter(isPlanned),"with")} color="var(--lamp)" min={2} unit="concert" icon="users" field="with" multi={true} entity={ENT_PEOPLE}/></div>
        </div>
        <div className="grid2">
          <div id="sec-venue" className="tocsec full"><VenueCard/></div>
        </div>
        <div className="grid2"><div id="sec-posto" className="tocsec"><PostoCard/></div><div id="sec-vicinanza" className="tocsec"><VicinanzaCard/></div></div>
        <div className="grid2"><div id="sec-stagionalita" className="tocsec"><Months/></div><div id="sec-giorni" className="tocsec"><Weekdays/></div></div>
        <div id="sec-voti" className="tocsec"><VoteDistribution/></div>
        <div id="sec-voti-migliori" className="tocsec"><TopVoted/></div>
        <div id="sec-voti-vs" className="tocsec"><VoteScatter/></div>
        <div id="sec-canzoni" className="tocsec"><CanzoniNoteCard/></div>
        <div id="sec-spesa" className="tocsec"><CostCard/></div>
        <div id="sec-spesa-dettaglio" className="tocsec"><TopSpend/></div>
        <div id="sec-spesa-distribuzione" className="tocsec"><PriceDistribution/></div>
        <div id="sec-archivio" className="tocsec"><ArchiveTable/></div>
      </main>
      <footer className="sitefooter">
        <p>Creato con il fondamentale supporto di Cami</p>
      </footer>
      <div className="bottombar">
        <TocButton/>
        <ChatWidget ctx={chatCtx}/>
        <FilterButton/>
      </div>
    </FilterContext.Provider>
  );
}

export default App;
