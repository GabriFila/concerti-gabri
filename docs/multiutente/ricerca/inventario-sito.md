# Ricognizione: inventario del sito attuale

> Appunti della ricognizione del 2026-10-21 per PIANO.md (non vincolanti: vince PIANO/DECISIONI).

## Parity inventory for porting concerti-gabri to TanStack Start (SSR) on branch `multiutente`

The `multiutente` branch has the same `src/`, `netlify/` and `index.html` as `main` (only `package.json` differs), so a `main` build is a valid parity baseline. Today there are 2 routes, `/` (Sul palco) and `/dati` (I dati), both client-only with `createRouter` in `src/App.tsx:2612-2618`.

### 1. Page structure

**Chrome, in `Shell` (App.tsx:2455-2601):**
- `button.theme-toggle` (2547): cycles dark, light, system.
- `.modeswitch` (2559): links "Sul palco" and "I dati". The CSS slide (styles.css:1322-1328) is hard-wired to 2 segments (`right:50%`). The owner's 3-state switch needs new CSS.
- `.ambient`: 22 beams.
- `<Outlet/>`.
- `ChatWidget corner` (2591).
- `.bottombar` with `FilterButton` and `TocButton`, only when the path starts with `/dati` (2592).

**/dati, `FullDashboard` (2394-2446):**
- `.stage--data` with beams.
- Optional `<header>` with alerts (`VicinanzaAlert`, `VotoAlert`, `FromAlert`). It shows only if `anyMissing()` (2005), computed over the unfiltered data; currently all three are 0.
- Then the sections below, then `footer.sitefooter` ("Creato con il fondamentale supporto di Cami").

| id (`SECTIONS`, tools.ts:16-36) | TOC label | Card h2 (App line) | Component | Unit |
|---|---|---|---|---|
| sec-kpis | Riepilogo | none (12 KPI cards) | `KPIs` 320 | mixed |
| sec-andamento | Andamento | "Concerti per anno" 473 | `ChartCard` (`YearChart` 410 / `Timeline` 436, toggle + swipe) | concert |
| sec-mappa | Dove sono andato | same, 1671 (+ `MapBoundary` 1727) | `MapCard` 1366 | marker = event, popup = concerts |
| sec-artisti | Chi ho visto di più | 2421 | `RankCard` (min 2) | concert |
| sec-compagni | Con chi vado di più | 2422 | `RankCard multi` | concert |
| sec-venue | Dove torno più spesso | 751 | `VenueCard` (≥3 visits) | event |
| sec-vicinanza | Quanto sono vicino | 790 | `VicinanzaCard` (`VIC_ORDER`) | concert |
| sec-stagionalita | Quando vado | 700 | `Months` | **event** |
| sec-giorni | Che giorno esco | 724 | `Weekdays` | **event** |
| sec-voti | Come li giudico | 931 | `VoteDistribution` + star legend | concert |
| sec-voti-migliori | I migliori | 976 | `TopVoted` (≥4★, `rankCutoff`) | concert |
| sec-voti-vs | Voto a confronto | "Il voto a confronto" 1046 | `VoteScatter` (Prezzo / Vicinanza / Canzoni note) | concert |
| sec-canzoni | Quante canzoni conosco | 1110 | `CanzoniNoteCard` | concert |
| sec-spesa | Quanto spendo | 854 | `CostCard` → `SpendYearChart` (from 2022) | ticket |
| sec-spesa-dettaglio | Quando ho speso di più | 871 | `TopSpend` (top 7) | ticket |
| sec-spesa-distribuzione | Quanto pago di solito | 897 | `PriceDistribution` (€15 bins) | ticket |
| sec-trend | Come cambia nel tempo | 579 | `TrendCard` + lazy `TrendPlot` (ECharts) | voto/vic/cn per concert; cost/km per ticket |
| sec-commenti | I miei commenti | 1144 | `CommentsCard` (5 per page); **only if `DATA.some(hasComment)`** (2439) | event |
| sec-archivio | Archivio | 1292 | `ArchiveTable`: Fuse search, 11 sortable columns, Eventi sub-table, `CommentModal` | concert / festival |

