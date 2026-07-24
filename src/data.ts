/* ──────────────────────────────────────────────────────────────
   Concert data. This is the only file to touch for data entry.

   Model: one ALLDATA row = one EVENT (a ticket, a trip, an evening
   or a festival weekend). A normal row is an event with one implicit
   concert, described inline. A festival row instead lists its full
   sets in `sets`: each entry is a CONCERT with its own artist, with,
   voto, vicinanza and canzoniNote; the row-level `artist` is then
   the event name (e.g. "MI AMI 2023") and the per-concert fields
   stay at the set level (the types forbid mixing the two shapes).
   Ticket (`cost`/`gift`/`accredito`), trip (`from`/`km`), `posto`,
   `date`, `venue` and `city` always belong to the event.

   Rules enforced by the types (pnpm build fails otherwise):
   - every name in `with` must exist in PEOPLE
   - `posto`, `vicinanza`, `voto`, `canzoniNote`, `from` accept only the listed values
   - a Festival must hold at least TWO concerts (a one-concert event is
     just a Concert — the tuple type makes the single case unrepresentable)
   Rules NOT enforced by types: a new venue needs an entry in
   VENUE_COORDS and a new city in CITY_COORDS, or the map skips it;
   `km` goes with `from` (precomputed offline, recipe in CLAUDE.md).
   Keep ALLDATA sorted by date.
   ────────────────────────────────────────────────────────────── */

export const PEOPLE=["Alessia P","Amed","Anna M","Annap","Barbi","Bianca","Cami <3","Camilla C","Cate","Dani","Daniela","Davide B","Dicce","Ditta","Elena","Elena B","Enrico A","Espi","Fede","Filippo","Fra G","Fra M","Gio G","Giorgia B","Giorgia D","Giorgia G","Giulia","Isa","Isabel C","Katarina","Ludo","Mamma","Marco D","Marco S","Matilde M","Matteo A","Ornella","Oscar","Perla","Sammy","Silvia C","Silvia P","Valeria","Waitz"] as const;

export type Person = (typeof PEOPLE)[number];
export type Posto = "Gradinata" | "Pit/Gold" | "Platea" | "Prato/Parterre";

// The per-concert facts — what makes a concert a concert, independent of the
// ticket/trip/place. A standalone show carries these inline (see Concert); a
// festival carries one of these per set in its `concerts` array.
interface ConcertFacts {
  artist: string;
  with: Person[];
  voto?: 1 | 2 | 3 | 4 | 5;
  vicinanza?: 1 | 2 | 3 | 4 | 5 | 6; // Transenna .. Anello alto; absent = not yet defined (future events)
  canzoniNote?: 1 | 2 | 3 | 4 | 5 | "na"; // "Canzoni note": share of the setlist already known, see CANZONI_NOTE_LABELS; "na" = can't recall; absent = not yet defined (future events)
}

// The event facts — one ticket, one trip, one spot, one place/date.
interface EventInfo {
  y: number;
  date: string; // "dd/mm/yyyy"; multi-day: "30–31/03/2017"
  venue: string;
  city: string;
  posto: Posto;
  cost?: number; // euros — the ticket
  gift?: boolean;
  accredito?: boolean; // guest list/press pass: free entry, but not a present — excluded from money stats like gifts
  from?: "m" | "g"; // trip origin (home base): "m" = Milano, "g" = Genova; can be filled in later; absent = not yet defined
  km?: number; // one-way trip km, precomputed offline (recipe in CLAUDE.md) — set together with `from`; reuse the value of an existing (from, venue) pair. Never derive it in app code: home coordinates must not ship in the bundle.
}

// The unit. A single concert that is also its own event: it carries both the
// per-concert facts and the ticket/trip/place inline. This is the common row.
export interface Concert extends ConcertFacts, EventInfo {}

// One concert inside a festival: per-concert facts, plus its own day for a
// multi-day event (absent = the festival's date).
export interface FestivalConcert extends ConcertFacts {
  date?: string; // "dd/mm/yyyy"
}

