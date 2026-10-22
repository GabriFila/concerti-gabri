import React from "react";
import { concertsOf } from "../../shared/model/concert.ts";
import { counter, multiCounter } from "../../shared/lib/aggregate.ts";
import { hasComment } from "../../shared/lib/predicates.ts";
import { useData } from "../filters/FilterContext.tsx";
import { useDataset, usePlanned, useToday } from "../profile/ProfileContext.tsx";
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
import { TrendCard } from "./TrendCard.tsx";
import { TopVoted, VoteDistribution, VoteScatter } from "./VoteCards.tsx";

/* The full analytics dashboard — "I dati". Le segnalazioni di dati mancanti
   compaiono da sole quando ce ne sono, per chiunque apra la pagina: sono un
   promemoria di data-entry, non un segreto. */
export function FullDashboard(){
  const DATA=useData();
  const ds=useDataset();
  const today=useToday();
  const isPlanned=usePlanned();
  const CONC=React.useMemo(()=>DATA.flatMap(concertsOf),[DATA]);
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
      {anyMissing(ds,today)&&<header><VicinanzaAlert/><VotoAlert/><FromAlert/></header>}
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
      <div className="grid2"><div id="sec-vicinanza" className="tocsec full"><VicinanzaCard/></div></div>
      <div className="grid2"><div id="sec-stagionalita" className="tocsec"><Months/></div><div id="sec-giorni" className="tocsec"><Weekdays/></div></div>
      <div id="sec-voti" className="tocsec"><VoteDistribution/></div>
      <div id="sec-voti-migliori" className="tocsec"><TopVoted/></div>
      <div id="sec-voti-vs" className="tocsec"><VoteScatter/></div>
      <div id="sec-canzoni" className="tocsec"><CanzoniNoteCard/></div>
      <div id="sec-spesa" className="tocsec"><CostCard/></div>
      <div id="sec-spesa-dettaglio" className="tocsec"><TopSpend/></div>
      <div id="sec-spesa-distribuzione" className="tocsec"><PriceDistribution/></div>
      <div id="sec-trend" className="tocsec"><TrendCard/></div>
      {/* comments are optional: with none written (or none left by the filters)
          the whole section disappears, and the TOC drops it with it */}
      {DATA.some(hasComment)&&<div id="sec-commenti" className="tocsec"><CommentsCard/></div>}
      <div id="sec-archivio" className="tocsec"><ArchiveTable/></div>
    </main>
    <footer className="sitefooter">
      <p>Creato con il fondamentale supporto di Cami</p>
      <EsciFooter/>
    </footer>
  </>);
}