**/ (Sul palco), `Ritratto` (2191-2387):** there are no `sec-*` ids on this page, so `go_to_section` returns `ok:false` here.
- Hero `h1` "Gabri / ai concerti" (2274).
- "I numeri": `CountStat` ×4.
- "Dove": `MapCard`. It reads the **filtered** `useData()`, while the other acts use unfiltered `ALLDATA`/`FLAT_ALL`.
- "I migliori": shown only if `topBest` is non-empty.
- "Con chi": shown only if `mates` is non-empty.
- "E adesso?": shown only if there are upcoming events; includes the Loop earplug CTA `LOOP_LINK` (2189).
- `WishlistAct`: hidden when `WISHLIST` is empty.
- "L'Oracolo": final act, with "Chiedi all'Oracolo" and "Vuoi i dati da nerd?" (navigates to `/dati`).
- `TOC_ICONS`: App.tsx:1944.

### 2. Global state
- **Filters:** `useState(EMPTY_FILTERS)` in `Shell` (2456), exposed through `FilterContext {data, filters, setFilters}` (315-318). Its default value references `ALLDATA` (316).
  - The state survives route switches. It is not in the URL.
  - `applyFilters` is event-level, but per-concert criteria narrow festivals to the matching sets.
- **Theme:** `mode` in `useState`, initialised from `localStorage.theme` (2459-2462).
  - An effect writes `html[data-theme]` and saves the mode to `localStorage` (2495-2507).
  - `isPhone` comes from `matchMedia` (2511).
  - The pre-paint inline script is in `index.html:12-21`.
- **Scroll class:** `html.scrolling`, set by a passive scroll listener (2532).
- **Chat:**
  - `chatApi` ref and `ShellContext.openChat` (2450, 2543).
  - `chatCtx` callbacks: `applyFilters` (via `mergeToolFilters` + `describeFilters`), `clearFilters`, `goToSection` (`document.getElementById`), `setTheme`.
- **localStorage keys:** `theme`, `concerti-chat-threads` (owned `{id,key,title,updatedAt}`, max 50), `concerti-chat-name` (max 40).
- **Module-level mutable:** `stopGlide` (2140).
- **Local card state:** ChartCard view, TrendCard k, `expanded` in Rank/Venue/TopSpend/TopVoted, scatter dim/active, CommentsCard limit, Archive q/sort/commentEv, Map ready/error, Filter/TOC/SearchSelect open.

### 3. Browser-only APIs: what breaks SSR and the guard for each

