import { ALLDATA, WISHLIST, DESIDERIO_LABELS, flatConcerts } from "./data.ts";
import type { Wish } from "./data.ts";
import "./wishlist.css";

/* ============================================================
   LA LISTA DEI DESIDERI — variante 1: lista editoriale.
   Un atto autonomo del Ritratto: App.tsx lo monta tra "E adesso?" e
   "L'Oracolo" passandogli il componente Act e la cue "Avanti". Tutta la
   variante vive in questo file + wishlist.css, così si sostituisce in blocco.
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

// best-first, come ogni altra classifica della pagina; lo stato "esaudito" si
// deduce da ALLDATA, mai a mano
const WISHES=[...WISHLIST].sort((a,b)=>(b.desiderio||1)-(a.desiderio||1)).map(w=>({...w,granted:wishStatus(w)}));
const GRANTED=WISHES.filter(w=>w.granted).length;

export default function WishlistAct({Act,cue}:{Act:any;cue:any;openChat?:(q?:string)=>void}){
  if(!WISHES.length) return null;
  return (
    <Act className="rt-wishact" cue={cue}>
      <div className="rt-head"><h2 className="rt-h2">Prima o poi</h2></div>
      <p className="rt-lead"><b>{WISHES.length}</b> artisti sulla lista dei desideri{GRANTED>0&&<>, <b>{GRANTED}</b> già {GRANTED===1?"esaudito":"esauditi"}</>}. I cuori dicono quanto ci tengo.</p>
      <ol className="rt-wishlist">
        {WISHES.map((w,i)=>(
          <li className={"rt-wishrow"+(w.granted?" done":"")} key={i}>
            <span className="rt-wish-art">{w.artist}</span>
            <span className="rt-wish-meta">{w.granted
              ?<>esaudito · {w.granted.planned?"in programma il":"visto il"} <b>{w.granted.date}</b></>
              :(w.note||(w.since?"in lista dal "+w.since:"prima o poi"))}</span>
            <span className="rt-wish-mark" role="img"
              aria-label={w.granted?"Desiderio esaudito":"Desiderio: "+DESIDERIO_LABELS[w.desiderio||1]}
              title={w.granted?undefined:DESIDERIO_LABELS[w.desiderio||1]}>
              {w.granted?"✓":"♥".repeat(w.desiderio||1)}
            </span>
          </li>
        ))}
      </ol>
    </Act>
  );
}