// The only kind of event: one ticket/trip bundling SEVERAL concerts. The
// tuple ([a, b, ...rest]) forces at least two — a single-concert event is
// unrepresentable, so it can only ever be a plain Concert.
export interface Festival extends EventInfo {
  name: string; // e.g. "MI AMI 2026"
  concerts: [FestivalConcert, FestivalConcert, ...FestivalConcert[]]; // in lineup order
}

// A row of ALLDATA is either a standalone Concert or a Festival.
export type Entry = Concert | Festival;

export const isFestival = (e: Entry): e is Festival => "concerts" in e;

/* A concert flattened out of its row: per-concert facts plus the event context
   (place, date, posto). Ticket/trip fields are present only when the concert IS
   its own event — a festival concert has no price or km of its own, so
   cost-based stats skip it. `ev` points back to the owning row (a Concert is
   its own event) for anything event-scoped (dedup, money, trips). */
export interface FlatConcert extends ConcertFacts {
  y: number;
  date: string; // the concert's own day when known, else the row date
  venue: string;
  city: string;
  posto: Posto;
  cost?: number;
  gift?: boolean;
  accredito?: boolean;
  from?: "m" | "g";
  km?: number;
  ev: Entry;
}

export const concertsOf = (e: Entry): FlatConcert[] =>
  isFestival(e)
    ? e.concerts.map(c => ({ y: e.y, date: c.date || e.date, artist: c.artist, venue: e.venue, city: e.city, posto: e.posto, with: c.with, voto: c.voto, vicinanza: c.vicinanza, canzoniNote: c.canzoniNote, ev: e }))
    : [{ y: e.y, date: e.date, artist: e.artist, venue: e.venue, city: e.city, posto: e.posto, with: e.with, voto: e.voto, vicinanza: e.vicinanza, canzoniNote: e.canzoniNote, cost: e.cost, gift: e.gift, accredito: e.accredito, from: e.from, km: e.km, ev: e }];

export const flatConcerts = (data: Entry[]): FlatConcert[] => data.flatMap(concertsOf);

export const CANZONI_NOTE_LABELS = { 1: "Nessuna", 2: "Poche", 3: "Circa metà", 4: "Quasi tutte", 5: "Tutte" } as const;

