# Decisioni prese durante il setup

Scelte fatte con Gabri durante la Fase 1 (setup esterno) dove SPEC.md non
bastava o andava adattato. Valgono come SPEC.md: se le due cose divergono,
vince la decisione più recente qui sotto.

## Ambienti e URL

| Ambiente | App | Convex |
|---|---|---|
| dev (t3node) | `https://t3node.tail4a8e3b.ts.net:8444` (porta 3100; anche `http://localhost:3100`) | `agile-leopard-908` (EU) |
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
    previsto `Concerti <notifications@concerti.gabrifila.me>`).
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
| `CHAT_SERVER_SECRET` | come `CHAT_SERVER_SECRET` (dev) / `…_PREVIEW` | Preview (sensitive); Production allo switch | dev, default preview, `preview/multiutente`; prod allo switch |
| `AUTH_DEV_OTP=1` | – | – | dev, default preview, `preview/multiutente`; **mai** prod |

## Da fare allo switch (oltre alla checklist di SPEC.md)

- Vercel: togliere l'Ignored Build Step che blocca i build di produzione,
  poi aggiungere il dominio `concerti.gabrifila.me`.
- Convex prod: `SITE_URL=https://concerti.gabrifila.me`; trusted origins già
  pronte.
- Google Auth Platform → Branding: home page e privacy puntano già a
  `concerti.gabrifila.me` (`/privacy` deve esistere).
- `CHAT_SERVER_SECRET` di produzione: generarlo in fnox (profilo `prod`) e
  metterlo su Convex prod e su Vercel Production.
- Resend (se si libera uno slot): dominio `concerti.gabrifila.me` in EU,
  `RESEND_API_KEY` + `EMAIL_FROM` su Convex prod.

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
- **Rischi residui, accettati per ora:**
  - `add_venue` accetta ancora un nome visualizzato: un utente può dare un nome
    a un POI reale (con coordinate vere di OpenStreetMap);
  - chi ha un token agente può aggiungere concerti in posti reali vicini a una
    casa ipotizzata e leggere i km con lo scarto; l'arrotondamento al km
    intero limita la precisione a circa 1 km sulle distanze brevi.
- **Ondata unica:** dopo il traguardo 2, le corsie 3, 4, 8, 5, 7, 6 e lo script
  di migrazione partono insieme, con i contratti di
  `docs/multiutente/CONTRATTI-ONDATA.md`; le spec con sessione (`@sessione`)
  girano all'integrazione.