| Where | Problem | Guard |
|---|---|---|
| `index.html:12-21`, `Shell` 2459-2462 / 2495-2507 | `localStorage` + `matchMedia` for the theme. On the server the try/catch returns "dark", so icon/aria-label **hydration mismatch** | Cookie `theme=dark\|light\|system`, read in root `beforeLoad` (server fn); SSR `data-theme`. For `system`, keep a tiny inline head script (matchMedia only). One-time client migration from `localStorage.theme` to the cookie |
| `Shell` 2511 `isPhone` | initialiser differs between server and client | init `false`, set in an effect |
| `main.tsx` | `createRoot(document…)`, `console.log("KAWABANGA!")` | Start client entry / `hydrateRoot` |
| `TrendPlot.tsx:64-71` | `useState(readTheme)` calls `getComputedStyle(document)` **during render**. React 19 SSR resolves `React.lazy` (App 492), so this **crashes on the server**. Also ResizeObserver/MutationObserver/echarts init | Wrap in `ClientOnly` with the same `.trendbox.trendload` fallback (SPEC: "TrendPlot lazy") |
| `MapCard` 1437-1665 | CDN loader injects `<link>`/`<script>` for mapbox-gl **v3.9.3** into `document.head`; `window.mapboxgl`, `getComputedStyle`, `new mapboxgl.Map` | Already effect-only; SSR shows "Carico la mappa…" in a fixed-height `.mapwrap` (SPEC: equal-size placeholder). The map is tinted only at init, not on theme change |
| `useReveal` 2071, `useCountUp` 2094, `goToAct` 2141, `Ritratto.goNext` | IntersectionObserver / rAF / scroll | Already in effects or handlers. CSS `.rt-act{opacity:0}` (styles 1371) means SSR HTML is invisible until JS adds `.in`, and `CountStat` renders "0" on the server |
| `ChatWidget` | `useState(loadName)` / `useState(loadOwned)` read localStorage in initialisers; effect reads `location.search` and calls `history.replaceState` for `?chat=` (354-363); `navigator.share` / clipboard / `execCommand` in handlers | The modal is closed on SSR so there is no visible mismatch, but move LS reads to an effect. Read `?chat` through router search + `navigate({replace:true})`. `@tanstack/ai-react`/`ai-client` dist contain no window/document references, so `useChat` is SSR-safe |
| `CommentModal` / `FilterButton` / `TocButton` / `SearchSelect` | document listeners, `body.style.overflow` | effects only, OK |
| `GifterMark` `<img onError>` | the error may fire before hydration | minor |
| `isPlanned` / `todayKey` (App 79-80, tools.ts 118) and `Date.now()` (KPIs 339, Ritratto 2208) | Vercel SSR runs in **UTC** while the client is Europe/Rome; mismatch between 00:00 and 02:00 Rome, and `avgSince.toFixed(1)` can flip | Compute `now` once on the server (TZ Europe/Rome), pass it in loader data, and make `isPlanned(d, todayKey)` take it as a parameter. Allow a dev/test-only override for parity tests |
| CSS | `styles.css` imported in `main.tsx`; `wishlist.css` imported inside `WishlistAct` | Link both in root `head()` via `?url` to avoid FOUC. @fontsource `url()`s stay as they are |
| `vite.config.ts` `prTitle` | uses Netlify env and `transformIndexHtml`, which is gone in Start | `head()` title prefix from `VERCEL_ENV` / `VERCEL_GIT_PULL_REQUEST_ID` |

### 4. Static-data readers that must become per-profile Convex data
- **`src/data.ts` exports:**
  - `ALLDATA`.
  - `PEOPLE`: imported in App:4 but unused there; `ALL_PEOPLE` is derived from usage, 49 names = all of PEOPLE.
  - `GIFTERS`: App 128, 137; tools 258.
  - `WISHLIST`: WishlistAct.
  - `VENUE_COORDS` / `CITY_COORDS`: App 1376, 1412. Ship only the subset used by the profile.
  - `VICINANZA_LABELS` / `CANZONI_NOTE_LABELS`: global scales, stay in code.
- **Module-scope derived constants in App.tsx:**
  - `CHRON` (82): dead, shadowed at 439.
  - `FLAT_ALL` (88).
  - `ALL_YEARS`, `YEAR_MIN`, `YEAR_MAX` (175-176): unused.
  - `DATE_LO`, `DATE_HI` (179-180).
  - `ALL_CITIES`, `ALL_PEOPLE` (181-182), `ALL_VIC`, `ALL_CN` (201, 203).
  - `COST_MAX` = 150, `KM_MAX` = 980 (205, 207), and therefore `EMPTY_FILTERS` (211).
  - `FilterContext` default (316), `anyMissing` and the alerts (2005-2058).
  - `Ritratto` `P` (2194), Shell `applyFilters(ALLDATA, …)` (2457, 2478), `clearFilters` `FLAT_ALL.length` (2482).
  - `FROM_LABELS {m:"Milano", g:"Genova"}` (156, used 1316/1347): becomes the departure's public name.
- **tools.ts module scope:** `ALL_CONCERTS`, `CITIES`, `COMPANIONS` feed `z.enum` in `setFiltersDef` and `queryInputSchema`.
  - The ai-client **validates client-tool input with the client's own schema** (`tool-calls.js` `parseWithStandardSchema`) and sends client-tool JSON schemas in the run.
  - So build `chatToolDefs(vocab)` from the same per-profile vocabulary on both sides.