export const ALLDATA: Entry[] = [
  {y:2017,date:"30/03/2017",artist:"2CELLOS",venue:"Mediolanum Forum",city:"Assago",posto:"Gradinata",with:["Alessia P","Enrico A","Davide B"],vicinanza:6,voto:3,canzoniNote:"na",from:"g",km:133},
  {y:2017,date:"25/05/2017",artist:"Marco Masini",venue:"Politeama Genovese",city:"Genova",posto:"Platea",with:["Silvia P"],vicinanza:2,voto:3,canzoniNote:"na",from:"g",km:2},
  {y:2017,date:"10/07/2017",artist:"Imagine Dragons",venue:"Arena di Verona",city:"Verona",posto:"Gradinata",with:["Marco D","Fra G","Isabel C"],cost:48,vicinanza:6,voto:4,canzoniNote:"na",from:"g",km:238},
  {y:2019,date:"19/06/2019",artist:"Ed Sheeran",venue:"Stadio San Siro",city:"Milano",posto:"Gradinata",with:["Isa"],vicinanza:6,voto:4,canzoniNote:3,from:"g",km:154},
  {y:2020,date:"15/02/2020",artist:"World of Hans Zimmer",venue:"DRFG Arena",city:"Brno",posto:"Gradinata",with:["Isa"],gift:true,vicinanza:5,voto:5,canzoniNote:5,from:"g",km:978},
  {y:2022,date:"24/05/2022",artist:"Fulminacci",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:["Fra M","Matteo A"],vicinanza:3,voto:3,canzoniNote:3,from:"g",km:140},
  {y:2022,date:"14/07/2022",artist:"Blanco",venue:"Arena del Mare",city:"Genova",posto:"Prato/Parterre",with:["Dicce"],cost:39.78,vicinanza:4,voto:3,canzoniNote:3,from:"g",km:4},
  {y:2022,date:"20/07/2022",artist:"Caparezza",venue:"Arena del Mare",city:"Genova",posto:"Prato/Parterre",with:["Mamma","Barbi","Amed"],cost:37.35,vicinanza:3,voto:4,canzoniNote:2,from:"g",km:4},
  {y:2022,date:"26/07/2022",artist:"Pinguini Tattici Nucleari",venue:"Arena del Mare",city:"Genova",posto:"Prato/Parterre",with:["Matteo A"],cost:45,vicinanza:3,voto:3,canzoniNote:3,from:"g",km:4},
  {y:2022,date:"06/09/2022",artist:"Fulminacci",venue:"Circolo Magnolia",city:"Milano",posto:"Prato/Parterre",with:["Marco S","Ornella","Daniela"],cost:22.8,vicinanza:2,voto:3,canzoniNote:3,from:"g",km:140},
  {y:2022,date:"16/09/2022",artist:"Tananai e LRDL",venue:"Arena del Mare",city:"Genova",posto:"Prato/Parterre",with:["Dani","Giorgia B"],cost:30.68,vicinanza:3,voto:3,canzoniNote:2,from:"g",km:4},
  {y:2022,date:"24/11/2022",artist:"Emma Nolde",venue:"Santeria Toscana 31",city:"Milano",posto:"Prato/Parterre",with:["Espi"],vicinanza:2,voto:4,canzoniNote:2,from:"g",km:138},
  {y:2023,date:"17/02/2023",artist:"Emma Nolde",venue:"Cinema Teatro Magda Olivero",city:"Saluzzo",posto:"Platea",with:["Espi"],vicinanza:3,voto:4,canzoniNote:4,from:"g",km:151},
  {y:2023,date:"18/03/2023",artist:"Emma Nolde",venue:"Giardini Luzzati",city:"Genova",posto:"Prato/Parterre",with:["Espi"],vicinanza:1,voto:4,canzoniNote:4,from:"g",km:2},
  {y:2023,date:"22/03/2023",artist:"Eugenio in Via di Gioia",venue:"Teatro della Concordia",city:"Venaria Reale",posto:"Prato/Parterre",with:["Anna M"],cost:36.81,vicinanza:3,voto:3,canzoniNote:2,from:"g",km:150},
  {y:2023,date:"26/03/2023",artist:"Emma Nolde",venue:"Apollo Club",city:"Milano",posto:"Prato/Parterre",with:["Katarina"],vicinanza:2,voto:2,canzoniNote:4,from:"m",km:3},
  {y:2023,date:"27/05/2023",name:"MI AMI 2023",venue:"Circolo Magnolia",city:"Milano",posto:"Prato/Parterre",cost:40,from:"m",km:13,concerts:[
    {artist:"Emma Nolde",with:["Espi"],voto:4,vicinanza:1,canzoniNote:4},
    {artist:"Fulminacci",with:[],voto:3,vicinanza:3,canzoniNote:3},
    {artist:"Coez e Frah Quintale",with:["Elena B","Matilde M"],voto:3,vicinanza:2,canzoniNote:2},
  ]},
  {y:2023,date:"25/06/2023",artist:"Coldplay",venue:"Stadio San Siro",city:"Milano",posto:"Gradinata",with:["Silvia C","Alessia P"],cost:110,vicinanza:6,voto:3,canzoniNote:3,from:"m",km:6},
  {y:2023,date:"12/07/2023",artist:"Pinguini Tattici Nucleari",venue:"Stadio San Siro",city:"Milano",posto:"Pit/Gold",with:["Giorgia D","Matteo A"],cost:73.63,vicinanza:1,voto:4,canzoniNote:4,from:"m",km:6},
  {y:2023,date:"21/07/2023",artist:"Emma Nolde",venue:"Orto di San Matteo",city:"Castelfranco di Sotto",posto:"Prato/Parterre",with:["Espi"],cost:10,vicinanza:2,voto:4,canzoniNote:4,from:"g",km:209},
  {y:2023,date:"07/11/2023",artist:"Willie Peyote",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:["Camilla C"],cost:31.38,vicinanza:3,voto:3,canzoniNote:4,from:"m",km:9},
  {y:2023,date:"26/11/2023",artist:"Colla Zio",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:["Gio G"],gift:true,vicinanza:2,voto:3,canzoniNote:4,from:"m",km:9},
  {y:2023,date:"10/12/2023",artist:"Olly",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:[],gift:true,vicinanza:2,voto:3,canzoniNote:3,from:"m",km:9},
  {y:2024,date:"04/04/2024",artist:"Fulminacci",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:["Camilla C"],cost:30.95,vicinanza:3,voto:4,canzoniNote:4,from:"m",km:9},
  {y:2024,date:"04/05/2024",artist:"Pinguini Tattici Nucleari",venue:"Nelson Mandela Forum",city:"Firenze",posto:"Prato/Parterre",with:["Camilla C","Marco D","Ludo"],cost:60,vicinanza:3,voto:3,canzoniNote:4,from:"g",km:229},
  {y:2024,date:"08/06/2024",artist:"Ed Sheeran",venue:"Lucca Summer Festival",city:"Lucca",posto:"Pit/Gold",with:["Marco D","Ludo"],cost:129.72,vicinanza:3,voto:5,canzoniNote:4,from:"g",km:163},
  {y:2024,date:"22/06/2024",artist:"Paolo Nutini",venue:"La Prima Estate",city:"Lido di Camaiore",posto:"Pit/Gold",with:["Camilla C"],cost:100,vicinanza:2,voto:2,canzoniNote:2,from:"g",km:133},
  {y:2024,date:"04/07/2024",artist:"Giovanni Ti Amo",venue:"CLER",city:"Milano",posto:"Prato/Parterre",with:["Espi","Cate"],cost:0,vicinanza:1,voto:2,canzoniNote:4,from:"m",km:8},
  {y:2024,date:"25/07/2024",artist:"Edoardo Bennato",venue:"Parchi di Nervi · Nervi Music Ballet Festival",city:"Genova",posto:"Platea",with:["Mamma"],cost:61.35,vicinanza:3,voto:4,canzoniNote:2,from:"g",km:11},
  {y:2024,date:"29/07/2024",artist:"Eugenio in Via di Gioia",venue:"Castello Sforzesco",city:"Milano",posto:"Prato/Parterre",with:["Cami <3"],cost:32.07,vicinanza:2,voto:2,canzoniNote:4,from:"m",km:2},
  {y:2024,date:"10/10/2024",artist:"Dargen D'Amico",venue:"Teatro degli Arcimboldi",city:"Milano",posto:"Platea",with:[],cost:40.44,vicinanza:3,voto:4,canzoniNote:3,from:"m",km:10},
  {y:2024,date:"29/11/2024",artist:"Emma Nolde",venue:"The Cage",city:"Livorno",posto:"Prato/Parterre",with:["Cami <3","Espi","Cate"],cost:16.09,vicinanza:2,voto:3,canzoniNote:4,from:"g",km:187},
  {y:2024,date:"04/12/2024",artist:"Fast Animals and Slow Kids",venue:"Alcatraz",city:"Milano",posto:"Prato/Parterre",with:["Anna M"],cost:37.95,vicinanza:3,voto:3,canzoniNote:2,from:"m",km:6},
  {y:2024,date:"13/12/2024",artist:"Giovanni Ti Amo",venue:"YellowSquare",city:"Milano",posto:"Prato/Parterre",with:["Valeria"],cost:7.5,vicinanza:2,voto:3,canzoniNote:4,from:"m",km:4},
  {y:2025,date:"27/01/2025",artist:"Emma Nolde",venue:"Arci Bellezza",city:"Milano",posto:"Prato/Parterre",with:["Cami <3"],cost:17.25,vicinanza:2,voto:3,canzoniNote:4,from:"m",km:3},
  {y:2025,date:"12/03/2025",artist:"Ofenbach",venue:"Arci Bellezza",city:"Milano",posto:"Prato/Parterre",with:[],cost:24.99,vicinanza:2,voto:3,canzoniNote:2,from:"m",km:3},
  {y:2025,date:"23/03/2025",artist:"Benjamin Clementine",venue:"Alcatraz",city:"Milano",posto:"Prato/Parterre",with:[],cost:41.5,vicinanza:3,voto:3,canzoniNote:3,from:"m",km:6},
  {y:2025,date:"27/05/2025",artist:"Imagine Dragons",venue:"Ippodromo Snai La Maura",city:"Milano",posto:"Pit/Gold",with:["Cami <3","Marco D","Ludo"],cost:123.05,vicinanza:2,voto:4,canzoniNote:3,from:"m",km:8},
  {y:2025,date:"11/06/2025",artist:"Pinguini Tattici Nucleari",venue:"Stadio San Siro",city:"Milano",posto:"Pit/Gold",with:["Fra M"],cost:78.97,vicinanza:3,voto:2,canzoniNote:4,from:"m",km:6},
  {y:2025,date:"22/06/2025",artist:"Gazzelle",venue:"Stadio San Siro",city:"Milano",posto:"Gradinata",with:["Cami <3"],gift:true,vicinanza:5,voto:4,canzoniNote:3,from:"m",km:6},
  {y:2025,date:"24/06/2025",artist:"Linkin Park",venue:"Ippodromo Snai La Maura",city:"Milano",posto:"Pit/Gold",with:["Marco D","Fra G","Elena"],cost:122.72,vicinanza:2,voto:4,canzoniNote:2,from:"m",km:8},
  {y:2025,date:"10/07/2025",artist:"Benjamin Clementine",venue:"Castello Sforzesco",city:"Milano",posto:"Platea",with:[],gift:true,vicinanza:3,voto:4,canzoniNote:3,from:"m",km:2},
  {y:2025,date:"04/10/2025",artist:"Olly",venue:"Palateknoship",city:"Genova",posto:"Prato/Parterre",with:["Marco D","Ludo","Sammy"],cost:52.29,vicinanza:3,voto:3,canzoniNote:4,from:"g",km:8},
  {y:2025,date:"30/10/2025",artist:"Carl Brave",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:["Ditta"],cost:36.91,vicinanza:3,voto:3,canzoniNote:3,from:"m",km:9},
  {y:2025,date:"21/11/2025",artist:"Dardust",venue:"Teatro San Babila",city:"Milano",posto:"Platea",with:[],cost:60.46,vicinanza:3,voto:2,canzoniNote:1,from:"m",km:3},
  {y:2025,date:"21/11/2025",artist:"Mumford & Sons",venue:"Unipol Forum",city:"Assago",posto:"Prato/Parterre",with:["Cami <3","Anna M"],cost:87.63,vicinanza:2,voto:5,canzoniNote:3,from:"m",km:10},
  {y:2025,date:"25/11/2025",artist:"Dutch Nazari",venue:"Santeria Toscana 31",city:"Milano",posto:"Prato/Parterre",with:["Cami <3"],cost:20.96,vicinanza:2,voto:3,canzoniNote:4,from:"m",km:3},
  {y:2025,date:"26/11/2025",artist:"Anna Carol",venue:"Arci Bellezza",city:"Milano",posto:"Prato/Parterre",with:[],cost:17.25,vicinanza:2,voto:4,canzoniNote:3,from:"m",km:3},
  {y:2025,date:"03/12/2025",artist:"Zen Circus",venue:"Alcatraz",city:"Milano",posto:"Prato/Parterre",with:["Cami <3"],cost:33.5,vicinanza:2,voto:3,canzoniNote:2,from:"m",km:6},
  {y:2026,date:"13/01/2026",artist:"Ex Otago",venue:"Crazy Bull Café",city:"Genova",posto:"Prato/Parterre",with:["Cami <3"],cost:32,vicinanza:2,voto:4,canzoniNote:3,from:"g",km:7},
  {y:2026,date:"05/02/2026",artist:"Giovanni Ti Amo",venue:"Arci Bellezza",city:"Milano",posto:"Prato/Parterre",with:["Espi","Cate"],cost:13.8,vicinanza:2,voto:3,canzoniNote:3,from:"m",km:3},
  {y:2026,date:"10/04/2026",artist:"Nitro",venue:"Crazy Bull Café",city:"Genova",posto:"Prato/Parterre",with:["Cami <3"],gift:true,vicinanza:3,voto:4,canzoniNote:2,from:"g",km:7},
  {y:2026,date:"15/04/2026",artist:"Fulminacci",venue:"Unipol Forum",city:"Assago",posto:"Prato/Parterre",with:["Perla","Waitz"],cost:41.62,vicinanza:2,voto:4,canzoniNote:4,from:"m",km:10},
  {y:2026,date:"21–24/05/2026",name:"MI AMI 2026",venue:"Idroscalo",city:"Milano",posto:"Prato/Parterre",cost:147.25,from:"m",km:13,concerts:[
    {artist:"Rares",date:"22/05/2026",with:["Perla","Waitz","Giorgia G"],voto:3,vicinanza:1,canzoniNote:1},
    {artist:"Paragarri",date:"22/05/2026",with:["Perla","Waitz","Giorgia G"],voto:3,vicinanza:2,canzoniNote:2},
    {artist:"Dutch Nazari",date:"22/05/2026",with:[],voto:3,vicinanza:3,canzoniNote:4},
    {artist:"Faccianuvola",date:"22/05/2026",with:[],voto:3,vicinanza:4,canzoniNote:2},
    {artist:"Angelica Bove",date:"23/05/2026",with:["Cami <3"],voto:3,vicinanza:2,canzoniNote:2},
    {artist:"Labadessa",date:"23/05/2026",with:["Cami <3"],voto:3,vicinanza:4,canzoniNote:2},
  ]},
  {y:2026,date:"17/06/2026",artist:"Lewis Capaldi",venue:"Fiera Milano Live",city:"Rho",posto:"Pit/Gold",with:["Cami <3","Ludo","Marco D"],cost:105.84,vicinanza:3,voto:3,canzoniNote:3,from:"m",km:13},
  {y:2026,date:"18/06/2026",artist:"Olly",venue:"Stadio Luigi Ferraris",city:"Genova",posto:"Prato/Parterre",with:["Fra M","Ludo","Marco D","Dicce","Fede"],cost:63.13,vicinanza:4,voto:4,canzoniNote:4,from:"g",km:3},
  {y:2026,date:"01/07/2026",artist:"Bresh",venue:"Arena del Mare",city:"Genova",posto:"Prato/Parterre",with:["Cami <3","Giulia","Bianca"],cost:47.99,vicinanza:4,voto:2,canzoniNote:3,from:"g",km:4},
  {y:2026,date:"03/07/2026",artist:"Florence + The Machine",venue:"Ippodromo Snai San Siro",city:"Milano",posto:"Pit/Gold",with:["Cami <3"],cost:92.29,vicinanza:3,voto:5,canzoniNote:3,from:"m",km:5},
  {y:2026,date:"05/07/2026",artist:"Foo Fighters",venue:"Ippodromo Snai La Maura",city:"Milano",posto:"Prato/Parterre",with:["Annap"],cost:92,vicinanza:4,voto:4,canzoniNote:1,from:"m",km:8},
  {y:2026,date:"15/07/2026",artist:"Frah Quintale",venue:"Arena del Mare",city:"Genova",posto:"Pit/Gold",with:["Cami <3"],accredito:true,vicinanza:2,voto:4,canzoniNote:3,from:"g",km:4},
  {y:2026,date:"17/07/2026",artist:"Mannarino",venue:"Arena del Mare",city:"Genova",posto:"Pit/Gold",with:["Cami <3"],cost:54.14,vicinanza:1,voto:3,canzoniNote:2,from:"g",km:4},
  {y:2026,date:"18/07/2026",artist:"Sayf",venue:"Arena del Mare",city:"Genova",posto:"Pit/Gold",with:["Cami <3"],cost:50.03,vicinanza:4,voto:3,canzoniNote:2,from:"g",km:4},
  {y:2026,date:"22/07/2026",artist:"Emma Nolde",venue:"Arena del Mare",city:"Genova",posto:"Prato/Parterre",with:["Espi","Cate"],accredito:true,vicinanza:1,voto:4,canzoniNote:4,from:"g",km:4},
  {y:2026,date:"24/07/2026",artist:"Caparezza",venue:"Arena del Mare",city:"Genova",posto:"Pit/Gold",with:["Cami <3"],cost:60.99},
  {y:2026,date:"25/07/2026",artist:"I Cani",venue:"Arena del Mare",city:"Genova",posto:"Prato/Parterre",with:["Cami <3"],cost:44.28},
  {y:2026,date:"05/09/2026",artist:"Dov'è Liana",venue:"Castello Sforzesco",city:"Milano",posto:"Prato/Parterre",with:["Waitz"],cost:25},
  {y:2026,date:"01/10/2026",artist:"Dargen D'Amico",venue:"Alcatraz",city:"Milano",posto:"Prato/Parterre",with:["Anna M"],cost:37.45},
  {y:2026,date:"18/11/2026",artist:"Portugal. The Man",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:["Filippo","Oscar","Waitz"],cost:36.92},
  {y:2026,date:"30/11/2026",artist:"Ditonellapiaga",venue:"Fabrique",city:"Milano",posto:"Prato/Parterre",with:["Filippo"],cost:31.03},
  {y:2026,date:"03/12/2026",artist:"Kodaline",venue:"Alcatraz",city:"Milano",posto:"Prato/Parterre",with:["Perla"],cost:50.5},
  {y:2027,date:"06/06/2027",artist:"Vasco Rossi",venue:"Stadio Olimpico",city:"Roma",posto:"Gradinata",with:[],gift:true},
  {y:2027,date:"23/06/2027",artist:"Olly",venue:"Stadio San Siro",city:"Milano",posto:"Pit/Gold",with:["Cami <3","Marco D","Ludo"],cost:96.12},
];

