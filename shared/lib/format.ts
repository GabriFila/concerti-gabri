/* Formattazione dei numeri e nomi di mesi e giorni (it-IT). */

export const MESI = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
// 0 = lunedì … 6 = domenica, come weekdayOf
export const GIORNI = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

export const km0 = (n: number): string => Math.round(n).toLocaleString("it-IT") + " km";
export const voto1 = (n: number): string => n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const eur0 = (n: number): string => "€" + Math.round(n).toLocaleString("it-IT");
export const eur2 = (n: number): string => "€" + n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