- **chat.mts `systemPrompt`:** artists, festivals and years from `ALLDATA`, `COMPANIONS`, and the example "Camilla" / "Cami <3".
- **Gabri-specific constants to derive per profile:**
  - Year span `2017..max(2026, …)` (416); generalise to `minY..max(currentYear, maxY)`.
  - `since = 2022` in KPIs 335 / hint 375 "dal 2022 a oggi", `TREND_FROM` 505, `SpendYearChart` 815-817, Ritratto 2206. The rule "start of the latest unbroken run of years with attended concerts" reproduces 2022 for gabrifila.
  - KPI "% a Milano" hardcodes `d.city==="Milano"` (334); "top city" gives the same 53%.
  - Map fallback centre `[9.6,45.0]` (1474).
- **Seed note:** to keep "~N km da Milano" identical, seed the departures named exactly "Milano" and "Genova".

### 5. Hardcoded owner / first-person labels

**(A) Gendered — need f / m / neutral variants:**
- tools.ts:19 and App 1671/1727 "Dove sono andato".
- tools.ts:23 and App 790 "Quanto sono vicino".
- App 382 "Concerti da solo".
- App 1907 filter lead "Da solo".
- App 227 `describeFilters` "da solo" (returned to the model).
- App 2327 "concerti vissuti da solo".
- App 945 "se non ci fossi stato mi sarei buttato".
- App 1145 "Quello che mi sono segnato dopo la serata."
- tools.ts:256 output lines "da solo" (and the description at 166).
- chat.mts:294 '"da solo" = alone'; 272 "he has attended"; 295 "Gabri wrote himself"; 313 "è andato".
- tools.ts:124 "'è andato'".

**(B) First person, not gendered:** keep these as they are for all three forms.
- tools/App: 20/2421 "Chi ho visto di più", 21/2422 "Con chi vado di più", 22/751, 24/700, 25/724, 26/931, 29/1110, 30/854, 31/871, 32/897, 34/1144 "I miei commenti".
- App 948 "non vorrei rivivere…", 949 "…rimborsarmi…", 2356 "io porto sempre i tappi con me".
- App 2422 `desc` "Le persone che mi accompagnano più spesso." is passed to RankCard but never rendered.

**(C) Owner name and owner-specific content:**
- App 2274 hero "Gabri"; 2375 "ogni concerto di Gabri".
- App 2383 / 2443 credit "…supporto di Cami".
- App 2189 / 2358 Loop referral link.
- ChatWidget:53 suggestion "Quanto ha speso Gabri…", 344 share title, 521 empty-state text.
- tools.ts:60, 63, 132, 154, 166, 178.
- chat.mts:67, 272, 276, 282, 283, 291, 294, 295, 312, 313.
- `index.html:6` `<title>Gabri ai concerti</title>`.
- `public/manifest.webmanifest` name.
- `vite.config.ts:6`.

**Neutral, no change needed:** "Compagni" (refers to the companions, not the owner), alert texts, chat UI chrome, `WishlistAct` (its "vederlo" refers to the artist).

**Pre-existing label inconsistency:** `CANZONI_NOTE_LABELS[4]` is "Molte" (UI), but tools.ts:63, 132 and chat.mts:294 say "Quasi tutte". The single Zod schema must pick one.

### 6. Chat widget contract
- **Client** (`useChat` + `createChatClientOptions`, ChatWidget 251-260):
  - `fetchServerSentEvents("/api/chat")`, `id = threadId = thread.id` (UUID).
  - `forwardedProps: {writeKey, author?}`; `initialMessages` when resuming.
  - Client tools `set_filters`, `clear_filters`, `go_to_section`, `set_theme`, run through `ChatSiteContext` (applyFilters → `{matchCount, summary}`; clearFilters; goToSection → `{ok, label}`; setTheme).
  - `ChatApi.open(question?)` is used by Ritratto and WishlistAct.
  - Share link is `${origin}${pathname}?chat=<id>`. On load, the `?chat` param is stripped; if the thread is owned it resumes, otherwise it opens the read-only viewer.
  - `friendlyError` matches server strings (/403|appartiene/, /429|Troppi|[Ll]imite/, /troppo lung/), so those messages are part of the contract.
