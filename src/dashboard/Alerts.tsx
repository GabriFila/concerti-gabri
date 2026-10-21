import { fromMissing, labelOf, vicMissing, votoMissing } from "../../shared/lib/predicates.ts";
import type { Dataset } from "../../shared/lib/dataset.ts";
import { useDataset, useToday } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";

/* Gli avvisi di manutenzione sono per definizione rari: quasi sempre le tre
   liste sono vuote e non si vede niente. Serve però saperlo PRIMA di aprire
   l'<header>, che ha un padding suo e lascerebbe un buco sopra le KPI anche
   con dentro tre componenti che rendono null. Guardano i dati NON filtrati. */
export const anyMissing=(ds:Dataset,today:number)=>
  ds.flat.some(c=>vicMissing(c,today))||ds.flat.some(c=>votoMissing(c,today))||ds.entries.some(d=>fromMissing(d,today));

export function VicinanzaAlert(){
  const ds=useDataset();
  const today=useToday();
  // segnala i concerti GIÀ passati a cui non ho ancora assegnato una posizione
  // (per-concerto: anche i singoli set dei festival). i futuri (planned) sono
  // esclusi: la posizione non è ancora conoscibile.
  const missing=ds.flat.filter(c=>vicMissing(c,today));
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

export function VotoAlert(){
  const ds=useDataset();
  const today=useToday();
  // segnala i concerti GIÀ passati a cui non ho ancora assegnato un voto
  // (per-concerto: anche i singoli set dei festival). i futuri (planned)
  // sono esclusi: il voto non è ancora conoscibile.
  const missing=ds.flat.filter(c=>votoMissing(c,today));
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

export function FromAlert(){
  const ds=useDataset();
  const today=useToday();
  // segnala i concerti GIÀ passati senza città di partenza.
  // i futuri (planned) sono esclusi: si può decidere anche all'ultimo.
  const missing=ds.entries.filter(d=>fromMissing(d,today));
  if(missing.length===0) return null;
  return (
    <div className="vicalert">
      <Icon name="map" size={17} className="vicalert-ic"/>
      <span><b>{missing.length}</b> {missing.length===1?"evento passato è":"eventi passati sono"} senza città di partenza:
        <ul className="vicalert-list">{missing.map((d,i)=>(
          <li key={i}>{labelOf(d)} '{String(d.y).slice(2)}</li>
        ))}</ul>
      </span>
    </div>
  );
}
