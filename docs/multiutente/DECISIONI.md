# Decisioni prese durante il setup

Scelte fatte con Gabri durante la Fase 1 (setup esterno) dove SPEC.md non
bastava o andava adattato. Valgono come SPEC.md: se le due cose divergono,
vince la decisione più recente qui sotto.

## Ambienti e URL

| Ambiente | App | Convex |
|---|---|---|
| dev (t3node) | `https://t3node.tail4a8e3b.ts.net:8444` → porta 3150: build di produzione del checkout principale, servita dall'orchestratore (dal 2026-10-22; la 3100 è degli e2e dei worktree) | `agile-leopard-908` (EU) |
| preview del branch `multiutente` | `https://concerti-gabri-git-multiutente-gabrifilas-projects.vercel.app` | `preview/multiutente` (EU), creato dal build Vercel |
| produzione | `https://concerti-gabri.vercel.app`, poi `https://concerti.gabrifila.me` allo switch | `brave-chickadee-534` (EU) |

- Vercel: i build di produzione sono disattivati (Ignored Build Step a livello
  di progetto) finché non si fa lo switch. Le preview sono protette da Vercel
  Authentication; gli smoke test usano `VERCEL_AUTOMATION_BYPASS_SECRET`.
- Better Auth: `BETTER_AUTH_TRUSTED_ORIGINS` contiene URL esatti, mai jolly su
  `*.vercel.app` (chiunque può registrare un progetto con un nome che combacia,
  e con oAuthProxy un'origine fidata riceve il cookie di sessione).

## Sentry (2026-10-21)

- Org `gabriele-filaferro` (regione EU, `de.sentry.io`), progetto
  `concerti-gabri`, piattaforma TanStack Start React (SDK
  `@sentry/tanstackstart-react`, in beta). `SENTRY_ORG`/`SENTRY_PROJECT` stanno
  nel codice (`vite.config.ts`), non nell'env.
- Solo error monitoring: **Session Replay spento** (registrerebbe la dashboard
  mentre si scrive un indirizzo), niente tracing/logging per ora, niente PII di
  default, `beforeSend` che toglie indirizzi e coordinate.
- `SENTRY_AUTH_TOKEN` è un Organization Token (solo release/source map): serve
  solo al build Vercel.
- Impostazione di progetto **Prevent Storing of IP Addresses: ON** (2026-10-21):
  senza, Sentry salvava l'IP di chi invia l'evento e ne ricavava la città.
  Su PostHog l'equivalente è *Discard client IP data*.

## Email (2026-10-21): solo Google per ora

Resend non ha domini liberi sull'account di Gabri, quindi **niente dominio
`concerti.gabrifila.me` su Resend per ora**. Conseguenze:

- In produzione il login è **solo Google**. L'account nasce comunque al primo
  login.
- Il plugin email OTP resta nel codice, ma è attivo solo se c'è un mittente:
  - in dev/test c'è sempre il sender di sviluppo (OTP leggibile dai test e2e,
    mai in produzione);
  - in preview/produzione il pulsante "Entra con email" compare solo quando
    sono impostati `RESEND_API_KEY` e il mittente (`EMAIL_FROM`, default
    previsto `Concerti <notifications@concerti.gabrifila.me>`); dal
    2026-10-23 vale ovunque, salvo i build e2e («Landing e accesso»).
- Attivarlo più avanti = verificare il dominio su Resend (regione EU) e
  impostare le due variabili su Convex, senza toccare il codice.
- `scripts/check-setup.mjs` riporta Resend come "non configurato", non KO.

## Geocoding (2026-10-21): OpenStreetMap, non Mapbox

SPEC.md diceva "geocoding lato server con Mapbox". Dai termini attuali non si
può fare per il nostro uso, quindi **venue e partenze si geocodificano con
OpenStreetMap (Nominatim)**, sempre e solo lato server (azioni Convex). Mapbox
resta solo per la mappa, con il token `pk.` limitato per URL: niente token
Mapbox server.

Perché (verificato il 2026-10-21):
- Mapbox Product Terms (20/10/2026) §2.7.2: i risultati temporanei non si
  possono salvare. §2.7.3: quelli permanenti (5 $/1.000, carta obbligatoria)
  solo con una richiesta per ogni account che li usa e senza rendere le
  coordinate disponibili agli utenti finali; §2.7.1 vieta di costruirci un
  database generale di POI. Il catalogo venue è condiviso e la mappa pubblica
  manda le coordinate ai visitatori. In più la Geocoding API di Mapbox cerca
  solo indirizzi: i POI ("Forum di Assago") stanno nella Search Box API, i cui
  risultati non si possono salvare.
- Google Maps Platform Service Specific Terms §6: niente uso con una mappa non
  Google, coordinate in cache al massimo 30 giorni salvo cache isolata per
  singolo utente.
- OpenStreetMap: dati ODbL, salvabili e pubblicabili con l'attribuzione
  "© OpenStreetMap contributors" (già nei crediti della mappa Mapbox).