- **`POST /api/chat`** (netlify/functions/chat.mts):
  - Validation: Origin allowlist (`ALLOWED_ORIGINS` in chatlog.ts:80 has localhost, concerti.gabrifila.me and `*.netlify.app` only, so **Vercel, tailnet and portless `*.localhost:1355` would get 403**).
  - Limits: body ≤80k chars, ≤40 messages, user text ≤1500; `threadId` and `writeKey` must match `/^[A-Za-z0-9_-]{6,64}$/` (reserved: titles, authors, preview).
  - Rate limits: 8/min and 40/day per IP, 200/day global (Upstash; in-memory fallback).
  - Write-key gate: 403 when the stored key differs.
  - Model: Gemini `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), maxOutputTokens 1500, temperature 0.4, `untilAnswered` loop (≤5).
  - Server tools: `query_concerts`, `report_unsupported_query`, `web_search` (a nested Gemini call with googleSearch only, never mixed with function tools).
  - Logging middleware `onFinish` stores record `{threadId, ip, updatedAt, messages, author?, deployContext?}` with a 90-day TTL, plus zset `index`, hashes `titles` / `keys` / `authors`, and pruning. Keys are `concerti:chat:log[:preview]:*`.
  - Namespace comes from Netlify `context.deploy.context`; maps to `VERCEL_ENV` on Vercel. IP from `context.ip` / `x-nf-client-connection-ip`; becomes `x-forwarded-for` / `x-real-ip`.
- **`GET /api/chat/history`:**
  - Without parameters: `{chats:[{threadId,title,updatedAt,author?}]}`, limit 50.
  - `?threadId=` returns `{threadId, updatedAt, author?, messages: UIMessage[]}` through `logMessagesToUIMessages`; 404 if expired; 503 without Redis; 30/min per IP.
  - Never returns keys or IP.
- **Multi-user deltas:**
  - Page/handle in the request (or path) and history per page.
  - The localStorage owned-thread list has no handle: tag entries with a handle and map legacy entries to gabrifila.
  - Per-profile prompt in the third person with the chosen form; per-profile tool vocabularies.
  - Redirect `/?chat=x` → `/gabrifila?chat=x`. A server redirect keeps `#sec-…` because browsers carry the fragment over 3xx.

### 7. KPI and card baseline for parity tests
Computed with the exact formulas from the static data on **2026-10-21, TZ Europe/Rome**. The values are date-sensitive, so freeze `now`. Scripts: `/tmp/kpi-inv/kpi.mjs` and `/tmp/kpi-inv/cards.mjs`, outside the repo.

**12 KPI cards, in order (label | number | hint | dots):**

| # | Label | Number | Hint | Dots |
|---|---|---|---|---|
| 1 | Concerti | 80 | sino ad oggi | amber |
| 2 | In programma | 11 | prossimo 18/11/2026 | teal |
| 3 | media per anno | **15.6** | dal 2022 a oggi | amber |
| 4 | Voto medio | 3,4★ | 80 concerti votati | amber |
| 5 | Speso in totale | €3375 | 68 biglietti | amber + teal |
| 6 | Spesa media | €50 | 68 biglietti | amber + teal |
| 7 | Città | 13 | 53% a Milano | amber |
| 8 | Artisti diversi | 50 | Emma Nolde 10x | amber |
| 9 | Compagni | 44 | #1 Cami <3 | amber |
| 10 | Concerti da solo | 11 | 14% del totale | amber |
| 11 | Alla cieca | 25 | 32% dei concerti | amber |
| 12 | Km di viaggi | 7278 | andata e ritorno | amber |

Formatting notes: "15.6" uses a dot (`toFixed`), while the it-IT formatter gives "3,4". In it-IT, 4-digit numbers have no thousands separator (minimumGroupingDigits = 2).

