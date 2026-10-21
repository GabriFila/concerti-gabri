import { Icon } from "./Icon.tsx";

// Toggle for cards that cap their list. `count` = how many extra rows are hidden.
// `entity` carries Italian agreement for both number and gender:
//   {one:"altro",noun1:"artista", other:"altri",noun:"artisti"}
// so the label reads "Mostra altri 5 artisti" or, for a single hidden row,
// "Mostra altro 1 artista" / "Mostra un'altra città".
export function ShowAllBtn({expanded,onClick,count,entity}: any){
  const label=expanded
    ? "Mostra meno"
    : (count===1
        ? `Mostra ${entity.one} ${entity.noun1}`
        : `Mostra ${entity.other} ${count} ${entity.noun}`);
  return (
    <button className={"showall"+(expanded?" exp":"")} onClick={onClick}>
      {label}<Icon name="chevron" size={14} className="chev"/>
    </button>
  );
}
// agreement presets per entity (singular drops the redundant "1": "un altro artista")
export const ENT_ARTIST={one:"un altro",noun1:"artista",other:"altri",noun:"artisti"};
export const ENT_PEOPLE={one:"un'altra",noun1:"persona",other:"altre",noun:"persone"};
export const ENT_VENUE={one:"un'altra",noun1:"venue",other:"altre",noun:"venue"};
export const ENT_CONCERT={one:"un altro",noun1:"concerto",other:"altri",noun:"concerti"};
export const ENT_BIGLIETTO={one:"un altro",noun1:"biglietto",other:"altri",noun:"biglietti"};
export const ENT_COMMENTO={one:"un altro",noun1:"commento",other:"altri",noun:"commenti"};