// [lng, lat]
export const VENUE_COORDS: Record<string, [number, number]> = {
  "Alcatraz":[9.1826,45.4945],
  "Apollo Club":[9.1789,45.4432],
  "Arci Bellezza":[9.195,45.4487],
  "Arena del Mare":[8.9188747,44.4071780],
  "Arena di Verona":[10.9943,45.4390],
  "CLER":[9.1292,45.4985],
  "Castello Sforzesco":[9.180117,45.470553],
  "Cinema Teatro Magda Olivero":[7.4888,44.6453],
  "Circolo Magnolia":[9.2861,45.4637],
  "Crazy Bull Café":[8.8856,44.4138],
  "DRFG Arena":[16.602,49.1854],
  "Fabrique":[9.2523,45.4521],
  "Fiera Milano Live":[9.0885,45.5212],
  "Giardini Luzzati":[8.9323,44.4054],
  "Idroscalo":[9.289,45.4642],
  "Ippodromo Snai La Maura":[9.111413,45.489445],
  "Ippodromo Snai San Siro":[9.138175,45.481068],
  "La Prima Estate":[10.2166,43.9087],
  "Lucca Summer Festival":[10.5125,43.8413],
  "Mediolanum Forum":[9.1422,45.4014],
  "Nelson Mandela Forum":[11.2831,43.7768],
  "Orto di San Matteo":[10.7448,43.7015],
  "Palateknoship":[8.88,44.4124],
  "Parchi di Nervi · Nervi Music Ballet Festival":[9.047061,44.380695],
  "Politeama Genovese":[8.9379,44.4111],
  "Santeria Toscana 31":[9.1884,45.4456],
  "Stadio Luigi Ferraris":[8.9525,44.4165],
  "Stadio Olimpico":[12.4547,41.9339],
  "Stadio San Siro":[9.1240,45.4781],
  "Teatro San Babila":[9.1980,45.4670],
  "Teatro della Concordia":[7.6250,45.1166],
  "Teatro degli Arcimboldi":[9.2137,45.5145],
  "The Cage":[10.349,43.5239],
  "Unipol Forum":[9.1422,45.4014],
  "YellowSquare":[9.2051,45.453],
};

// [lng, lat]
export const CITY_COORDS: Record<string, [number, number]> = {
  "Assago":[9.1313,45.4052],"Genova":[8.9339,44.4073],"Verona":[10.9930,45.4380],
  "Milano":[9.1900,45.4640],"Brno":[16.6113,49.1922],"Saluzzo":[7.4942,44.6843],
  "Firenze":[11.2560,43.7700],"Lido di Camaiore":[10.2287,43.8933],"Lucca":[10.5030,43.8430],
  "Castelfranco di Sotto":[10.7235,43.7492],"Livorno":[10.3091,43.5507],
  "Rho":[9.0463,45.531],
  "Roma":[12.4829,41.8933],
  "Venaria Reale":[7.6230,45.1280],
};