**Ritratto:**
- Numbers: 80 / 50 / 7278 / 15.6; companions 44, solo 11, average 3,4★.
- 11 concerts planned; next three: Portugal. The Man 18/11/2026, Ditonellapiaga 30/11/2026, Mobrici 02/12/2026.
- "I migliori": Caparezza, Florence + The Machine, Mumford & Sons, Ed Sheeran (Lucca), World of Hans Zimmer.
- "Con chi" (attended only): Cami <3 24, Espi 9, Marco D 8, Ludo 6, Camilla C 5.

**Data counts and filter bounds:** 84 rows, 91 concerts, 2 festivals, 1 commented event; alerts 0/0/0; `COST_MAX` 150, `KM_MAX` 980; 38 venues, all with coordinates.

**Cards, including planned concerts:**
- Artisti (collapsed): Emma Nolde 10, Fulminacci 5, PTN 4, Olly 4, Giovanni Ti Amo 3.
- Compagni: Cami <3 29, Marco D 9, Espi 9, Ludo 7, Camilla C 5.
- Venue (≥3): Fabrique 12, Arena del Mare 11, San Siro 6, Alcatraz 5, Arci Bellezza 4, Santeria 3, La Maura 3, Fiera Milano Live 3.
- Vicinanza: Transenna 7 / Sottopalco 34 / Centro 26 / Fondo 7 / Tribuna 2 / Anello alto 4.
- Canzoni note: Tutte 2 / Molte 25 / Metà 25 / Poche 21 / Nessuna 4.
- Months (events, GEN..DIC): 3,4,7,4,6,15,19,0,4,5,10,7.
- Weekdays (LUN..DOM): 4,10,21,16,11,14,8.
- Votes 1..5: 1,7,38,29,5.
- Spend per year: 2022 €176, 2023 €302, 2024 €516, 2025 €717, 2026 €1153, 2027 €279.
- Top spend: MI AMI 2026 147.25 first.
- Price bins: 8,7,22,11,7,2,5,2,3,1.
- Archive footer: "91 concerti" and "2 eventi"; year chart spans 2017–2027.

**Screenshot parity settings:** `reducedMotion:'reduce'` on both builds (reveals all acts, count-ups jump to final value, beams stop), a frozen clock (client-side `page.clock` plus the server `now` override), and masks on `.mapwrap` and `.trendcanvas`.

### 8. Proposed split of App.tsx with minimal behaviour change (one commit per step, `pnpm build` + screenshot diff each time)

**Step 0 — mechanical moves only.**
- `src/lib/` (pure, SSR-safe, shared with Convex/MCP):
  - `dates.ts`: sortKey, weekdayOf, monthOf, keyToISO, isoKey, dateTs, `isPlanned(d, today)`. Also deduplicates tools.ts:114-119.
  - `predicates.ts`: hasCost, isCostNa, isGift, isAccredito, hasVoto, hasVic, hasCN, hasFrom, distKm, commentOf, eventTitle/labelOf, festName, *Missing.
  - `aggregate.ts`: counter, multiCounter, ranked, rankCutoff, sum.
  - `format.ts`: km0, voto1, eur0, eur2, MESI, GIORNI.
  - `filters.ts`: Filters type, applyFilters, concertMatches, describeFilters, mergeToolFilters, isEmpty, countActive.
  - `trend.ts`: TREND_SPECS, concertPoints, eventPoints, movingAverage.
  - `kpis.ts`: `computeKpis(entries, now)`; `portrait.ts`: `computePortrait(entries, now)`. These are reused by the KPIs component, Vitest parity (static vs Convex seed), MCP `get_stats` and the Oracolo.
