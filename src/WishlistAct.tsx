import { ALLDATA, WISHLIST, DESIDERIO_LABELS, flatConcerts } from "./data.ts";
import type { Wish } from "./data.ts";
import "./wishlist.css";

/* ============================================================
   LA LISTA DEI DESIDERI — variante 3: il muro dei biglietti.
   Ogni desiderio è un biglietto mai comprato, appeso un po' storto a una
   bacheca; le stelle dicono quanto ci tengo, gli esauditi arrivano già
   timbrati in teal con la data. Ogni biglietto è un bottone: toccalo e
   l'Oracolo cerca se l'artista è in tour (openChat apre la chat e invia
   la domanda). Un atto autonomo del Ritratto: App.tsx lo monta tra
   "E adesso?" e "L'Oracolo". Tutta la variante vive qui + wishlist.css.
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

// best-first, come ogni altra classifica della pagina
const WISHES=[...WISHLIST].sort((a,b)=>(b.desiderio||1)-(a.desiderio||1)).map(w=>({...w,granted:wishStatus(w)}));
const GRANTED=WISHES.filter(w=>w.granted).length;

export default function WishlistAct({Act,cue,openChat}:{Act:any;cue:any;openChat?:(q?:string)=>void}){
  if(!WISHES.length) return null;
  return (
    <Act className="rt-ticketact" cue={cue}>
      <div className="rt-head"><h2 className="rt-h2">La lista dei desideri</h2></div>
      <p className="rt-lead"><b>{WISHES.length}</b> biglietti che non esistono ancora{GRANTED>0&&<>, <b>{GRANTED}</b> già {GRANTED===1?"timbrato":"timbrati"}</>}. Le stelle dicono quanto ci tengo.</p>
      <div className="rt-ticketwall">
        {WISHES.map((w,i)=>{
          const want=w.desiderio||1;
          return (
          <button type="button" key={i} className={"rt-ticket"+(w.granted?" done":"")}
            onClick={()=>openChat&&openChat(w.artist+" è in tour? Quando potrei vederlo dal vivo in Italia?")}
            aria-label={w.artist+(w.granted?", desiderio esaudito":", desiderio: "+DESIDERIO_LABELS[want])+". Chiedi all'Oracolo dei prossimi tour."}>
            <span className="rt-ticket-stub" aria-hidden="true">admit one</span>
            <span className="rt-ticket-body">
              <span className="rt-ticket-kicker">sogno n. {String(i+1).padStart(2,"0")}{w.since?" · dal "+w.since:""}</span>
              <span className="rt-ticket-art">{w.artist}</span>
              <span className="rt-ticket-note">{w.note||"prima o poi succede"}</span>
              <span className="rt-ticket-want" aria-hidden="true">{"★".repeat(want)}<span className="off">{"★".repeat(3-want)}</span></span>
            </span>
            <span className="rt-ticket-barcode" aria-hidden="true"></span>
            {w.granted&&<span className="rt-ticket-stamp">esaudito<b>{w.granted.date}</b></span>}
          </button>);
        })}
      </div>
      <p className="rt-tickethint">Tocca un biglietto: l'Oracolo ti dice se sono in tour.</p>
    </Act>
  );
}
