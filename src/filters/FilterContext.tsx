import React from "react";
import type { Entry } from "../../shared/model/concert.ts";
import type { Filters } from "../../shared/lib/filters.ts";

/* Lo stato dei filtri vive nello Shell della pagina del profilo (sopravvive al
   passaggio tra "Sul palco" e "I dati", non sta nell'URL); qui c'è solo il
   contesto con cui i componenti leggono le righe filtrate. */
export interface FilterCtx { data:Entry[]; filters:Filters; setFilters:React.Dispatch<React.SetStateAction<Filters>>; }

export const FilterContext=React.createContext<FilterCtx|null>(null);

export const useFilters=():FilterCtx=>{
  const v=React.useContext(FilterContext);
  if(!v) throw new Error("useFilters fuori da FilterContext");
  return v;
};
/** Le righe che passano i filtri attivi. */
export const useData=():Entry[]=>useFilters().data;