- `src/model/concert.ts`: types, concertsOf, flatConcerts, isFestival, scale labels. `data.ts` becomes the seed/fixture.
- `src/components/`: Icon (PATHS), ShowAllBtn + ENT_*, KpiDots, GifterMark.
- `src/dashboard/`: KPIs, ChartCard (YearChart, Timeline), TrendCard (+ ClientOnly TrendPlot), RankCard, CalendarBars (Months/Weekdays), VenueCard, VicinanzaCard, CanzoniNoteCard, cost/*, vote/*, comments/* (CommentsCard, CommentCell, CommentModal), ArchiveTable, map/ (MapCard, MapBoundary, `escapeHtml` for the popup), Alerts, FullDashboard.
- `src/filters/`: FilterButton, FilterChip, FilterSection, RangeSlider, SearchSelect.
- `src/toc/TocButton.tsx`.
- `src/ritratto/`: Ritratto, Act, useReveal, useCountUp, CountStat, goToAct, WishlistAct.
- `src/shell/`: Shell, ThemeToggle, ModeSwitch, Ambient, `hooks/useSwipeToggle`.

**Step 1 — dataset context.**
- Add `ProfileContext {profile, form, labels, dataset, now}`.
- `dataset = buildDataset(entries, {gifters, departures, venueCoords, cityCoords, wishlist})` computes FLAT_ALL, filter bounds, EMPTY_FILTERS and the vocabularies. It replaces every module-scope `ALLDATA` derivation.
- Feed it from `src/data.ts` first, so behaviour is unchanged.

**Step 2 — injected time.** `now` / `today` via context; remove direct `todayKey()` and `Date.now()` calls.

**Step 3 — SSR guards.** Cookie theme, ClientOnly TrendPlot, chat localStorage reads moved to effects, chat tools built from `dataset` vocab.

**Step 4 — Start routes.**
- `__root.tsx`: shell, head, theme.
- `$handle/route.tsx`: loader with the dataset + Shell; `$handle/index.tsx`, `$handle/dati.tsx`.
- `dati.tsx` and the `/?chat` redirect.
- `api/chat.ts`, `api/chat/history.ts` ported from the Netlify functions.
- Then swap the loader source to Convex (`convexQuery` + `useSuspenseQuery`, still subscribed after hydration).

**Step 5 — labels.** `labels(form)` with the f/m/neutral table, `SECTIONS` labels by form plus per-profile layout overrides; section ids stay a fixed enum.

## Rischi
- Hydration mismatch from time: isPlanned/todayKey and Date.now() (App 79-80, 339, 2208; tools.ts 118) run in UTC on Vercel SSR and in Europe/Rome on the client. Between 00:00 and 02:00 Rome the past/planned split differs, and 'media per anno' (toFixed(1)) can flip. Fix: pass a server-computed now (Europe/Rome) in loader data. Parity tests need a dev-only server-side now override, because Playwright's page.clock only freezes the browser.
- TrendPlot.tsx:64-71 calls getComputedStyle(document) inside a useState initializer. React 19 SSR resolves React.lazy, so the server would render it and crash. It must be wrapped in ClientOnly with the same fallback box.
- Theme moves from localStorage to a cookie. Existing visitors lose their saved choice unless the client migrates localStorage.theme once. 'system' still needs a tiny inline head script (matchMedia) to avoid a flash. Shell's localStorage/matchMedia initialisers (2459, 2511) cause hydration mismatches if left in place.
- Stored XSS once data is user-entered: MapCard popup uses mapboxgl.Popup.setHTML with unescaped artist/venue/city strings (App.tsx:1629-1631). It runs on the app origin, where the Better Auth session cookie lives, so it must be escaped or built with DOM nodes. Gifter url/logo (App 139, 146) need https-only validation in the Zod schema.
- More than 15 module-scope derivations of ALLDATA (FLAT_ALL, filter bounds, COST_MAX/KM_MAX, EMPTY_FILTERS, the FilterContext default, alerts, Ritratto P, Shell applyFilters/clearFilters, tools.ts CITIES/COMPANIONS z.enum). Missing one leaks Gabri's data or bounds into other profiles.
- Chat tool input schemas are z.enum values built at import from ALLDATA. The ai-client validates client-tool input with its own schema and sends the client tool schemas to the server. Per-profile vocabularies must therefore be built identically on both sides (shared factory + loader data), or the validation fails.
- Gabri-specific constants hidden in the logic: year span 2017..max(2026,…) (416), since=2022 (335, 375, 505, 815-817, 2206), 'X% a Milano' (334, 379), footer credit to Cami (2383, 2443), Loop referral link (2189, 2358), and system-prompt examples 'Camilla'/'Cami <3' (chat.mts:312). SPEC is silent on credits and the referral for other profiles, so this needs a product decision. The derived-rule replacements must reproduce 2022/Milano for gabrifila to keep parity.
- ALLOWED_ORIGINS (src/chat/chatlog.ts:80) allows only localhost, concerti.gabrifila.me and *.netlify.app. Vercel URLs, the tailnet URL and portless https://<wt>.concerti-gabri.localhost:1355 would get 403. Netlify runtime context (context.ip, context.deploy.context) must be mapped to Vercel headers and VERCEL_ENV for the preview namespace.
- Owned chat threads live in localStorage 'concerti-chat-threads' with no handle. For per-page history, tag entries with a handle and map legacy entries to gabrifila. Write keys must migrate unchanged (same origin at the DNS switch).
- Label inconsistency: CANZONI_NOTE_LABELS[4]='Molte' in the UI vs 'Quasi tutte' in the tools.ts/chat.mts descriptions. The single Zod schema must choose one.
- Parity screenshots are flaky by default: reveal opacity:0 acts, rAF count-ups, beam animations, the Mapbox canvas and the ECharts canvas. Use reducedMotion:'reduce', a frozen clock on both builds, and masks for .mapwrap and .trendcanvas. content-visibility:auto sections (styles.css:764-765) can also change full-page heights between SPA and SSR.
- Seeded departure names must be exactly 'Milano' and 'Genova'; otherwise the archive text '~N km da Milano' changes (FROM_LABELS, App 156/1316/1347).
- CSS imported from a component (WishlistAct imports wishlist.css) and the global styles.css must be linked in the root head via ?url, or SSR pages show a flash of unstyled content.
- The ?chat= handling uses history.replaceState outside the router (ChatWidget 354-363), which desyncs router state under Start. The /dati and /?chat redirects must be server-side; the #sec-… fragment survives a 3xx automatically.

## Fonti
- /home/gabri/code/personal/concerti-gabri/src/App.tsx
- /home/gabri/code/personal/concerti-gabri/src/data.ts
- /home/gabri/code/personal/concerti-gabri/src/chat/tools.ts
- /home/gabri/code/personal/concerti-gabri/src/chat/ChatWidget.tsx
- /home/gabri/code/personal/concerti-gabri/src/chat/chatlog.ts
- /home/gabri/code/personal/concerti-gabri/src/TrendPlot.tsx
- /home/gabri/code/personal/concerti-gabri/src/WishlistAct.tsx
- /home/gabri/code/personal/concerti-gabri/src/main.tsx
- /home/gabri/code/personal/concerti-gabri/src/styles.css
- /home/gabri/code/personal/concerti-gabri/src/wishlist.css
- /home/gabri/code/personal/concerti-gabri/src/global.d.ts
- /home/gabri/code/personal/concerti-gabri/index.html
- /home/gabri/code/personal/concerti-gabri/public/manifest.webmanifest
- /home/gabri/code/personal/concerti-gabri/netlify/functions/chat.mts
- /home/gabri/code/personal/concerti-gabri/netlify/functions/chat-history.mts
- /home/gabri/code/personal/concerti-gabri/vite.config.ts
- /home/gabri/code/personal/concerti-gabri/vercel.json
- /home/gabri/code/personal/concerti-gabri/package.json
- /home/gabri/code/personal/concerti-gabri/scripts/preview-shot.mjs
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/SPEC.md
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/PROMPT.md
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/DECISIONI.md
- /home/gabri/code/personal/concerti-gabri/CLAUDE.md
- node_modules/@tanstack/ai-client@0.20.0 dist/esm/chat-client.js (client tool schemas sent and validated)
- node_modules/@tanstack/ai@0.40.0 dist/esm/activities/chat/tools/tool-calls.js (parseWithStandardSchema on tool input)
- /tmp/kpi-inv/kpi.mjs and /tmp/kpi-inv/cards.mjs (throwaway KPI/card baseline scripts, outside the repo)
