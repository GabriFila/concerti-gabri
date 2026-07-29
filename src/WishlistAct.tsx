import { WISHLIST } from "./data.ts";
import "./wishlist.css";

/* ============================================================
   LA LISTA DEI DESIDERI — il muro dei biglietti.
   Ogni artista che sogno di vedere è un biglietto mai comprato, appeso un
   po' storto a una bacheca: solo il nome, niente punteggi né note. Toccalo
   e l'Oracolo cerca se è in tour (openChat apre la chat e invia la
   domanda). Quando un desiderio si avvera, la riga si toglie da WISHLIST e
   il concerto entra in ALLDATA come tutti gli altri.
   Un atto autonomo del Ritratto: App.tsx lo monta tra "E adesso?" e
   "L'Oracolo". Vive tutto in questo file + wishlist.css.
   ============================================================ */

export default function WishlistAct({Act,cue,openChat}:{Act:any;cue:any;openChat?:(q?:string)=>void}){
  if(!WISHLIST.length) return null;
  return (
    <Act className="rt-ticketact" cue={cue}>
      <div className="rt-head"><h2 className="rt-h2">La lista dei desideri</h2></div>
      <p className="rt-lead"><b>{WISHLIST.length}</b> biglietti che non esistono ancora.</p>
      <div className="rt-ticketwall">
        {WISHLIST.map((artist,i)=>(
          <button type="button" key={artist} className="rt-ticket"
            onClick={()=>openChat&&openChat(artist+" è in tour? Quando potrei vederlo dal vivo in Italia?")}
            aria-label={artist+". Chiedi all'Oracolo se è in tour."}>
            <span className="rt-ticket-stub" aria-hidden="true">{"nº "+String(i+1).padStart(2,"0")}</span>
            <span className="rt-ticket-art">{artist}</span>
            <span className="rt-ticket-barcode" aria-hidden="true"></span>
          </button>
        ))}
      </div>
      <p className="rt-tickethint">Tocca un biglietto: l'Oracolo ti dice se sono in tour.</p>
    </Act>
  );
}
