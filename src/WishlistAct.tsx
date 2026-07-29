import { ALLDATA, WISHLIST, DESIDERIO_LABELS, flatConcerts } from "./data.ts";
import type { Wish } from "./data.ts";
import "./wishlist.css";

/* ============================================================
   LA LISTA DEI DESIDERI — variante 2: poster da festival.
   La wishlist impaginata come la locandina di un festival che non esiste:
   la gerarchia è tutta tipografica (desiderio 3 = headliner, nome enorme;
   1 = ultima riga in piccolo), quindi non serve nessuna legenda.
   Un atto autonomo del Ritratto: App.tsx lo monta tra "E adesso?" e
   "L'Oracolo". Tutta la variante vive in questo file + wishlist.css.
   ============================================================ */

// Stesse regole di data di App.tsx (sortKey/isPlanned), duplicate qui per non
// esportarle dal monolite: tre righe identiche valgono l'indipendenza del file.
const sortKey=(d:{date:string})=>{const m=d.date.match(/(\d{1,2})(?:–\d{1,2})?\/(\d{2})\/(\d{4})/);return m?(+m[3])*10000+(+m[2])*100+(+m[1]):0;};
const todayKey=()=>{const t=new Date();return t.getFullYear()*10000+(t.getMonth()+1)*100+t.getDate();};
const isPlanned=(d:{date:string})=>sortKey(d)>=todayKey();

const FLAT=flatConcerts(ALLDATA);

/* Un desiderio è esaudito quando in ALLDATA compare un concerto di
   quell'artista (stesso nome, maiuscole a parte) nell'anno del desiderio o
   dopo. Ritorna il primo concerto che lo esaudisce, o null se resta un sogno. */
function wishStatus(w:Wish):{date:string;planned:boolean}|null{
  const hits=FLAT.filter(c=>c.artist.toLowerCase()===w.artist.toLowerCase()&&(!w.since||c.y>=w.since));
  if(!hits.length) return null;
  const first=hits.reduce((a,b)=>sortKey(a)<=sortKey(b)?a:b);
  return {date:first.date,planned:isPlanned(first)};
}

const WISHES=WISHLIST.map(w=>({...w,granted:wishStatus(w)}));
const GRANTED=WISHES.filter(w=>w.granted).length;
// i tre "cartelloni" del poster: headliner (3), fascia centrale (2), ultima riga (1)
const TIERS=[3,2,1].map(t=>WISHES.filter(w=>(w.desiderio||1)===t)).filter(t=>t.length>0);

export default function WishlistAct({Act,cue}:{Act:any;cue:any;openChat?:(q?:string)=>void}){
  if(!WISHES.length) return null;
  return (
    <Act className="rt-posteract" cue={cue}>
      <div className="rt-head"><h2 className="rt-h2">Il poster dei sogni</h2></div>
      <p className="rt-lead">La lineup che non esiste (ancora): <b>{WISHES.length}</b> artisti che sogno di vedere{GRANTED>0&&<>, <b>{GRANTED}</b> già {GRANTED===1?"esaudito":"esauditi"}</>}. Più il nome è grande, più ci tengo.</p>
      <div className="rt-poster">
        <div className="rt-poster-kicker">Gabri presenta</div>
        <div className="rt-poster-title">Prima o poi Fest</div>
        <div className="rt-poster-sub">data da destinarsi · da qualche parte nel mondo</div>
        {TIERS.map((acts,t)=>(
          <div className={"rt-poster-tier rt-poster-t"+(acts[0].desiderio||1)} key={t}>
            {acts.map((w,i)=>(
              <span className={"rt-poster-name"+(w.granted?" done":"")} key={i}
                title={w.granted?("esaudito · "+(w.granted.planned?"in programma il ":"visto il ")+w.granted.date):(w.note||DESIDERIO_LABELS[w.desiderio||1])}>
                <span className="rt-poster-art">{w.artist}</span>
                {w.granted&&<span className="rt-poster-stamp" role="img" aria-label={"Desiderio esaudito, "+(w.granted.planned?"in programma il ":"visto il ")+w.granted.date}>esaudito</span>}
                {i<acts.length-1&&<span className="rt-poster-dot" aria-hidden="true">•</span>}
              </span>
            ))}
          </div>
        ))}
        <div className="rt-poster-foot">biglietti mai in vendita · lineup soggetta ai sogni</div>
      </div>
    </Act>
  );
}