Regole d'uso di Nominatim (https://operations.osmfoundation.org/policies/nominatim/)
che il codice deve rispettare:
- al massimo 1 richiesta al secondo, un solo worker (coda/serializzazione
  nell'azione Convex);
- User-Agent che identifica l'app, es. `concerti-gabri/1.0 (+https://concerti.gabrifila.me)`;
- niente autocompletamento: si cerca all'invio, poi la persona sceglie tra i
  candidati; i risultati si salvano (catalogo venue) e non si ripetono query
  identiche;
- nessuna garanzia di servizio: l'URL del geocoder sta dietro una variabile
  (default `https://nominatim.openstreetmap.org`) per poter passare a un altro
  servizio basato su OSM senza toccare i dati.

Per le partenze la precisione di Nominatim basta: il jitter dei km (±6%)
copre errori di qualche centinaio di metri. Le coordinate della partenza
restano solo nel documento privato della partenza (mai in query pubbliche).

Mappa: il token `pk.` è limitato per URL (Mapbox controlla l'header
`Referer`), quindi l'app non deve impostare `Referrer-Policy: no-referrer`
né `same-origin` sulle pagine con la mappa. Gli URL per-commit delle preview
(`concerti-gabri-<hash>-…`) non sono nella lista: la mappa va provata sull'URL
del branch. URL ammessi: `http://localhost:3100`, `https://localhost:1355`
(portless, vale anche per `<worktree>.concerti-gabri.localhost:1355`), l'URL
tailnet, `concerti-gabri.vercel.app`, l'URL del branch `multiutente`,
`concerti.gabrifila.me`. Verificato il 2026-10-21: la restrizione vale sulle
tile (`/v4/...vector.pbf`: 200 dagli URL ammessi, 403 da altri o senza
Referer), non su stili e font, che rispondono 200 a chiunque. I controlli
automatici vanno quindi fatti sulle tile.

## Upstash (2026-10-21): token con permessi di scrittura

Gabri ha scelto di non sostituire il token: in fnox c'è il token **normale**
(lettura e scrittura) col nome `UPSTASH_REDIS_REST_TOKEN_RW`. Regole:
- lo usa solo lo script di migrazione dello storico chat, in locale, con
  **soli comandi di lettura**; in Fase 3 si esegue solo con `--dry-run`;
- mai su Vercel o Convex; mai `Redis.fromEnv()` (legge
  `UPSTASH_REDIS_REST_TOKEN`, che qui volutamente non esiste);
- `scripts/check-setup.mjs` lo segnala come "OK, ma con permessi di scrittura".

Stato al 2026-10-21: 25 conversazioni nell'indice di produzione
(`concerti:chat:log:index`), 34 in quello delle preview.

## Dove vive ogni variabile

| Variabile | fnox / `.env.local` | Vercel | Convex |
|---|---|---|---|
| `VITE_SITE_URL` | ✓ (URL tailnet) | – (dal codice) | – |
| `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL` | ✓ (dev) | dal build (`convex deploy`) | – |
| `CONVEX_DEPLOY_KEY` | come `…_PROD` / `…_PREVIEW` | Production / Preview (sensitive) | – |
| `ENABLE_EXPERIMENTAL_COREPACK=1` | – | Production + Preview | – |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | ✓ | di sistema | – |
| `BETTER_AUTH_SECRET` | come `…_DEV` / `…_PREVIEW` / `…_PROD` | – | dev, prod, default preview, `preview/multiutente` |
| `SITE_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` | – | – | idem |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✓ | – | idem |
| `RESEND_API_KEY`, `EMAIL_FROM` | – (per ora) | – | – (per ora) |
| `VITE_MAPBOX_TOKEN` | ✓ | Production + Preview | – |
| `VITE_SENTRY_DSN` | ✓ | Production + Preview | – |
| `SENTRY_AUTH_TOKEN` | ✓ | Production + Preview (sensitive) | – |
| `VITE_POSTHOG_KEY` | ✓ | Production + Preview | – |
| `GEMINI_API_KEY` | ✓ | Production + Preview (sensitive) | – |
| `GEMINI_MODEL` | ✓ (default) | Production + Preview | – |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN_RW` | ✓ | – | – |
| `CHAT_SERVER_SECRET` | come `CHAT_SERVER_SECRET` (dev) / `…_PREVIEW`; `…_PROD` nel profilo `prod`, allo switch | Preview (sensitive); Production allo switch | dev, default preview, `preview/multiutente`; prod allo switch |
| `AUTH_DEV_OTP=1` | – | – | dev, default preview, `preview/multiutente`; **mai** prod |
| altre variabili della Fase 3 | vedi "Decisioni della Fase 3" → "Variabili d'ambiente nuove" | | |

## Da fare allo switch

La checklist completa, con chi, comandi e verifiche, è `SWITCH.md`. Qui
restavano: Ignored Build Step e dominio su Vercel, `SITE_URL` di Convex prod,
Branding di Google, `CHAT_SERVER_SECRET` di produzione, Resend facoltativo:
sono tutti lì.

## Risposte alle domande del piano (2026-10-21)

Gabri ha approvato `PIANO.md` e tutte le proposte di §12:
1. credito "supporto di Cami" e link Loop: campi facoltativi del profilo, solo su `gabrifila`;
2. esporta dati: testo degli indirizzi sì, coordinate mai; solo da dashboard;
3. elimina account: solo da dashboard, mai da un agente;
4. coordinate di casa nella storia git: per ora si accetta (si tolgono da `CLAUDE.md` al traguardo 9);
5. Claude.ai/ChatGPT veri sull'MCP: dopo lo switch;
6. forma neutra: si rivede sugli screenshot;
7. chat dell'Oracolo in modalità scrittura: private, mai nello storico pubblico;
8. in produzione si registra solo chi è in `SIGNUP_ALLOWLIST`; dev e preview aperti;
9. protezione della produzione dagli agenti: fatta subito, vedi sotto;
10. correzione dell'indirizzo di una partenza al massimo una volta al giorno.

### Protezione della produzione (fatta il 2026-10-21)

- `.claude/settings.json` del repo nega agli agenti i comandi che toccano la
  produzione: il deploy di Convex, i comandi Convex col flag di produzione, il
  nome del deployment prod, il profilo fnox `prod`, deploy/promote/rollback di
  Vercel, i push su `main` e i push forzati. Le regole guardano tutta la riga
  di comando: un messaggio di commit che cita quei comandi viene bloccato,
  quindi si committa con `git commit -F <file>`.
- In fnox `CONVEX_DEPLOY_KEY_PROD` e `BETTER_AUTH_SECRET_PROD` stanno nel profilo
  `prod` (`[profiles.prod.secrets]`): non finiscono in `.env.local` né
  nell'ambiente delle sessioni. Servono solo a mano, caricando quel profilo.
  `check-setup` senza profilo prod salta la riga "deploy key prod".

## Fase 3: esiti degli spike e scelte del traguardo 2 (2026-10-21)

- **Convex nelle corsie:** backend locale **anonimo** (agent mode), creato da
  `scripts/convex-locale.mjs init`; dati in `.convex/local/default`, selezione
  in `.env.worktree`. `convex dev` riscrive `.env.local`, quindi lo script
  toglie quelle righe. `scripts/wt.mjs` dà alla CLI un token finto: da un
  worktree non si raggiunge nessun deployment cloud.
- **Nominatim dal Convex cloud** (`agile-leopard-908`, runtime predefinito,
  2026-10-21 23:28): risponde con il nostro User-Agent, niente 403/429; la
  coda da 1 richiesta al secondo funziona con `setTimeout` (seconda richiesta
  dopo ~0,8 s), quindi niente `"use node"`. "Forum di Assago" con
  `layer=poi` restituisce solo una fermata del bus, che il filtro scarta
  (si ripiega sulla città); "Unipol Forum Assago" dà il POI.
- **`--preview-run seed:ensure`:** verificato nel sorgente della CLI 1.47 (stesso
  percorso di `convex run`, con la chiave admin). Scatta solo su una preview
  **nuova**: `preview/multiutente` esisteva già, quindi il primo seed lì è a mano.
- **`@types/papaparse`:** la 5.7.0 non esiste su npm, c'è la 5.5.2.
- **Deroga a §1.13 (`/ingest`):** le `routeRules` filtrano gli header
  `cookie` e `authorization`, così il cookie di sessione non arriva mai a
  PostHog. Per questo su Vercel il proxy gira nella funzione (`dub1`) e non
  nel CDN. Da verificare sulla preview nel traguardo 8.
- **Venue (contratto cambiato nel traguardo 2):** `search_venue` dà candidati con
  un `ref`; `add_venue` accetta solo `{ref, name?}` e rilegge coordinate, id
  OSM e città dalla cache del server. Nessuno può mettere nel catalogo
  coordinate inventate.
- **`get_stats`** → `agents:stats` (traguardo 7).
- **Stesso indirizzo:** un candidato entro 50 m da quello salvato non è una
  correzione: niente nuovo scarto e nessun limite consumato.
- **Rischi residui:** aggiornati il 2026-10-22 in "Decisioni della Fase 3" →
  "Rischi residui" (la stima di "circa 1 km" sulle sonde dei km era
  sbagliata; il nome libero di `add_venue` non vale più).
- **Ondata unica:** dopo il traguardo 2, le corsie 3, 4, 8, 5, 7, 6 e lo script
  di migrazione partono insieme, con i contratti di
  `docs/multiutente/CONTRATTI-ONDATA.md`; le spec con sessione (`@sessione`)
  girano all'integrazione.

## Decisioni della Fase 3 (2026-10-22)

Il riepilogo per chi lavora dopo la Fase 3: le scelte di PIANO §1 che restano
vincolanti, le deroghe ai documenti vincolanti, gli esiti degli spike e gli
scostamenti riportati dalle corsie e dalle integrazioni. Il perché per esteso
sta in PIANO §1 e nei commit `Fase 3.N`.

### Scelte del piano che restano (PIANO §1)

- **Stack.**
  - Better Auth fermo a 1.6.33 con override pnpm (`@convex-dev/better-auth`
    0.12.5 vuole `<1.7`); MCP col plugin `mcp()` di 1.6, irrobustito; niente
    `@better-auth/oauth-provider` (rotto con `convex()`). `@better-auth/mcp`
    (solo 1.7) si rivaluta quando l'adapter supporterà 1.7.
  - "Oggi" sempre in `Europe/Rome`, con `now` catturato una volta nel loader
    di root; tema del visitatore nel cookie `tema` (`dark|light|system`,
    predefinito `dark`), già nell'HTML SSR.
  - Client Convex e `QueryClient` per richiesta, mai di modulo; HTML e server
    function con `Cache-Control: private, no-store` (`s-maxage` solo su `/og`).
  - Origini ammesse, canonical, OG e metadati MCP dall'ambiente Vercel, mai
    dall'header `Host`; l'origine canonica coincide con `SITE_URL` di Convex
    (issuer di Better Auth).
  - Header di sicurezza in `vercel.json` (HSTS, nosniff,
    `Referrer-Policy: strict-origin-when-cross-origin`, niente frame,
    `Permissions-Policy`), niente `script-src`; CSRF sulle server function in
    `src/start.ts`. Funzioni Vercel in `dub1`, accanto a Convex EU.
  - File generati committati (`src/routeTree.gen.ts`, `convex/_generated/`);
    `pnpm build` = `vite build && tsc -b`.
  - Sentry v11 con `dataCollection` tutto spento e niente replay, feedback o
    tracing; PostHog `cookieless_mode: 'always'`, autocapture spento; query
    string tolta sotto `/autorizza`, `/accedi` e `/api/auth` in entrambi.
  - Preview: `--preview-run seed:ensure` nel `buildCommand`, `AUTH_DEV_OTP` e
    `CHAT_SERVER_SECRET` anche nelle variabili predefinite delle preview,
    schema solo additivo; se un cambio rompe i dati: `devtools:reset`,
    `seed:ensure`, claim. `fase3/*` e `integrazione` non si buildano.
- **Dati, privacy e sicurezza.**
  - Il primo login crea il profilo in `onboarding`; `pages.byHandle` dà `null`
    per i profili non `active`. Un handle rinominato diventa un alias con 301,
    riservato finché il profilo esiste; `gabrifila` lo scavalca solo il seed.
  - Nel DB riferimenti per id, negli input esterni per nome (`resolveRefs`).
  - Km per coppia (partenza, venue) in `kmPairs`, estratti una volta;
    correzione dell'indirizzo al massimo una al giorno; venue immutabili; il
    seed copia i km legacy.
  - Nominatim con una coda globale da 1 richiesta al secondo; le partenze non
    passano mai da cache o log (candidati in `geocodeDrafts`, scelta per
    indice); venue con `layer=poi` e cache hashata dei soli POI.
  - Tabelle private (`departureSecrets`, `geocodeDrafts`, `kmPairs`) solo in
    `convex/departures.ts` e `convex/lib/km.ts`; i job programmati ricevono
    solo id.
  - `CHAT_SERVER_SECRET` mai come argomento (Bearer verso le `httpAction`
    `/oracolo/*`); argomenti larghi e validazione Zod nell'handler; errori
    `{code, messaggio}` senza valori; `shared/scrub.ts`.
  - Storico dell'Oracolo in `chatThreads`: chiave di scrittura come SHA-256 e
    facoltativa (un thread senza chiave lo rivendica il primo turno con
    chiave), IP come HMAC con chiave HKDF da `CHAT_SERVER_SECRET`, niente
    namespace `preview:`.
  - Oracolo in scrittura con `as: "oracolo"` (può solo declassare), senza
    `web_search`, Origin obbligatorio, thread privati.
  - OTP di sviluppo solo con `AUTH_DEV_OTP=1` e fuori produzione; Resend solo
    con `RESEND_API_KEY` **ed** `EMAIL_FROM`.
  - Better Auth: `baseURL` = `SITE_URL`, limiti interni per IP spenti (contano
    i limiti Convex per email e globali), `enableSessionForAPIKeys: false`,
    `/autorizza` non incorniciabile.
  - Registro: istantanee delle sole tabelle pubbliche; un indirizzo cambiato
    si registra senza valori e non si annulla; i ricalcoli `sistema` non si
    annullano.
  - Export ed eliminazione dell'account solo da dashboard; l'export ha il
    testo degli indirizzi, mai coordinate, `ipHmac`, `writeKeyHash` o
    `authUserId`.
- **Prodotto.** "Canzoni note" 4 = "Molte"; le costanti cucite su Gabri sono
  regole; credito del footer e link Loop solo per `gabrifila`; layout (ordine,
  nascoste, titoli) per le sezioni di "I dati", "Sul palco" fisso; avvisi di
  manutenzione solo per il proprietario; km in attesa = "—" in Viaggio e
  "(N viaggi in attesa)" nella KPI; utente loggato su `/` → 307 alla sua
  pagina o a `/benvenuto` (rivisto il 2026-10-23, «Landing e accesso»),
  `/benvenuto` finito → `/<handle>/modifica`, "Esci" in `#account` e nel
  footer; font dei titoli Fraunces, Inter, Space Grotesk, Playfair Display in
  self-hosting; manifest per profilo; regola dei soprannomi ovunque si
  inseriscono nomi.

### Deroghe ai documenti vincolanti (PIANO §1.43–1.45)

- **oAuthProxy non esercitato in Fase 3.** La preview `multiutente` usa il
  callback Google diretto dell'URL del branch. Il proxy si attiva allo switch
  (`OAUTH_PROXY_SECRET`, `OAUTH_PROXY_PRODUCTION_URL`) e si verifica con un
  login da una preview di un altro branch (`SWITCH.md`).
- **OTP di sviluppo sulla preview**, in deroga a "in preview solo con Resend"
  (sezione Email): su `preview/multiutente` "Entra con email" usa il sender di
  sviluppo e nessuna email parte. La preview è protetta da Vercel
  Authentication e serve agli smoke test. Mai in produzione: il codice ignora
  `AUTH_DEV_OTP` sul deployment prod e con gli URL di produzione. Dal
  2026-10-23 il pulsante senza Resend non c'è più: la deroga vale solo per il
  login via API («Landing e accesso»).
- **Riuso dei km più forte della ricetta di CLAUDE.md:** con `kmPairs` una
  coppia si riusa anche quando nessun concerto la usa più.

### Spike del piano (§9)

| Spike | Esito |
|---|---|
| Start + Nitro sulla preview, SSE da `dub1` | ok: la preview del branch builda; l'Oracolo in SSE fa girare `query_concerts` sul server e risponde in terza persona (orchestratore, 2026-10-22) |
| `git.deploymentEnabled` con `fase3/*` | nessun esito scritto: da verificare |
| deployment locale e `--env-file` | backend locale anonimo (sopra, traguardo 2) |
| `--preview-run` con una funzione `internal` | verificato nel sorgente; scatta solo su una preview nuova (sopra) |
| User-Agent e `setTimeout` nelle action | ok, niente `"use node"` (sopra) |
| `@vercel/og` in Nitro/Vercel | non si carica in Node ESM fuori da Next.js ("Dynamic require of fs"); il ripiego `satori` 0.63.2 + `@resvg/resvg-wasm` 2.6.2, con wasm e woff statici inclusi, va in locale e sulla preview (PNG 1200×630). `@vercel/og` resta installato ma non usato |
| `/ingest` con le `routeRules` | proxy nella funzione e non nel CDN (deroga a §1.13, sopra); sulla preview inoltra a PostHog |
| evento Sentry dal server della preview | errore di prova inviato il 2026-10-22 alle 09:49 UTC; il contenuto lo controlla Gabri nella UI di Sentry (`SENTRY_AUTH_TOKEN` non legge gli eventi) |
| `identify` di PostHog in cookieless | da verificare sulla preview |
| SDK MCP v2 con Claude Code | `@modelcontextprotocol/server` 2.3.1 (`createMcpHandler`, `legacy: 'stateless'`, `responseMode: 'json'`, `requireBearerAuth`) passa tutti i test, il ripiego 1.32.1 non è servito; Claude Code vero sul `/mcp` del dev ancora da provare |
| hook oidc di `convex()` con `mcp()` in authorize | coperto in locale: `mcp-oauth.spec` passa da capo a fondo attraverso il proxy Start |

### Scostamenti ed esiti, per area

**Auth e onboarding (corsia 3)**
- I limiti OTP stanno in un hook `before` di Better Auth su
  `/email-otp/send-verification-otp`, non nella callback di invio: Better Auth
  ingoia gli errori della callback dopo aver già ruotato il codice.
- `authFlags.get` dà anche `googleLogin`; la guardia dell'OTP di sviluppo
  rifiuta anche i `SITE_URL` di produzione.
- Provider: `ConvexProviderWithAuth` con un token fetcher stabile invece di
  `ConvexBetterAuthProvider` (che rimontava `/benvenuto`); il primo token
  arriva dopo l'idratazione da `GET /api/auth/convex/token`, quindi nell'HTML
  SSR non c'è nessun JWT. L'SSR anonimo salta lo scambio senza cookie di
  sessione.
- JWT di Convex minimo (`sub`, `sessionId`, date): niente email né nome; chi
  serve l'email la legge dal componente.
- `/delete-user` e `/delete-user/callback` spenti via HTTP: l'account si
  elimina solo con `account:elimina` (cascata, poi `auth.api.deleteUser` lato
  server).
- `SIGNUP_ALLOWLIST`: il rifiuto è il codice `non_invitato`, uguale per OTP e
  Google. A un'email fuori elenco e senza account si risponde come a un invio
  vero, ma nessun codice parte e nessun limite si consuma: il messaggio
  d'invito compare in pratica solo con Google.
- Login e logout fanno sempre un reload completo.
- `devOtp:azzeraLimiti` esiste solo per gli e2e, su deployment locali e dev.
- La regola dei soprannomi sta accanto ai modelli CSV/JSON, non dentro (i
  formati congelati non hanno commenti).

**Pagine pubbliche (corsia 4)**
- Origine canonica (canonical, `og:url`, `og:image`, JSON-LD) dalla stessa
  funzione di `/mcp` (`src/server/mcp/origine.ts`), letta a runtime nel
  loader di root: produzione `VERCEL_PROJECT_PRODUCTION_URL`, preview
  `VERCEL_BRANCH_URL`, dev `VITE_SITE_URL`, worktree `SITE_URL`. Nessuna
  origine di sviluppo nel bundle client (`bundle-guard` cerca l'host
  tailnet).
- Niente manifest globale: ogni profilo linka il suo. `head()` di `/$handle`
  vale anche sotto `/modifica` (canonical verso la pagina pubblica, titolo
  proprio e `noindex`). "Modifica" nello switch è un link a pagina intera.

**`/modifica` (corsia 5 e integrazione)**
- `account:elimina` legge la freschezza della sessione dalla riga `session` di
  Better Auth e, nella stessa transazione, toglie anche `apikey`,
  `oauthAccessToken`, `oauthConsent`, `oauthApplication` e le verifiche OTP
  dell'email. "Esci" sta in `#account` e nel footer.
- Loghi dal browser: tipo dichiarato confrontato coi magic byte, collegati da
  un'action. Loghi da URL degli agenti: al massimo 3 redirect, ognuno
  controllato (https, niente host locali né IP letterali).
- Credito e link del footer (`style:setExtra`) solo per `gabrifila`,
  controllato lato server.
- L'export è un involucro (`formato: "concerti-gabri/export"`) il cui campo
  `concerti` è nel formato di import.
- Venue (correzione dell'integrazione, cambia il contratto di `add_venue`): un
  luogo di OpenStreetMap tiene il suo nome, con un dettaglio tra parentesi
  solo per distinguerlo da un'omonima nella stessa città; un'omonima
  nome+città si riusa solo entro 300 m dal candidato scelto, altrimenti
  `conflitto`. Il ripiego sulla città accetta solo centri abitati e quelle
  venue si chiamano liberamente, con le coordinate del centro.
- Cancellare una partenza, una persona o un "regalato da" in uso dà `in_uso`
  con l'elenco dei concerti.
- Le sezioni di `/modifica` si riempiono dopo l'idratazione (nell'HTML SSR
  c'è "Carico…").
- I fogli di stile delle pagine si linkano dall'`head` del root, mai con
  `<link precedence>` di React 19 nel contenuto: React 19.2 nascondeva la
  pagina SSR fino a ~2,3 s e poteva lasciarne una copia nascosta.

**MCP e API (corsia 7)**
- `importer.preview` è `dashboardOnly`, in deroga a PIANO §5.2: il catalogo
  congelato mappa `import_concerts` solo su `importer:apply`. L'import crea
  nello stesso lotto annullabile le persone e i "regalato da" mancanti; venue
  e partenze devono già esistere.
- L'origine MCP/OAuth deve coincidere con `SITE_URL` di Convex: `issuer` di
  `/.well-known/oauth-authorization-server` = `authorization_servers[0]` di
  `/.well-known/oauth-protected-resource/mcp`.
- `/autorizza`: l'host del `redirect_uri` lo legge il server dalla richiesta
  di `mcp()`, mai da un parametro dell'URL, e si mostra per tipo (https, http
  con avviso, programma locale, app); il nome del client si ripulisce e si
  tronca a 40 caratteri.
- L'authorize non autenticato passa dalla route Start
  `/api/auth/mcp/authorize`: rimanda a `/accedi?next=…`, e con la sessione
  inoltra con `prompt=consent` forzato.
- Scope: i token portano solo `concerti` e, se chiesto o se non si chiede
  niente, `offline_access`; `openid`, `profile` ed `email` si tolgono, quindi
  nessun `id_token` con dati dell'utente.
- DCR: corpo al massimo 8 KB, `client_name` 200 caratteri, al massimo 10
  `redirect_uris` da 1024 caratteri, controllati prima di salvare e prima di
  `dcrGlobal`; la pulizia legge 10 client per esecuzione e si rischedula.

**Oracolo (corsia 6 e integrazione)**
- La modalità scrittura è `POST /api/chat/scrittura` (Origin obbligatorio,
  sessione con `getToken`); il proprietario legge i suoi thread con
  `chat:myThreads`/`chat:myThread` (`dashboardOnly`). Su `/<handle>/modifica`
  il widget pubblico è nascosto.
- Il server non si fida mai dello storico del browser: modello e trascrizione
  usano lo storico di Convex più la sola domanda nuova (una ripresa aggiunge
  al massimo 2000 caratteri).
- In scrittura chiedono l'approvazione in chat le cancellazioni, ogni import,
  `undo`, `merge_person` e `set_wishlist`; dal 2026-10-24 anche ogni concerto,
  dalla scheda di `propose_concert` («Scheda dell'Oracolo»).
- La chat in scrittura del proprietario ha un tetto suo (`chatPageDay` con
  chiave `scrittura:<profileId>`, 60 al giorno, 120 per `gabrifila`) più
  `chatIpMinute`, fuori dai limiti dei visitatori.
- Gemini ignora `const` dello JSON Schema: gli strumenti di scrittura lo
  mandano anche come enum di un valore.
- In scrittura i log hanno solo metadati; il prompt pubblico elenca solo le
  sezioni visibili, coi titoli personalizzati.

**Osservabilità (corsia 8)**
- Sentry sul server parte dal primo import di `src/server.ts`
  (`wrapFetchWithSentry`). Fuori da Vercel il build non chiama mai l'API di
  Sentry (token vuoto, `setCommits: false`); le source map si caricano solo
  con `VERCEL=1`.
- `/__e2e/errore-server` esiste solo negli e2e locali e sulle preview; gli
  e2e usano sostituti locali di Sentry e PostHog (`scripts/e2e-sink.mjs`,
  `scripts/e2e-ingest.mjs`).
- `posthog.reset()` al logout; `identify` solo con l'id opaco del profilo.
- `shared/scrub.ts` sostituisce con `[coords]` ogni decimale isolato con
  almeno 4 cifre entro ±180 nelle stringhe.
- Mapbox GL tiene in `localStorage` un uuid di telemetria: da valutare una
  riga in `/privacy`.

**Migrazione dello storico**
- `writeKeyHash` = SHA-256 esadecimale della chiave; messaggi come
  `ModelMessage[]` di TanStack AI; i thread migrati non hanno `ipHmac` e,
  senza chiave, restano rivendicabili.
- Lo script gira dal checkout principale con `fnox exec`, mai dentro
  `wt exec`; `--apply` vuole prima `seed:ensure` sul deployment di
  destinazione.
- **Dry-run reale** su Upstash di produzione (sola lettura, con l'OK di
  Gabri), 2026-10-22 ~08:35: 25 voci nell'indice, 0 id non validi, 25
  conversazioni con chiave di scrittura (→ SHA-256), 0 scadute, 227
  messaggi, 122,9 KB → 2 chiamate `convex run` all'apply, 0 errori.

**Strumenti**
- `bundle-guard` (commit `59fc77b`): eccezione stretta per il getter
  isomorfo dell'ambiente di Better Auth, che porta nel bundle client il
  **nome** `BETTER_AUTH_SECRET`, mai il valore; si toglie solo quella forma
  esatta.
- `scripts/bundle-guard.mjs` ed `e2e/helpers/fughe.ts` leggono gli aghi delle
  coordinate di casa da `git show main:CLAUDE.md`, che li perde col merge
  dello switch: prima vanno puntati a un commit fisso (`SWITCH.md`).
- `scripts/convex-locale.mjs`: `env` (e quindi `init` su un deployment che
  esiste) rigenera `BETTER_AUTH_SECRET`, che cifra le chiavi JWKS: non va
  rilanciato su un deployment con chiavi. Tutti i backend locali partono su
  3210/3211 e `status` controlla solo la porta: porte distinte per worktree.

**Esecuzione**
- Le due ondate del piano sono diventate un'ondata unica con i contratti di
  `CONTRATTI-ONDATA.md`.
- Notte del 2026-10-21: T3 Code mette tutti gli agenti in un cgroup con
  MemoryHigh al 50% e MemoryMax al 75% della RAM (~6/9 GB); sette corsie in
  parallelo hanno mandato la macchina in thrashing per ore. Da allora: al
  massimo due corsie alla volta, un watchdog della memoria sui lock pesanti,
  build e vitest sullo stesso lock (regola in `CLAUDE.md`).

### Variabili d'ambiente nuove della Fase 3 (solo nomi)

| Variabile | fnox | Vercel | Convex | Note |
|---|---|---|---|---|
| `CHAT_SERVER_SECRET` | `CHAT_SERVER_SECRET` (dev), `CHAT_SERVER_SECRET_PREVIEW`; `CHAT_SERVER_SECRET_PROD` (profilo `prod`) allo switch | Preview (sensitive); Production allo switch | dev, predefinite delle preview, `preview/multiutente`, locali; prod allo switch | stesso valore sul server Start e sul suo deployment, altrimenti `/api/chat` → 503 |
| `AUTH_DEV_OTP` (`=1`) | – | – | dev, predefinite delle preview, `preview/multiutente`, locali; **mai** prod | il codice la ignora in produzione |
| `NOMINATIM_URL` | – | – | facoltativa (default OSM); stub nei locali | |
| `RESEND_API_KEY`, `EMAIL_FROM` | – (per ora) | – | – (per ora) | servono entrambe |
| `SIGNUP_ALLOWLIST` | – | – | prod allo switch | email separate da virgola, compresa quella di Gabri; assente = registrazione aperta |
| `OAUTH_PROXY_SECRET`, `OAUTH_PROXY_PRODUCTION_URL` | il primo | – | prod e predefinite delle preview, dopo il DNS | §1.43 |
| `PREVIEW_URL` | – | – | – | solo per `pnpm e2e:preview` |
| `E2E`, `E2E_NOW`, `ORACOLO_FAKE`, `VITE_E2E`, `E2E_INGEST_URL`, `E2E_SINK_PORT`, `NOMINATIM_STUB_PORT` | – | **mai** | – | solo nei test locali |

- Lette dal codice ma di sistema: `VERCEL_ENV`, `VERCEL_BRANCH_URL`,
  `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_GIT_COMMIT_REF` (Vercel),
  `CONVEX_CLOUD_URL`, `CONVEX_SITE_URL` (Convex).
- Non più lette, da togliere da Vercel quando si vuole (solo nomi):
  `UPSTASH_REDIS_REST_TOKEN`, `CHAT_RPM_PER_IP`, `CHAT_RPD_PER_IP`,
  `CHAT_RPD_GLOBAL`, `CHAT_LOG_TTL_DAYS`. `UPSTASH_REDIS_REST_URL` e
  `UPSTASH_REDIS_REST_TOKEN_RW` restano in fnox per lo script di migrazione
  fino alla chiusura di Upstash.

### Stato al 2026-10-22

- `gabrifila` è legato all'account Google di Gabri sul dev
  (`agile-leopard-908`); su `preview/multiutente` non ancora (serve un login
  Google lì, poi `admin:claimProfile`); in produzione si fa allo switch.
- `CHAT_SERVER_SECRET` è su Convex dev, nelle predefinite delle preview, su
  `preview/multiutente` e su Vercel Preview; `AUTH_DEV_OTP=1` su dev e
  preview.
- `GOOGLE_CLIENT_SECRET` è ancora quello esposto il 2026-10-21: va ruotato
  prima dello switch (`SWITCH.md`).
- Giro finale in locale (worktree `integrazione`, backend Convex locale):
  `pnpm build`, `bundle-guard` e Vitest (65 file, 686 test) verdi; `pnpm e2e`
  197 passati e 62 saltati, nessun fallimento, con le tre spec `@gemini` su
  Gemini vero; con `ORACOLO_FAKE=1` le 9 spec dell'Oracolo finto e dello
  stile (`oracolo`, `oracolo-scrittura`, `stile`) verdi. Dei saltati, su
  desktop resta solo il controllo degli header di `vercel.json` (solo sulla
  preview); gli altri sono le spec che girano una volta sola sul progetto
  desktop. Nuove: `e2e/fughe/osservabilita.spec.ts` (canarino in
  `#partenze`, errore nel browser ed eventi PostHog: niente canarino,
  coordinate, cookie o token nel sink) e `e2e/screenshot.spec.ts` (16 PNG in
  `e2e-shots/finale/`).

### Rischi residui

- **Sonde sui km con un token agente** (revisione dell'integrazione). La
  stima di prima ("l'arrotondamento al km intero limita la precisione a circa
  1 km") era ottimista. Per i viaggi brevi km ≈ round(1,45·d·j), quindi
  km = 0 vuol dire d < ~0,35 km. Chi ha un token agente (MCP, API key, o
  l'Oracolo in scrittura sotto prompt injection) può fare ~100 sonde all'ora
  (`search_venue` di un POI vicino alla casa ipotizzata → `add_venue` →
  `add_concert` dalla partenza → lettura del km → `delete_concert`) e
  restringere la casa a qualche centinaio di metri. **Decisione di Gabri
  (2026-10-22, confermata la sera per lo switch): si lascia così.** Conta di
  più che un agente compili un concerto con i km in un colpo solo che chiudere
  le sonde; il rischio resta accettato. Opzioni se si cambia idea:
  (a) coppie nuove di km solo dalla dashboard ("Calcola i km in attesa" in
  `#partenze`; gli agenti lasciano `kmPending`); (b) un tetto giornaliero di
  coppie nuove per partenza; (c) arrotondamento più grossolano (debole: il
  confine tra due valori localizza comunque la casa alla densità dei POI).
  Dal 2026-10-24 («Scheda dell'Oracolo») l'Oracolo in scrittura non ha più
  `add_concert` né `update_concert`: ogni sua scrittura di un concerto passa
  dalla scheda (e ogni import chiede l'approvazione), quindi ogni sonda
  dall'Oracolo, anche sotto prompt injection, vuole un Salva del
  proprietario. Restano senza clic le sonde da MCP e da API key.
- Il rischio "`add_venue` accetta un nome visualizzato" non vale più (venue,
  sopra). Una venue di ripiego sulla città si chiama liberamente, ma ha le
  coordinate del centro.
- Gli host dei loghi che si risolvono in IP privati non si controllano: il
  runtime Convex non risolve il DNS prima del fetch.

### Aperti

- Oracolo (corsia 6): i limiti non si restituiscono se Gemini fallisce dopo
  `beginTurn`; in scrittura `import_concerts` chiede sempre l'approvazione,
  anche sotto le 10 righe (`needsApproval` è booleano in TanStack AI 0.71);
  un'approvazione pendente in una chat di scrittura riaperta dallo storico non
  si può più dare (il messaggio dopo la chiude come "non eseguito").
- Pagine (corsia 4): i fasci decorativi (`.beam`/`.abeam`) restano ambra e
  teal anche con un accento personalizzato: decide Gabri.
- `e2e/parita.spec.ts`: `/dati` chiaro è fallito una volta dal lato di
  `main` (instabile, non riprodotto).
- UX dell'onboarding da migliorare (Gabri), fuori dalla Fase 3.
- `#agenti` offre ancora il modello CSV con le sole intestazioni, non i
  modelli d'esempio di `src/ui/ModelliImport.tsx`.
- Da verificare: Claude Code vero sul `/mcp` del dev (login, consenso, una
  lettura) e se riceve un `refresh_token` (col solo scope `concerti` del PRM
  niente `offline_access`: si ricollegherebbe ogni ora); `identify` di PostHog
  sulla preview; dopo qualche giorno, che i visitatori unici di PostHog non
  collassino in uno (IP attraverso il proxy); il glob `fase3/*` di
  `git.deploymentEnabled`; sulla preview, una `POST` da ~1 MB a
  `/api/auth/mcp/register` → 400 e una DCR normale → 201.

## Landing e accesso (corsia ux-accesso, 2026-10-23)

Rivede PIANO §1.39 e la riga «Landing `/`» del traguardo 3, e restringe la
deroga di PIANO §1.44 («OTP di sviluppo sulla preview», sopra).

- **Chi è entrato non vede la landing (decisione di Gabri).** Su `/` riceve un
  307 verso `/<handle>` se il profilo è `active` con `onboardingStep` `fatto`,
  altrimenti verso `/benvenuto`: anche un profilo `active` a metà dei passi
  2–4, che lì riprende. Il 308 di `/?chat=` vince comunque. Sta nel
  `beforeLoad` di `src/routes/index.tsx` (SSR e navigazioni del browser). Nei
  passi 2–4 il link «Puoi finire dopo: vai alla tua pagina» porta comunque
  alla pagina. Tolti «La tua pagina / Modifica» e «Riprendi la
  configurazione», ora irraggiungibili; anche il marchio «Concerti» che porta
  a `/` (`/accedi`, `/privacy`) rimanda così chi è entrato.
- Il 307 dipende dalla sessione ma non finisce in nessuna cache: le risposte
  SSR, redirect compresi, escono `private, no-store` (`withNoStore` in
  `src/server.ts`); lo controlla `e2e/landing.spec.ts`.
- **Landing.** Titolo «Tutti i tuoi concerti, in un solo posto.»; azione
  principale «Crea la tua pagina» (finestra con lo stesso titolo e
  `next=/benvenuto`; senza JavaScript `/accedi?next=%2Fbenvenuto`); per chi
  torna la riga «Hai già un account? Entra» (finestra «Entra», `next=/`), un
  link grigio come «Guarda un esempio»: l'ambra resta solo all'azione
  principale. Il prodotto si chiama «pagina», mai «sito» (decisione di Gabri);
  la nota della finestra dice «il tuo account nasce adesso».
- **«Entra con email» solo con un mittente vero.** `authFlags.get` dà anche
  `emailReale` (sender Resend); il pulsante compare solo con `emailReale` o
  nei build e2e (`VITE_E2E=1`, `src/accesso/flags.ts`), su `/accedi` e nella
  finestra della landing, quindi anche per `/autorizza`. Il plugin resta
  acceso col sender di sviluppo, ma quel codice non lo legge nessuna persona:
  su dev (`agile-leopard-908`) e su `preview/multiutente` dalla UI si entra
  solo con Google. La deroga di PIANO §1.44 copre ormai solo il login via API
  (`e2e/helpers/auth.ts`, smoke test con `POST /api/auth/email-otp/*` e
  `devOtp:latest`). I server locali dei worktree (niente Google, build non
  e2e) mostrano «L'accesso non è disponibile…»: lì si entra solo via API o
  negli e2e.
- `/benvenuto`, passo 2: un'azione principale per volta. Senza partenze è
  «Aggiungi» («Salta per ora» secondario), con l'indirizzo aperto sono i
  pulsanti dell'AddressPicker, poi «Avanti» (`avantiSecondario` di
  `Navigazione`, `src/benvenuto/comuni.tsx`).

## UX di /modifica (corsia ux-modifica, 2026-10-24)

Supera SPEC §3 («una pagina sola a sezioni con ancore… finestre modali»):
`/<handle>/modifica` è un'app di gestione (`src/modifica/Scheletro.tsx`).

- **Una vista alla volta, nell'hash** (`src/modifica/vista.ts`):
  `#<vista>[?k=v]` con le 9 viste di sempre. Senza hash, o con uno che non è
  una vista, si apre Concerti con «Da completare» in cima, senza una vista
  «Panoramica» (default, da confermare con Gabri). Nei parametri (`nuovo`,
  `apri`, `completa`, `filtro`, `con`, `indirizzo`, `parte`, `elimina`) solo
  token fissi e id opachi, mai nomi, testo cercato o indirizzi: gli URL
  arrivano a PostHog e Sentry. Lo stato della cronologia porta solo booleani e
  numeri (`mfPannello`, `mfOracolo`, `mfFoglio`, `mfApertura`). I link di
  prima (`#partenze`, `#account?elimina=1`, `#agenti`) valgono ancora; nessuna
  rotta nuova.
- **Le 9 `<section>` stanno sempre nell'HTML**, SSR compreso, nascoste: una
  vista si monta alla prima visita e poi resta montata (ricerca, filtri,
  scroll e modifiche in corso sopravvivono ai cambi di vista); `#partenze`
  solo se visitata.
- **Navigazione** (soglie in `src/modifica/layout.ts`): barra laterale a
  gruppi da 1280 px, riducibile a binario (scelta ricordata nel browser);
  binario da 768 px; sotto, barra in basso Concerti · Wishlist · Oracolo ·
  Attività · Altro (Wishlist e non Persone: default, da confermare con Gabri).
  Con l'Oracolo agganciato la barra diventa binario sotto i 1440 px, e sotto i
  1680 se accanto c'è anche un pannello aperto, così l'elenco resta leggibile
  (non è una scelta salvata). Segni per i concerti da completare, le partenze
  senza indirizzo e le novità degli agenti (`shell/distintivi.ts`).
- **Pannelli su `<dialog>` nativo** (`ui/Pannello.tsx`): da 1024 px non
  modali, accanto all'elenco che resta cliccabile; sotto, fogli modali (a
  tutto schermo sul telefono). Stanno nell'hash, quindi «indietro» li chiude,
  e una guardia sola, «Modifiche non salvate» (`useBlocker`), copre ✕, Esc,
  «Annulla», la navigazione, il gesto indietro e l'apertura di un'altra riga.
- **L'Oracolo in scrittura** è un solo `dialog#oracolo`
  (`oracolo/Contenitore.tsx`), mai smontato: agganciato a destra da 1024 px,
  foglio sotto. Alla prima visita è aperto solo da 1440 px, poi ricorda la
  scelta (default, da confermare con Gabri). Il pannello del concerto si apre
  accanto sul desktop, sopra sul telefono.
- **Il ponte dell'editor** (`useEditorConcerti().apri()`, `editor.tsx`): la
  scheda dell'Oracolo, la wishlist e «Duplica» aprono il pannello del concerto
  in `#concerti` con una bozza solo in memoria e aspettano l'esito (`salvato`,
  `usato`, `chiuso`). Il modo «scheda» non scrive niente e restituisce i
  valori («Usa nella scheda»). Un'apertura che porta valori rifà il pannello
  anche se è lo stesso (il numero `mfApertura` entra nella key; decide la
  guardia), e quella sostituita si chiude con `sostituito`. Un'apertura a
  mano (`apriPannello` senza numero, es. «Aggiungi un concerto» sopra il
  «Modulo completo») toglie `mfApertura`: il ponte chiude quella di prima
  («chiuso») e il pannello si rifà vuoto (integrazione, 2026-10-24).
- **Scritture** con `useScrittura` (`ui/Toast.tsx`): errori in linea, l'esito
  in una notifica (regione «Notifiche», una `role=status` per notifica, mai il
  focus). «Annulla» lo trova il browser confrontando `activity.list` prima e
  dopo (`annulla.ts`), senza modifiche al backend (default, da confermare con
  Gabri); mai «Annulla» per loghi, indirizzi, handle e import. Le
  cancellazioni tengono la finestra di conferma e hanno anche la notifica con
  «Annulla» (default, da confermare con Gabri). Accanto a un pannello non
  modale le notifiche non ne coprono il piede: stanno nella colonna
  dell'elenco se è larga almeno 280 px, altrimenti sopra il piede
  (`useRiparo`). Quando un'azione toglie il pulsante col focus («Annulla» →
  «Annullato.»: Chrome non manda blur) il focus va al titolo della vista e
  la notifica riprende il suo tempo, invece di restare ferma.
- **Testate.** Ogni vista ha la sua `IntestazioneVista` (h1 `#<id>-titolo`)
  con una sola azione piena (sul telefono il pulsante flottante di Concerti;
  senza concerti solo «Aggiungi il primo concerto»), le altre nel menu ⋯
  (`ui/Menu.tsx`, popover nativo); `/` porta alla ricerca della vista.
- **`#concerti` è un elenco di lavoro**: pastiglie dei filtri con i conteggi,
  anno, «Con X» (`?filtro=` e `?con=` fanno solo da semina), ordine,
  separatori per anno e «oggi», ⋯ per riga (Modifica, Duplica, Cancella…); le
  righe cambiate altrove lampeggiano. «Da completare» si riduce a una riga
  ricordata nel browser (3 voci sul telefono, 5 altrove) e ha «Completa in
  sequenza» (`?apri=<id>&completa=1`): il focus parte dal primo campo che
  manca, poi «Salva e vai al prossimo».
- **Il form del concerto** sta in `ConcertoPannello.tsx` (apertura,
  salvataggio, coda, concorrenza) e `ConcertoForm.tsx` (parti e campi), coi
  campi condivisi in `campiConcerto.tsx`; `ConcertoModale.tsx` non c'è più. A
  parti con i salti in testa; voto, posizione e canzoni note a pastiglie
  (radio con i `name` di sempre, Transenna per prima); «Com'è andata» chiusa
  per una serata in programma; riepilogo degli errori ed errori del server sul
  loro campo; la partenza non si precompila mai (c'è la scorciatoia «Come
  l'ultimo»); concerto ↔ festival solo in un form nuovo, portando anche voto,
  posizione e canzoni note. Se la riga cambia altrove: form pulito → si
  ricarica, con modifiche → un avviso.
- **Elenchi corti.** In cima l'aggiunta rapida (l'azione principale; un nome
  già usato è un errore mentre si scrive). Persone ha ricerca, «Mai in un
  concerto», ordine e il pannello della persona (`?apri=`); Wishlist ha ↑ ↓ e
  «L'ho visto: aggiungi il concerto», che poi offre «Togli X dalla wishlist»;
  Partenze e Regalato da sono carte (`.mf-carta`: `.mf-scheda` è la barra del
  telefono). La finestra dell'indirizzo si apre da `#partenze?indirizzo=<id>`
  (ci portano l'avviso dei km, il form e la notifica); il logo di un "regalato
  da" si cambia solo dal suo pannello.
- **Impostazioni e registro.** Stile (1080 px, anteprima ferma accanto al
  tema), Agenti e Account (760 px) sono schede con un titolo h2
  (`TestaImpostazione`) e barre di salvataggio (`SalvaBarra`) attive solo con
  modifiche; con modifiche non salvate chiede solo lasciando /modifica e dice
  dove (`useGuardiaImpostazioni`), non cambiando vista. `#agenti?parte=import`
  porta all'import col focus sul file. Attività filtra nel browser per autore,
  «Solo annullabili» e testo (`sezioni/registro.ts`), raggruppa per giorno e
  segna «nuova» le voci dell'Oracolo e degli agenti arrivate dopo l'ultima
  visita.
- **Accessibilità** controllata da `e2e/modifica-accessibilita.spec.ts`
  (helper `e2e/helpers/accessibilita.ts`, senza axe-core): contrasto calcolato
  su ogni superficie (4,5:1, 3:1 per i segni), focus visibile con Tab,
  tastiera tra pannello e Oracolo, titoli e nomi, bersagli da 44 px con le
  dita. Dentro `.mf-app` i testi secondari usano `--mf-tenue` (un `--muted`
  più deciso), in chiaro `--mf-ambra-testo` e `--mf-teal-testo` sono più scuri
  e le stelle usano `--mf-ambra-segno`; `--dim` solo per i controlli spenti;
  con le dita campi a 16 px (niente zoom su iOS). «Vai al contenuto» arriva
  dopo i comandi dello Shell: per metterlo primo va toccato
  `src/shell/Shell.tsx`. Restano a mano VoiceOver, TalkBack, NVDA e un
  telefono vero.

## Scheda dell'Oracolo (corsia ux-agente, 2026-10-24)

- **Concerti solo dalla scheda.** Nell'Oracolo in scrittura concerti e
  festival passano solo da `propose_concert`
  (`src/server/oracolo/proposta.ts`), strumento solo dell'Oracolo, fuori dal
  catalogo e da MCP; `add_concert` e `update_concert` escono dai suoi
  strumenti (`SOSTITUITE_DALLA_SCHEDA` in `scrittura.ts`) e restano per MCP e
  API, con input e output invariati. Vale anche per un campo solo (default, da
  confermare con Gabri).
- **Approvazione.** La chiamata ferma il run (`needsApproval`) e non scrive
  niente; la chat la mostra come scheda modificabile (`src/modifica/scheda/`:
  `bozza.ts` puro, `store.ts` in memoria per `toolCallId`). Salva risolve
  l'approvazione con `{approved: true, editedArgs}` dopo la stessa validazione
  del server (`propostaConcertoInput` e `daProposta` di
  `shared/schema/proposta.ts` girano in tutti e due). Scarta, e il testo
  scritto con una scheda aperta, la rifiutano col payload tipizzato `{motivo,
  nota?, bozza?}` in una sola ripresa; una correzione nella chat non cancella
  una Conferma o un Rifiuta già dati a un'altra approvazione dello stesso run.
- **`oracoloOnly`**, terza classe di builder (`convex/lib/builders.ts`)
  accanto a `catalogOp` e `dashboardOnly`: oggi solo `entries.salvaScheda`,
  che accetta solo `as: "oracolo"`; dashboard, API key e OAuth ricevono
  `solo_oracolo`. È un'etichetta che restringe, non un confine di fiducia: la
  sessione del proprietario può mandare `as: "oracolo"` e fare una per una le
  stesse scritture (default, da confermare con Gabri).
- **Un lotto, un Annulla.** `salvaScheda` crea nella stessa transazione e
  nello stesso lotto le persone, il "regalato da" e la partenza che mancano
  (`convex/lib/mancanti.ts`), poi aggiunge o modifica il concerto con i km
  subito (A1, «Sonde sui km»). La partenza nuova ha solo il nome
  (`creaPartenzaNelLotto` in `convex/departures.ts` rifiuta i nomi che
  sembrano indirizzi): i km restano in attesa finché l'indirizzo non si
  imposta in `#partenze` (default, da confermare con Gabri). L'Annulla della
  scheda (`activity.undo`) toglie tutto il lotto; se un nome creato è già
  usato da un altro concerto è rifiutato (`in_uso`), e la scheda dice quale
  nome e che va tolto prima da lì (default, da confermare con Gabri). Il
  default diceva «rimanda ad Attività», ma il lotto si annulla tutto o
  niente e Attività dà lo stesso `in_uso`: il rimando c'è solo per
  `conflitto` (modificato dopo), dove Attività serve davvero (integrazione,
  2026-10-24). In Attività l'autore è «Oracolo» anche
  se il proprietario ha cambiato la scheda prima di salvare (default, da
  confermare con Gabri).
- **Schema statico.** `propostaConcertoInput` è piatto e statico (niente
  union né literal, nessun enum preso dal vocabolario): TanStack AI confronta
  l'hash dello schema alla ripresa, quindi cambiarlo, descrizioni comprese, fa
  scadere le schede aperte durante un deploy.
- **Limiti della route in scrittura** (`LIMITI_SCRITTURA`,
  `src/server/oracolo/scrittura.ts`): testo dell'utente 4000 caratteri, per
  incollare un biglietto, solo testo e niente immagini (default, da confermare
  con Gabri); payload della ripresa 16000; cronologia del browser 80 messaggi
  come lo storico salvato (`MAX_MESSAGGI_STORICO`: con 40 una sessione di
  completamenti si fermava dopo 7–8 schede). A chiudere restano lo storico di
  Convex (80 messaggi, 160k caratteri) e il tetto sul corpo (80k).
  «Conversazione troppo lunga» risponde 413, e chat e scheda offrono «Apri una
  nuova chat». La chat pubblica resta a 1500/2000/40 e risponde 400 (il widget
  mostra l'errore generico: possibile seguito).
- **Prompt in scrittura**: oggi col giorno della settimana più i 7 giorni
  prima e dopo (`calendarioAttorno`), così «sabato» si legge invece di
  contarlo. «Prezzo» conta come mancante nella scheda e nelle domande
  dell'Oracolo (`mancanoDi` con `prezzo: true`, `shared/lib/mancano.ts`), non
  nel riquadro «Da completare» (default, da confermare con Gabri).
- **Lotti di schede.** Più serate nello stesso messaggio danno più schede,
  ognuna con la casella «Da salvare», e decide la barra in fondo alla chat
  (`src/modifica/scheda/BarraSchede.tsx`, da non confondere con
  `shell/BarraSchede.tsx`): «Salva tutte» / «Scarta tutte» in una sola ripresa
  (TanStack riprende solo quando ogni approvazione del run è decisa), poi
  «Annulla tutti» dall'ultima alla prima. Una scheda sola con un'altra
  approvazione nello stesso run dice che si salva quando si risponde
  all'altra.
- **Doppioni**: lo stesso artista lo stesso giorno, in archivio o in un'altra
  scheda del run, blocca con «Aggiorna quello» (la scheda diventa la modifica
  di quello) o «È un altro concerto»; a un giorno di distanza è un avviso con
  «Apri quello». Una venue senza città con più omonime nel catalogo si sceglie
  («Usa»), mai a caso.
- **Festival**: la lineup si modifica nella scheda (↑ ↓ solo nelle nuove, ×
  spento a due concerti); i concerti che una modifica toglie
  (`remove_concerts`) si confermano uno per uno («Tienilo» / «Toglilo»). Con
  lo stesso artista in due giorni `daProposta` toglie prima un concerto non
  nominato in `concerts`, e la scheda nomina quello che resta. «Modulo
  completo» apre il form nel modo «scheda» del ponte dell'editor (nessuna
  scrittura, «Usa nella scheda» riporta i valori).
- **Modulo completo aperto** (integrazione, 2026-10-24): da 1024 px è un
  pannello non modale accanto all'Oracolo (la spec agente lo voleva modale
  sopra la chat), quindi finché è aperto la scheda non si decide: Salva,
  Scarta, «Salva tutte» / «Scarta tutte» sono spenti con «Il modulo
  completo è aperto: prima «Usa nella scheda» o «Torna alla scheda»», e un
  messaggio nella chat (la correzione) è rifiutato con lo stesso invito.
  Lo segna `moduloAperto` nello store, per apertura. «Nuova chat» chiede
  prima anche in quel caso; se i valori arrivano a scheda già chiusa, una
  notifica dice che non sono stati usati. Alla chiusura il focus torna al
  link della scheda solo se si era perso: una riga dell'elenco, un'altra
  vista o un'altra scheda lo tengono.
- **Nella chat** le schede stanno dopo la risposta del modello che le segue
  (la conferma, poi «Annullato», chiude il turno); il piede col Salva resta
  appiccicato in vista anche sul desktop (non in un lotto); un'azione che
  toglie il pulsante premuto riporta il focus nella scheda
  (`src/modifica/scheda/focus.ts`); «Nuova chat» con una scheda modificata
  chiede prima («Scheda non salvata»). Uscire da /modifica (Sul palco, I
  dati, indietro, chiudere la scheda del browser) con una scheda modificata
  e non salvata chiede «Modifiche non salvate» e la nomina (`GuardiaSchede`
  in `oracolo/Contenitore.tsx`, useBlocker solo sul cambio di pathname):
  la chat non sopravvive all'uscita, e prima si perdeva in silenzio.
  Cambiare vista dentro /modifica non chiede. Con anche un pannello sporco
  le due guardie chiedono una dopo l'altra. Il CSS della scheda sta in
  `src/modifica/oracolo/chat.css`, non in `modifica.css`.
- **Invio nelle due chat** (`tastiInvio` in `src/chat/parti.tsx`): Invio
  manda, ⇧/⌥/⌘/Ctrl+Invio va a capo, e durante la composizione IME
  (`componendo`, anche il keyCode 229 di Safari) non manda. Con la sola
  tastiera a schermo (`(hover: none) and (pointer: coarse)`) Invio va a capo e
  si manda col pulsante. **Aperta per Gabri**, che aveva chiesto «se premo
  invio dovrebbe mandare»: resta così finché non risponde; per cambiarlo si
  toglie il ramo `soloTouch` e si mette `enterKeyHint="send"` alle due
  caselle.
- Prove: `ORACOLO_FAKE=1 node scripts/wt.mjs exec -- pnpm e2e
  e2e/oracolo-scheda.spec.ts`; in `e2e/fughe/oracolo.spec.ts` una scheda
  salvata dalla partenza col canarino (km subito) non porta canarino né
  coordinate in SSE, riprese, `chat:myThread`, pagina, frame WebSocket e log.
  `devtools:cleanupE2E` toglie al massimo 40 profili `e2e-*` per chiamata
  (restituisce quanti): con molti profili di prova si richiama.
- **Da allineare** (revisione dell'integrazione, 2026-10-24; decide Gabri):
  - «Nuova persona» nel pannello del concerto crea la persona subito
    (`people.add`, una voce sua in Attività), mentre la scheda la crea nel
    lotto del concerto. Così l'«Annulla» della notifica del pannello toglie
    solo il concerto, quello della scheda anche la persona. Per allinearli
    servirebbe creare i nomi mancanti nella stessa transazione di
    `entries.add`/`update` (come `convex/lib/mancanti.ts`), che però sono
    anche `add_concert`/`update_concert` di MCP, dove un nome sconosciuto
    è un errore.
  - Le parole del pannello e della scheda non coincidono: «Con chi» /
    «Con», «Partito da» / «Partenza», «Non ancora» / «Nessuna»,
    «Transenna» / «6 · Transenna», il segno «nuova», e «Mancano» (nel
    pannello per parte e senza prezzo, nella scheda in un elenco solo col
    prezzo). Le due spec le fissano ciascuna a modo suo, e i titoli delle
    differenze («Con», «Partenza») vengono dal server
    (`shared/schema/proposta.ts`): va scelto un vocabolario solo.
