import { computeKpis } from "../../shared/lib/kpis.ts";
import { useData } from "../filters/FilterContext.tsx";
import { useProfile } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { KpiDots } from "../ui/KpiDots.tsx";

/* Le 12 card del riepilogo: i numeri escono da computeKpis (shared/lib/kpis.ts),
   sulle righe filtrate e con l'istante della pagina. */
export function KPIs(){
  const DATA=useData();
  const {now}=useProfile();
  const items=computeKpis(DATA,now);
  return <section className="kpis">{items.map((k,i)=>(
    <div className="kpi" key={i}><KpiDots rows={k.src}/><div className={"num"+(k.accent?" acc-"+k.accent:"")}>{k.star?<>{k.value}<span className="star" style={{fontSize:"0.58em"}}>★</span></>:k.value}</div><div className="lbl"><Icon name={k.ic} size={13} className="kic"/>{k.lbl}</div>{k.hint&&<div className="hint">{k.hint}</div>}</div>
  ))}</section>;
}
