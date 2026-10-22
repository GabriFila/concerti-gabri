import { monthOf, weekdayOf } from "../../shared/lib/dates.ts";
import { GIORNI, MESI } from "../../shared/lib/format.ts";
import { useData } from "../filters/FilterContext.tsx";
import { usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useTitoloSezione } from "./sezioni.tsx";

// Quando vado: per EVENTO (un festival è una serata/un weekend)
export function Months(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const titolo=useTitoloSezione("Quando vado");
  const mc:Record<number,number>={},mp:Record<number,number>={};for(let i=0;i<12;i++){mc[i]=0;mp[i]=0;}
  DATA.forEach(d=>{mc[monthOf(d)]++;if(isPlanned(d))mp[monthOf(d)]++;});
  const max=Math.max(...Object.values(mc),1);
  return (
    <section className="panel">
      <h2><Icon name="calendar" size={22} className="h2ic"/>{titolo}</h2>
      <div className="months">{Object.keys(mc).map(Number).map(i=>{
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

// Che giorno esco: per EVENTO
export function Weekdays(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const titolo=useTitoloSezione("Che giorno esco");
  const wc:Record<number,number>={},wp:Record<number,number>={};for(let i=0;i<7;i++){wc[i]=0;wp[i]=0;}
  DATA.forEach(d=>{wc[weekdayOf(d)]++;if(isPlanned(d))wp[weekdayOf(d)]++;});
  const max=Math.max(...Object.values(wc),1);
  return (
    <section className="panel">
      <h2><Icon name="calendar" size={22} className="h2ic"/>{titolo}</h2>
      <div className="days">{Object.keys(wc).map(Number).map(i=>{
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
