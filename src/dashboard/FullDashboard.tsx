import React from "react";
import { concertsOf } from "../../shared/model/concert.ts";
import { counter, multiCounter } from "../../shared/lib/aggregate.ts";
import { hasComment } from "../../shared/lib/predicates.ts";
import { sezioniDelProfilo, type SectionId } from "../../shared/sections.ts";
import { useData } from "../filters/FilterContext.tsx";
import { useIsOwner } from "../lib/viewer.ts";
import { useDataset, useForma, usePlanned, useProfile, useToday } from "../profile/ProfileContext.tsx";
import { ENT_ARTIST, ENT_PEOPLE } from "../ui/ShowAllBtn.tsx";
import { EsciFooter } from "../accesso/Esci.tsx";
import { anyMissing, FromAlert, VicinanzaAlert, VotoAlert } from "./Alerts.tsx";
import { ArchiveTable } from "./ArchiveTable.tsx";
import { Months, Weekdays } from "./CalendarBars.tsx";
import { ChartCard } from "./ChartCard.tsx";
import { CommentsCard } from "./Comments.tsx";
import { CostCard, PriceDistribution, TopSpend } from "./CostCards.tsx";
import { KPIs } from "./KPIs.tsx";
import { CanzoniNoteCard, VenueCard, VicinanzaCard } from "./LevelCards.tsx";
import { MapBoundary, MapCard } from "./MapCard.tsx";
import { RankCard } from "./RankCard.tsx";
import { SezioneCorrente } from "./sezioni.tsx";
import { TrendCard } from "./TrendCard.tsx";
import { TopVoted, VoteDistribution, VoteScatter } from "./VoteCards.tsx";

/* The full analytics dashboard — "I dati".

   Le sezioni seguono il layout del profilo (PIANO §1.35): ordine, sezioni
   nascoste e titoli propri; "Riepilogo" resta nel palco in cima. Ogni
   sezione dichiara come si impagina:
   - "piena": un blocco a sé;
   - "griglia": un blocco a tutta larghezza dentro una .grid2;
   - "mezza": metà di una .grid2, accanto alla mezza che la segue; da sola
     prende tutta la riga.
   Con il layout vuoto il risultato è l'impaginazione di sempre (artisti e
   compagni affiancati, stagionalità e giorni affiancati).

   Le segnalazioni di dati mancanti (PIANO §1.36) le vede solo il
   proprietario: sono il suo promemoria di data-entry, non roba per chi
   visita la pagina. */

type Impaginazione = "piena" | "griglia" | "mezza";
type IdCorpo = Exclude<SectionId, "sec-kpis">;

function useSezioni(): Record<IdCorpo, [Impaginazione, () => React.ReactNode]> {
  const DATA = useData();
  const isPlanned = usePlanned();
  const CONC = React.useMemo(() => DATA.flatMap(concertsOf), [DATA]);
  return {
    "sec-andamento": ["piena", () => <ChartCard/>],
    "sec-mappa": ["piena", () => <MapBoundary><MapCard/></MapBoundary>],
    "sec-artisti": ["mezza", () => <RankCard title="Chi ho visto di più" desc="" obj={counter(CONC,"artist")} plObj={counter(CONC.filter(isPlanned),"artist")} color="var(--lamp)" min={2} icon="mic" field="artist" entity={ENT_ARTIST}/>],
    "sec-compagni": ["mezza", () => <RankCard title="Con chi vado di più" desc="Le persone che mi accompagnano più spesso." obj={multiCounter(CONC,"with")} plObj={multiCounter(CONC.filter(isPlanned),"with")} color="var(--lamp)" min={2} unit="concert" icon="users" field="with" multi={true} entity={ENT_PEOPLE}/>],
    "sec-venue": ["griglia", () => <VenueCard/>],
    "sec-vicinanza": ["griglia", () => <VicinanzaCard/>],
    "sec-stagionalita": ["mezza", () => <Months/>],
    "sec-giorni": ["mezza", () => <Weekdays/>],
    "sec-voti": ["piena", () => <VoteDistribution/>],
    "sec-voti-migliori": ["piena", () => <TopVoted/>],
    "sec-voti-vs": ["piena", () => <VoteScatter/>],
    "sec-canzoni": ["piena", () => <CanzoniNoteCard/>],
    "sec-spesa": ["piena", () => <CostCard/>],
    "sec-spesa-dettaglio": ["piena", () => <TopSpend/>],
    "sec-spesa-distribuzione": ["piena", () => <PriceDistribution/>],
    "sec-trend": ["piena", () => <TrendCard/>],
    "sec-commenti": ["piena", () => <CommentsCard/>],
    "sec-archivio": ["piena", () => <ArchiveTable/>],
  };
}

export function FullDashboard(){
  const DATA=useData();
  const ds=useDataset();
  const today=useToday();
  const forma=useForma();
  const {profile}=useProfile();
  const isOwner=useIsOwner(profile.handle);
  const SEZ=useSezioni();
  const visibili=sezioniDelProfilo(forma,profile.layout);
  // comments are optional: with none written (or none left by the filters)
  // the whole section disappears, and the TOC drops it with it
  const presenti=visibili.map(s=>s.id).filter((id):id is IdCorpo=>id!=="sec-kpis"&&(id!=="sec-commenti"||DATA.some(hasComment)));
  const blocco=(id:IdCorpo,full?:boolean)=>(
    <div key={id} id={id} className={"tocsec"+(full?" full":"")}><SezioneCorrente id={id}>{SEZ[id][1]()}</SezioneCorrente></div>
  );
  const corpo:React.ReactNode[]=[];
  for(let i=0;i<presenti.length;i++){
    const id=presenti[i], tipo=SEZ[id][0];
    if(tipo==="piena"){ corpo.push(blocco(id)); continue; }
    if(tipo==="griglia"){ corpo.push(<div className="grid2" key={id}>{blocco(id,true)}</div>); continue; }
    const next=presenti[i+1];
    if(next&&SEZ[next][0]==="mezza"){ corpo.push(<div className="grid2" key={id}>{blocco(id)}{blocco(next)}</div>); i++; }
    else corpo.push(<div className="grid2" key={id}>{blocco(id,true)}</div>);
  }
  const credito=profile.extra?.creditoFooter;
  return (<>
    <div className="stage stage--data">
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
      {isOwner&&anyMissing(ds,today)&&<header><VicinanzaAlert/><VotoAlert/><FromAlert/></header>}
      {visibili[0]?.id==="sec-kpis"&&<div id="sec-kpis" className="tocsec"><SezioneCorrente id="sec-kpis"><KPIs/></SezioneCorrente></div>}
    </div>
    <main>{corpo}</main>
    {/* il footer resta anche senza credito: il suo padding tiene l'ultima
        sezione sopra la barra fissa in basso */}
    <footer className="sitefooter">
      {credito&&<p>{credito}</p>}
      <EsciFooter/>
    </footer>
  </>);
}
