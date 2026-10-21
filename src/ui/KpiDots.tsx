import { usePlanned } from "../profile/ProfileContext.tsx";

/* I due pallini in basso a destra di una card KPI: da che tempo viene il numero.
   Ambra = ci sono dentro concerti già visti, teal = ce ne sono in programma;
   due pallini = la card mescola le due cose. Sono indicatori, non bottoni: il
   colore è già quello che tutta la pagina usa per passato e futuro (barre,
   legende, timeline), quindi si leggono senza istruzioni.
   Un pallino appare solo se quelle righe esistono davvero, quindi coi filtri
   attivi sparisce da sé (nessun concerto passato → niente pallino ambra). */
export function KpiDots({rows}:{rows?:{date:string}[]}){
  const isPlanned=usePlanned();
  const list=rows||[];
  const past=list.some(r=>!isPlanned(r)), future=list.some(isPlanned);
  if(!past&&!future) return null;
  return (
    <div className="kdots">
      {past&&<span className="kdot kd-past" role="img" aria-label="Include concerti già visti" title="Include concerti già visti"/>}
      {future&&<span className="kdot kd-future" role="img" aria-label="Include concerti in programma" title="Include concerti in programma"/>}
    </div>
  );
}
