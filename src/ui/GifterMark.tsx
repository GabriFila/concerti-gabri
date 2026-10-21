import { useEffect, useRef, useState } from "react";
import { soloHttps } from "../../shared/lib/url.ts";
import { useDataset } from "../profile/ProfileContext.tsx";

/* Il logo di chi ha regalato il biglietto — la favicon del suo sito — sta
   accanto all'icona del pacchetto: in hover dice "Con il contributo di X", in
   click porta al sito. Se la favicon non carica (o l'entry non ne ha una)
   sparisce da sola: resta il solo pacchetto, col nome comunque nel tooltip
   della cella. */
export function GifterMark({id,size=15}:{id?:string;size?:number}){
  const gifters=useDataset().gifters;
  const [broken,setBroken]=useState(false);
  const imgRef=useRef<HTMLImageElement|null>(null);
  // con l'SSR l'errore può arrivare prima dell'idratazione, quando onError non
  // è ancora collegato: dopo il mount si guarda com'è finita davvero
  useEffect(()=>{
    const img=imgRef.current;
    if(img&&img.complete&&img.naturalWidth===0) setBroken(true);
  },[]);
  if(!id) return null;
  const g=gifters[id];
  // sito e logo solo https (dati degli utenti: mai javascript:, data: o http:)
  const logo=soloHttps(g?.logo), url=soloHttps(g?.url);
  if(!g||!logo||broken) return null;
  const img=<img ref={imgRef} className="gifterlogo" src={logo} alt={g.label} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>;
  const credit="Con il contributo di "+g.label;
  // il tooltip è CSS (data-tip), non il `title` nativo: compare subito invece che
  // dopo un secondo. Il title="" serve a zittire quello della cella, che altrimenti
  // spunterebbe sopra anche qui dentro.
  const tip={"data-tip":credit,title:"","aria-label":credit} as const;
  return url
    ? <a className="gifterlink" href={url} target="_blank" rel="noreferrer" {...tip}>{img}</a>
    : <span className="gifterlink" {...tip}>{img}</span>;
}
