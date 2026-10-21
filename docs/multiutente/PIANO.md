# Fase 3: piano a traguardi

Questo piano va approvato prima di eseguirlo (PROMPT.md, Fase 3).

- **Base:** branch `multiutente` @ `9aa8d5f`, 2026-10-21.
- **Documenti vincolanti:**
  - `SPEC.md`;
  - `DECISIONI.md`, che vince su SPEC dove i due divergono;
  - `PROMPT.md`;
  - `CLAUDE.md`.
- **Scelte proprie del piano:** stanno in §1.
  - Quelle che toccano il prodotto compaiono anche tra le domande di §12.
  - Quelle che derogano a un documento vincolante (§1.43–1.45) vanno scritte in `DECISIONI.md` al traguardo 9.

## 0. In breve

| Ordine | Traguardo | Esecuzione | Dipende da | Merge | Risultato |
|---|---|---|---|---|---|
| 1 | **T1** Start su Vercel, a parità | sequenziale, 1 agente | – | diretto | `/gabrifila` in SSR, identico a `main` |
| 2 | **T2** Convex, schema Zod, scheletro condiviso | sequenziale, 1 agente | T1 | diretto | dati da Convex dal vivo, Oracolo su Convex, contratti congelati |
| 3 | **Ondata A**: T3 auth e onboarding, T4 pagine pubbliche, T8 osservabilità | 3 corsie | T2. T4 e T8 si ribasano dopo il merge di T3, prima delle spec con sessione | 3 → 4 → 8 | login, `/benvenuto`, pagine per profilo, Sentry e PostHog |
| 4 | **Ondata B**: T5 `/modifica`, T7 MCP/API, T6 Oracolo | 3 corsie | T3 (sessione), T2 (catalogo) | 5 → 7 → 6 | dashboard, agenti, Oracolo per pagina |
| 5 | **T9** migrazione (dry-run), documenti, giro finale | 1 agente più l'orchestratore | tutti | diretto | riepilogo, giro completo sulla preview, `SWITCH.md` |

- **Commit:** nove su `multiutente`, uno per traguardo. Ogni commit ha verdi `pnpm build`, `pnpm vitest run` e le spec Playwright del suo traguardo.
- **Prima di ogni merge:** integrazione sul branch `integrazione` (§4.6), poi revisione avversariale bloccante (§4.7).
- **Isolamento:**
  - ogni corsia ha un proprio worktree, un proprio deployment Convex **locale** e un proprio URL portless;
  - sul dev condiviso `agile-leopard-908` lavora solo l'orchestratore;
  - nessun agente tocca la produzione (§4.2).
- **Push:**
  - `multiutente` si pusha dopo ogni traguardo integrato: così la preview valida subito Start e Nitro;
  - i branch `fase3/*` si pushano ogni sera, ma Vercel non li builda (§1.18);
  - niente push su `main`, niente produzione.
- **Risorse:** nessun tetto fisso al numero di agenti (tolto da Gabri il 2026-10-21). Build, e2e e vitest passano da lock, con una soglia di memoria libera, perché la macchina resta da 4 vCPU e 12 GB (§4.4).
- **Cosa serve da Gabri:** §12.

## 1. Scelte fissate dal piano

### Stack e infrastruttura

1. **Better Auth bloccato a 1.6.33.**
   - `@convex-dev/better-auth` 0.12.5 accetta solo `better-auth >=1.6.11 <1.7`, mentre `latest` è già 1.7.12. Lo fissiamo con un override pnpm; la CLI di schema è `auth@1.6.33`.
   - Il componente è installato in **locale** (`convex/betterAuth/`) da subito: serve per `apiKey`.
   - MCP usa il plugin `mcp()` di 1.6, irrobustito: consenso sempre forzato, `/mcp/get-session` disattivato, metadati corretti.
   - Niente `@better-auth/oauth-provider`: con `convex()` è rotto (issue #395 e #399).
   - `@better-auth/mcp` esiste solo per 1.7: si rivaluta quando l'adapter supporterà 1.7.
2. **SDK MCP:** `@modelcontextprotocol/server` 2.3.1, stateless, con `legacy: 'stateless'` per i client 2025.
   - All'inizio del traguardo 7 c'è uno spike con Claude Code.
   - Fallback: `@modelcontextprotocol/sdk` 1.32.1 (`WebStandardStreamableHTTPServerTransport`).
3. **Data e ora.**
   - `now` si cattura una volta sola nel loader di root e viene serializzato verso il client.
   - "Oggi" si calcola sempre in `Europe/Rome` con `Intl`, sul server (Vercel gira in UTC) e nel browser.
   - `E2E_NOW` vale solo con `E2E=1` e fuori da Vercel.
4. **Tema del visitatore.**
   - Sta nel cookie `tema` (`dark|light|system`). Senza cookie vale `dark`.
   - `data-theme` è già nell'HTML SSR. Solo `system` usa un `ScriptOnce` di tre righe con `matchMedia`.
   - Al primo caricamento si migra una tantum da `localStorage.theme`.
   - Lo strumento client dell'Oracolo che oggi si chiama `set_theme` (`src/chat/tools.ts`) diventa `set_visitor_theme` e scrive il cookie `tema`. Il nome `set_theme` resta allo strumento del catalogo (SPEC §4), che cambia lo stile della pagina del proprietario.
5. **Client Convex.**
   - `expectAuth` è `true` solo se l'SSR ha visto una sessione (`<html data-auth="1">`). Con `true` fisso, il WebSocket dei visitatori anonimi resterebbe in pausa.
   - Dopo login e logout si fa un reload completo.
6. **URL Convex sul server.** Si leggono `import.meta.env.VITE_CONVEX_URL` e `VITE_CONVEX_SITE_URL`, inseriti nel codice al build: a runtime su Vercel `process.env` non li contiene.
7. **Client per richiesta e cache HTTP.**
   - `QueryClient`, `ConvexQueryClient` e `ConvexHttpClient` nascono dentro `getRouter()`, uno per richiesta, mai a livello di modulo. Su Vercel Fluid le richieste concorrenti condividono l'istanza: un client di modulo con `setAuth(token)` metterebbe i dati `me.*` di A nell'HTML di B. Un test lo verifica.
   - Tutte le risposte HTML e delle server function hanno `Cache-Control: private, no-store`. `s-maxage` vale solo per `/og`.
8. **Origini per ambiente.** Allowlist di Origin, origine canonica, metadati OG e MCP si ricavano da `VERCEL_ENV`, mai dall'header `Host`:

   | Ambiente | Origini ammesse |
   |---|---|
   | produzione | `concerti.gabrifila.me`, `concerti-gabri.vercel.app` |
   | preview | `https://${VERCEL_BRANCH_URL}` |
   | fuori da Vercel | `localhost:3100`, URL tailnet, jolly `*.concerti-gabri.localhost:1355` |

   L'origine canonica coincide con `SITE_URL` del deployment Convex, cioè con il `baseURL` di Better Auth.
9. **Header di sicurezza e CSRF.**
   - **In `vercel.json`:**
     - HSTS;
     - `X-Content-Type-Options: nosniff`;
     - `Referrer-Policy: strict-origin-when-cross-origin`. Mai `no-referrer`/`same-origin`, che romperebbero la restrizione del token Mapbox;
     - `X-Frame-Options: DENY`, più una CSP con il solo `frame-ancestors 'none'`;
     - `Permissions-Policy`.
   - **Niente `script-src`** in Fase 3: romperebbe l'idratazione inline, `ScriptOnce` e JSON-LD.
   - **CSRF:** `src/start.ts` nasce nel traguardo 2 con `createCsrfMiddleware({ filter: ctx => ctx.handlerType === 'serverFn' })`. Appena `start.ts` esiste, Start non installa più la protezione predefinita. Il traguardo 8 aggiunge solo Sentry in testa.
10. **File generati committati:** `src/routeTree.gen.ts` e `convex/_generated/`. Lo script di build diventa `vite build && tsc -b`.
11. **Funzioni Vercel in `dub1`.** Convex EU sta a Dublino; con `iad1` ogni SSR attraverserebbe l'Atlantico.
12. **Sentry v11.** `sendDefaultPii` non esiste più e i default raccolgono molto, compresi input e output di `@google/genai`, che Sentry strumenta da solo. Sul client e sul server si scrive esplicitamente:
    ```ts
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, stackFrameVariables: false,
      genAI: { inputs: false, outputs: false }, databaseQueryData: false,
    }
    ```
    Inoltre:
    - niente replay, feedback o tracing;
    - `beforeSend` toglie la query string dagli URL sotto `/autorizza`, `/accedi` e `/api/auth`, che contengono `consent_code`, `code`, `state` e `next`.
13. **PostHog.**
    - `/ingest` è un proxy fatto con le `routeRules` di Nitro: in dev funziona, su Vercel diventa una rewrite CDN. Non si usa `server.proxy` di Vite.
    - `cookieless_mode: 'always'`, autocapture spento, `capture_pageview: 'history_change'`, così c'è un pageview per ogni navigazione del router.
    - `before_send` toglie la query string da `$current_url` e `$referrer` sugli stessi percorsi di Sentry.
14. **Dati statici e Oracolo su Convex dal traguardo 2.**
    - `src/data.ts` diventa `shared/seed/gabrifila.ts`: è il seed e la fixture dei test di parità.
    - Dal traguardo 2 nessun file sotto `src/` lo importa, e un test lo verifica.
    - Nello stesso traguardo `src/server/oracolo/` legge `pages.byHandle({handle:'gabrifila'})` con `ConvexHttpClient` e costruisce vocabolari e `query_concerts` con `pageToDataset`.
    - Il traguardo 6 aggiunge solo la parte per handle.
15. **Scomposizione di `App.tsx`: eccezione motivata** a "no blanket refactors" di CLAUDE.md.
    - È necessaria: l'SSR ha bisogno di moduli senza stato globale e i dati per profilo sostituiscono le oltre 15 derivazioni a livello di modulo di `ALLDATA`.
    - Si fanno solo spostamenti di file e l'iniezione di `ProfileContext`/`now`.
    - Si stringono i tipi solo dove il compilatore lo chiede.
    - Ogni passo passa dagli screenshot di parità.
16. **Segreti generati dagli agenti.** Su t3node Gabri esegue solo `fnox set`. I segreti generabili li genera l'agente: `CHAT_SERVER_SECRET`, il `BETTER_AUTH_SECRET` dei deployment locali, l'eventuale JWKS statico.
    - Li salva con `fnox set --from-file` e verifica che il valore ci sia (nota in memoria).
    - Li porta su Vercel e su Convex per riferimento, senza mai stamparli.
17. **Ciclo di vita del deployment `preview/multiutente`.**
    - Il `buildCommand` di `vercel.json` diventa:
      ```
      pnpm exec convex deploy --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL --preview-run seed:ensure
      ```
      - Verificato nel sorgente della CLI 1.47: `--preview-run` gira solo quando il deployment di preview è **nuovo**, con la chiave admin, e in produzione viene ignorato. Che accetti una funzione `internal` va confermato con uno spike (§9).
      - Il deployment esiste già, quindi la prima volta l'orchestratore lo semina a mano con `convex run --deployment preview/multiutente seed:ensure`. In 1.47 `--preview-name` non esiste per `run`.
    - `AUTH_DEV_OTP` e `CHAT_SERVER_SECRET` vanno anche nelle **variabili predefinite delle preview** del progetto Convex. `SITE_URL`, le trusted origins e i segreti di Better Auth ci sono già (DECISIONI). Se Convex ricrea la preview, per esempio dopo il periodo di conservazione (da verificare: circa 5 giorni su Starter, 14 su Pro), env e seed tornano da soli; va rifatto solo il claim.
    - Dopo ogni push, `node scripts/check-setup.mjs --preview` controlla:
      - che il deployment esista;
      - i nomi delle variabili;
      - il seed (`pages.byHandle('gabrifila')` non nullo).

      Le variabili mancanti le rimette per riferimento.
    - **Schema:** durante la Fase 3 i cambi sono solo additivi (campi opzionali, tabelle nuove). Se un cambio rompe i dati esistenti su dev, preview o locali:
      1. `devtools:reset` (§5.2) svuota le tabelle dell'app e lascia gli utenti Better Auth;
      2. poi `seed:ensure`;
      3. poi di nuovo il claim.
18. **Branch di corsia non buildati.** `vercel.json` riceve `"git": {"deploymentEnabled": {"fase3/*": false, "integrazione": false}}`.
    - Così i branch di corsia si possono pushare ogni sera, come vuole la regola globale delle 23:00, senza preview Vercel e senza deployment Convex.
    - Al traguardo 1 si verifica che Vercel accetti il glob (§9).

### Dati, privacy e sicurezza

19. **Stato del profilo e onboarding.**
    - Il primo login crea il profilo in `status: "onboarding"`, senza handle.
    - `profiles.completeOnboarding`, cioè il passo 1 (handle, forma, nome visualizzato), imposta `status: "active"` e `onboardingStep: "partenze"`. I passi 2–4 avanzano con `profiles.setOnboardingStep` (`partenze` → `agente` → `regali` → `fatto`).
    - `requireOwner` dà `no_profile` (fix `/benvenuto`) solo se lo stato è `onboarding`. Un profilo `active` scrive con qualunque `onboardingStep`, quindi partenze, import e "regalato da" funzionano durante l'onboarding.
    - `pages.byHandle` restituisce `null` per i profili non `active`. La pagina esiste quindi dalla fine del passo 1 e al passo 3 si riempie dal vivo.
20. **Handle, alias e `gabrifila`.**
    - Un handle rinominato finisce in `handleAliases`, con redirect 301, e resta riservato finché il profilo esiste. L'eliminazione dell'account cancella anche gli alias.
    - `profiles.handleAvailable` e `completeOnboarding` controllano tre cose: `profiles`, `handleAliases` e l'elenco riservato.
    - `gabrifila` è nell'elenco riservato: solo il seed lo scavalca. Nessuno può prenderlo in produzione prima del seed.
21. **Riferimenti tra dati.**
    - Nel DB persone, partenze, venue e "regalato da" sono id, quindi rinominare non rompe niente.
    - Gli input esterni (MCP, import, Oracolo) usano i nomi, tradotti da un unico `resolveRefs` lato server.
    - Un nome sconosciuto dà un errore con l'elenco dei nomi validi.
22. **Km e `kmPairs`.**
    - Il km di una coppia (partenza, venue) si estrae **una volta sola**, con `crypto.getRandomValues`, e si salva nella tabella privata `kmPairs`. Da lì si riusa per sempre, anche quando non resta nessun concerto con quella coppia.
    - Così cancellare e riaggiungere un concerto, o fare Annulla e Rifai, dà sempre lo stesso km. Né un visitatore iscritto agli aggiornamenti, né chi ha un token agente può accumulare estrazioni e mediare via il jitter.
    - Solo la correzione di un indirizzo estrae di nuovo (SPEC). È limitata a una al giorno per partenza, con un avviso in `#partenze`.
    - Le coordinate delle venue sono immutabili: non esiste un modo per modificarle, e una venue non fa mai ricalcolare i km.
    - Il seed riempie `kmPairs` con i km legacy. Una coppia legacy si riusa anche senza indirizzo.
23. **Geocoding con Nominatim** (DECISIONI).
    - Coda globale col rate limiter Convex: 1 richiesta al secondo, con `reserve`. In più ci sono limiti per profilo e per attore (§5.8).
    - Lo User-Agent identifica l'app; la cache condivisa vale solo per le venue.
    - **Partenze:** non passano mai dalla cache condivisa né dai log. I candidati restano nella tabella privata `geocodeDrafts` e il proprietario sceglie per indice. Le coordinate non arrivano mai a un browser.
    - **Venue:** si cerca con `layer=poi`. I risultati con `addresstype`/`class` `house`, `building`, `road` o `residential` si scartano. Se manca un POI, la venue prende le coordinate della città (`featureType=city`), mai quelle di una via.
    - **Cache delle venue:** la chiave è lo SHA-256 della query normalizzata e si salvano solo risultati POI.
24. **Tabelle private.**
    - `departureSecrets`, `geocodeDrafts` e `kmPairs` compaiono solo in `convex/departures.ts` e `convex/lib/km.ts`.
    - `geo.ts`, `account.ts` e i cron ci arrivano tramite funzioni `internal` di `departures.ts`.
    - Job programmati e action ricevono solo id: mai `lng`, `lat` o `address` negli argomenti di `scheduler.runAfter`/`runAt`, che finirebbero in `_scheduled_functions`.
25. **Argomenti, segreti ed errori Convex.** Un errore di validazione degli argomenti Convex ripete l'oggetto ricevuto, che finisce nei log, al chiamante e da lì in Sentry e nelle risposte MCP. Quindi:
    - `CHAT_SERVER_SECRET` non è mai un argomento. La route Start lo manda come `Authorization: Bearer` a un'`httpAction` (`/oracolo/turno`, `/oracolo/trascrizione`), che lo confronta a tempo costante.
    - I builder del proprietario dichiarano gli argomenti in modo largo e li validano con Zod dentro l'handler, dopo aver risolto l'attore. Valgono per `agentToken`, `as`, l'input e l'indirizzo come `v.string()`. Gli errori (`input_non_valido`, con percorso e messaggio) non ripetono mai i valori.
    - Le route `/mcp` e `/api/chat` traducono ogni errore Convex in `{code, messaggio}` prima di rilanciarlo o di mandarlo a Sentry.
    - `shared/scrub.ts` oscura `cgk_…`, i token opachi tipo bearer e, lato server, i valori in memoria dei segreti server.
26. **Storico dell'Oracolo.**
    - La tabella `chatThreads` è nello schema del traguardo 2; le funzioni arrivano nel traguardo 6.
    - `threadId`, titolo e autore si conservano, quindi i vecchi link `/?chat=<id>` funzionano.
    - **Chiave di scrittura:** si salva come SHA-256 ed è **facoltativa**. Un thread senza chiave, come i legacy di Upstash, viene rivendicato dal primo turno che ne porta una, come fa oggi `isThreadWritable`.
    - `beginTurn` rifiuta un `threadId` che appartiene a un altro profilo.
    - **IP:** si salva come HMAC-SHA-256 con una chiave derivata via HKDF da `CHAT_SERVER_SECRET` (`info: "concerti/ip"`), calcolata nella route Start. Nessuna variabile nuova; la migrazione scarta gli IP vecchi.
    - Il namespace `preview:` sparisce: ogni deployment Convex è già un database separato.
27. **Oracolo in modalità scrittura** (`/modifica`).
    - Gli strumenti di scrittura chiamano Convex con la sessione del proprietario più `as: "oracolo"`. È un argomento che può solo declassare: non serve un segreto, imposta `actor.via = "oracolo"` e fa rifiutare le funzioni `dashboardOnly`. Nel registro l'autore è quindi "Oracolo".
    - `web_search` è spento in scrittura, perché i risultati di Google potrebbero iniettare chiamate di scrittura.
    - L'header Origin è obbligatorio e deve essere della stessa origine.
    - I thread sono `visibility: "proprietario"`: li legge solo il proprietario in `/modifica` e non compaiono mai in `listThreads`/`getThread` né nell'SSR pubblico (domanda 7 di §12).
28. **OTP di sviluppo e mittente Resend.**
    - **Sender di sviluppo:** il codice finisce nella tabella interna `devOtpOutbox`. È attivo solo con `AUTH_DEV_OTP=1` e se `CONVEX_CLOUD_URL` non è quello di `brave-chickadee-534`. Lo leggono il login della CLI sul team e le deploy key, cioè solo le macchine di Gabri.
    - **Resend:** `convex/email.ts` chiama Resend via `fetch`, con un modello in italiano. `EMAIL_FROM` vale per default `Concerti <notifications@concerti.gabrifila.me>`.
    - **Precedenza:** fuori produzione, con `AUTH_DEV_OTP=1`, vince il sender di sviluppo e non parte nessuna email. Altrimenti si usa Resend, se ci sono `RESEND_API_KEY` ed `EMAIL_FROM`. In produzione `AUTH_DEV_OTP` viene rifiutato.
    - `authFlags.emailLogin` è vero solo se uno dei due sender è attivo. Per attivare Resend più avanti basta impostare le due variabili su Convex (DECISIONI).
29. **Better Auth irrobustito.**
    - `baseURL: process.env.SITE_URL` esplicito; mai base URL dinamici o ricavati dagli header forwarded.
    - I limiti per IP interni non sono affidabili: le `httpAction` non hanno l'IP del socket, quindi con XFF ignorato sarebbero globali e con XFF fidato si falsificherebbero via `*.convex.site`. Si usano limiti Convex per email e globali dentro le callback (§5.8).
    - `enableSessionForAPIKeys: false` esplicito: con `true` una API key avrebbe una sessione e varrebbe come "dashboard".
    - `/autorizza` non si può incorniciare e mostra bene in vista l'host del `redirect_uri`.
    - Un cron cancella dopo 24 ore i client DCR senza token.
30. **Registro attività.**
    - Salva le istantanee prima/dopo delle sole tabelle pubbliche.
    - Un indirizzo cambiato compare come "indirizzo di *Casa Milano* aggiornato", senza valori, e non si annulla.
    - Unione di persone, import e ricalcoli dei km hanno un `batchId`.
    - I ricalcoli sono attività `sistema`. `km`, `kmPending` e `kmSource` restano fuori dal confronto dei conflitti di Annulla.
31. **Export ed eliminazione.**
    - `account.export` è `dashboardOnly` (contiene il testo degli indirizzi). Non contiene mai coordinate, `ipHmac`, `writeKeyHash` o `authUserId`.
    - `account.delete` è `dashboardOnly`, cancella in cascata (§5.9) e chiede una sessione recente.

### Comportamenti di prodotto decisi dal piano

32. **"Canzoni note" 4 = "Molte".** È l'etichetta della UI: `CANZONI_NOTE_LABELS` è la fonte unica. Le descrizioni con "Quasi tutte" (`src/chat/tools.ts`, `chat.mts`) si allineano.
33. **Le costanti cucite su Gabri diventano regole.** Per `gabrifila` le regole danno gli stessi valori di oggi.

    | Oggi | Regola |
    |---|---|
    | "dal 2022" | primo anno dell'ultima serie ininterrotta di anni con concerti visti |
    | "% a Milano" | città più frequente |
    | anni 2017…2026 | `min..max(anno corrente, max)` |
    | centro mappa di riserva | baricentro delle venue |

34. **Contenuti personali.** Il credito "supporto di Cami" e il link Loop diventano campi opzionali del profilo (`extra`), compilati solo nel seed (domanda 1 di §12).
35. **Layout.**
    - Le impostazioni (ordine, visibilità, titoli) valgono per le sezioni de "I dati" (`SECTIONS`, id `sec-*` fissi).
    - "Sul palco" resta fisso. L'atto della wishlist sparisce da solo se la wishlist è vuota.
    - Il TOC elenca solo le sezioni visibili, con i titoli personalizzati.
    - `go_to_section` tiene gli id fissi e su una sezione nascosta restituisce `ok:false`, come oggi i commenti.
36. **Avvisi di manutenzione** (`VicinanzaAlert`, `VotoAlert`, `FromAlert`). Dal traguardo 4 li vede solo il proprietario: nell'SSR delle sue pagine e nel riquadro "da completare" di `#concerti`. I visitatori non li vedono.
37. **Km in attesa.**
    - Nell'archivio, un concerto `kmPending` mostra "—" nella colonna Viaggio, con il titolo "distanza non ancora calcolata".
    - La KPI "Km di viaggi" somma solo i km calcolati. Il suggerimento aggiunge "(N viaggi in attesa)" quando N > 0.
38. **Dopo la serata.** Il prompt degli agenti dice di chiamare `list_concerts({da_completare: true})` a inizio sessione e di proporre voto, vicinanza, canzoni note e commento. La dashboard lo fa con il riquadro "da completare".
39. **Navigazione dell'account.**
    - `/benvenuto` a onboarding finito → 307 a `/<handle>/modifica`.
    - Un utente loggato su `/` vede la landing con "La tua pagina" e "Modifica", senza redirect automatico. Un profilo in `onboarding` va invece a `/benvenuto`.
    - "Esci" sta in `#account` e nel footer, visibile solo da loggati.
40. **Font dei titoli** (`fontTitoli`), tutti in self-hosting:
    - `fraunces` (predefinito);
    - `inter`;
    - `space-grotesk`;
    - `playfair-display`.

    La pagina usa `@fontsource-variable`, l'immagine OG `@fontsource` statico in woff, perché satori non legge i font variabili.
41. **Manifest per profilo.** `/$handle/manifest.webmanifest`, con `name` = `<displayName> ai concerti` e `start_url` = `/<handle>`, collegato da `head()`.
42. **Regola dei soprannomi.** Compare in ogni punto in cui si inseriscono nomi, con l'esempio "Marco Rossi → Marco R.":
    - campo `with` del modale concerto;
    - `#persone`;
    - `#regali`, se il "regalato da" è una persona;
    - `/benvenuto` passo 4;
    - modello CSV;
    - `agentPrompt`;
    - descrizioni degli strumenti MCP;
    - prompt dell'Oracolo in scrittura;
    - `.describe()` dei campi `with` e "regalato da".

### Deroghe da scrivere in DECISIONI (traguardo 9)

43. **oAuthProxy non esercitato in Fase 3.** Prima dello switch la preview `multiutente` usa il callback Google diretto dell'URL del branch. Il proxy si attiva allo switch e si verifica in `SWITCH.md` (passo 13).
44. **OTP di sviluppo sulla preview.** Su `preview/multiutente` "Entra con email" compare col sender di sviluppo, e nessuna email parte. È una deroga a "in preview solo con Resend": la preview è protetta da Vercel Authentication e serve agli smoke test.
45. **Riuso dei km per coppia più forte della ricetta di CLAUDE.md.** Con `kmPairs` si riusa anche senza altri concerti con la stessa coppia (§1.22).

## 2. Versioni

Il traguardo 1 installa Start e Playwright. Il traguardo 2 installa **tutto il resto in un solo cambio di lockfile**, compreso l'override di `better-auth`, tranne l'aggiornamento di TanStack AI, che resta al traguardo 6. Fa eccezione solo il fallback dello spike OG (§9).

| Pacchetto | Versione | Installato in | Usato da | Nota |
|---|---|---|---|---|
| `@tanstack/react-start` | 1.169.3 | 1 | 1 | prima stable; `.validator()` |
| `@tanstack/react-router` | 1.170.45 (esatta) | 1 | 1 | Start la fissa |
| `nitro` | 3.0.260903-beta (esatta) | 1 | 1 | `nitro/vite`, preset Vercel |
| `@playwright/test`, `playwright-core` | 1.62.1 (esatte) | 1 | 1 | Chromium rev 1234 già presente; 1.63 vuole la 1243 |
| `pixelmatch`, `pngjs`, `@types/pngjs` | 8.0.0, 7.0.0 | 1 | 1 | |
| `@tanstack/react-query` | 5.104.5 | 2 | 2 | |
| `@tanstack/react-router-ssr-query` | 1.167.3 | 2 | 2 | |
| `@convex-dev/react-query` | 0.1.0 | 2 | 2 | |
| `convex` | 1.47.0 | – | 2 | già installato; 1.48 è alpha |
| `convex-helpers` | 0.1.128 | 2 | 2 | `server/zod4`, solo dentro `convex/` |
| `@convex-dev/rate-limiter` | 0.4.2 | 2 | 2 | |
| `convex-test`, `@edge-runtime/vm` | 0.0.63, 5.0.0 | 2 | 2 | |
| `better-auth`, `@better-auth/api-key` | 1.6.33 (esatte, + override) | 2 | 3 | peer opzionale `vitest ^2–4` contro vitest 5: solo un avviso. **Non** si abbassa vitest |
| `@convex-dev/better-auth` | 0.12.5 | 2 | 3 | `ssr.noExternal` già in T2 |
| `@tanstack/react-form` | 1.33.5 | 2 | 3 | |
| `@vercel/og` | 1.0.3 | 2 | 4 | spike; fallback `satori` 0.63.2 + `@resvg/resvg-wasm` 2.6.2 |
| `@fontsource/fraunces`, `@fontsource/inter`, `@fontsource/space-grotesk`, `@fontsource/playfair-display` | 5.3.0 (esatte) | 2 | 4 | woff statici per l'OG |
| `@fontsource-variable/space-grotesk`, `@fontsource-variable/playfair-display` | 5.3.0 (esatte) | 2 | 4 | font titoli; Fraunces e Inter variabili ci sono già |
| `@modelcontextprotocol/server` | 2.3.1 | 2 | 7 | richiede `"types": ["node"]` |
| `papaparse`, `@types/papaparse` | 5.7.0 | 2 | 7 | |
| `@sentry/tanstackstart-react` | 11.8.0 (esatta, beta) | 2 | 8 | |
| `posthog-js` | 1.438.13 (esatta) | 2 | 8 | |
| `@google/genai` | ^2.11.0 | – | 5 | già dipendenza; "tema da descrizione" lo usa direttamente |
| `@tanstack/ai` / `ai-gemini` / `ai-react` / `ai-client` | 0.71.0 / 0.38.2 / 0.31.1 / 0.40.1 | 6 | 6 | aggiornati insieme; fino ad allora restano alla 0.40 |
| `zod` | 4.4.3 | – | – | già installato |

Altre configurazioni:
- `engines.node` di `package.json` va a `"24.x"`.
- In `tsconfig.app.json`:
  - `verbatimModuleSyntax: false`;
  - `types: ["vite/client"]`;
  - niente `baseUrl`, che TS 7 rifiuta.
- `convex/tsconfig.json` riceve `"types": ["node"]`.
- `@upstash/*` si rimuove nel traguardo 6.

## 3. Architettura e cartelle

```
shared/                 puro e isomorfo: niente React, DOM, segreti, convex/server
  lib/                  dates, predicates, aggregate, format, filters, trend, kpis, portrait, dataset (T1)
  model/                tipi Concert/Festival/FlatConcert, concertsOf, scale, VICINANZA_LABELS (T1)
  sections.ts           SECTIONS, ex src/chat/tools.ts (T1; etichette per forma in T4)
  schema/               Zod puro con id "brandizzati" locali (T2); importFormat.ts congelato (T2)
  agent/catalog.ts      catalogo delle operazioni per agenti (T2)
  seed/gabrifila.ts     ex src/data.ts (T2)
  chat/ids.ts           THREAD_ID_RE (T2)
  handles.ts agentPrompt.ts (T3) · labels.ts theme.ts jsonld.ts (T4) · import.ts (T7) · scrub.ts (T8)
src/
  router.tsx start.ts client.tsx server.ts routes/ routeTree.gen.ts
  root/providers.tsx (T3) root/errors.tsx (T8)        slot del root, un proprietario ciascuno
  ui/ (Icon, KpiDots, AddressPicker (T3), ...)  dashboard/ filters/ toc/ ritratto/ shell/ chat/ modifica/sezioni/ import/
  server/oracolo/ server/mcp/ lib/auth-client.ts lib/auth-server.ts
convex/
  schema.ts convex.config.ts auth.config.ts auth.ts http.ts crons.ts rateLimits.ts
  lib/builders.ts lib/owner.ts lib/km.ts
  pages.ts entries.ts people.ts gifters.ts wishlist.ts departures.ts venues.ts geo.ts activity.ts
  profiles.ts style.ts chat.ts importer.ts agents.ts account.ts email.ts authFlags.ts
  seed.ts devtools.ts devOtp.ts admin.ts migrations.ts
  betterAuth/{convex.config,schema,adapter,auth}.ts
e2e/                    spec Playwright; helpers/ (now, tema, maschere, canarino, bypass); fughe/<area>.spec.ts
scripts/                convex-locale.mjs wt.mjs dev.mjs e2e.mjs parita-main.mjs nominatim-stub.mjs
                        bundle-guard.mjs migra-storico-chat.mjs check-setup.mjs (+ --preview) preview-shot.mjs
```

## 4. Modello di esecuzione su t3node

### 4.1 Agenti e ondate

```
T1 (1 agente) ─► integrazione+revisione ─► commit ─► push ─► preview ready + smoke
T2 (1 agente) ─► integrazione+revisione ─► commit ─► push ─► seed preview + check-setup --preview
Ondata A: [T3 auth] [T4 pagine] [T8 osservabilità]  ─► merge 3 → 4 → 8 (T4 e T8 si ribasano dopo T3)
Ondata B: [T5 modifica] [T7 MCP/API] [T6 Oracolo]   ─► merge 5 → 7 → 6
T9 (1 agente + orchestratore) ─► giro completo locale + giro completo sulla preview ─► riepilogo
```

- **Orchestratore.**
  - È il thread principale e lavora nel checkout `~/code/personal/concerti-gabri`, sul branch `multiutente`.
  - È l'unico a eseguire `convex dev` su `agile-leopard-908`: è il sito di sviluppo sulla porta 3100, all'URL tailnet, per le prove di Gabri.
  - Integra, fa i commit, pusha e scrive gli esiti degli spike in `DECISIONI.md`.
- **Corsie:** un agente per traguardo.
- **Revisore avversariale:** un agente separato, a contesto pulito.
- **Parallelismo:** tutte le corsie di un'ondata partono insieme, più il revisore. Lo strumento Workflow esegue al massimo 2 agenti alla volta per workflow (min(16, CPU−2) su 4 vCPU), quindi ogni corsia gira nel **proprio** workflow e le corsie di un'ondata sono workflow lanciati in parallelo. Il tetto fisso di 3 agenti è stato tolto (2026-10-21); a serializzare restano solo i lock di §4.4.
- **Dipendenze:**
  - 5, 6 e 7 hanno bisogno della sessione del traguardo 3;
  - 4 e 8 dipendono da 2, ma le loro spec con sessione (stato proprietario dello switch, cookie di sessione, `identify`) si scrivono dopo il merge di T3, ribasando su `multiutente`;
  - 6 e 7 dipendono dal catalogo di T2, non l'uno dall'altro;
  - T5 usa `@google/genai` direttamente, quindi non dipende dall'aggiornamento AI di T6.

### 4.2 Regole di sicurezza: nei brief di tutte le corsie, del revisore e dell'orchestratore

- **Mai:**
  - `convex deploy` in qualunque forma;
  - `--prod`;
  - `--deployment prod` oppure `brave-chickadee-534`;
  - il `buildCommand` di `vercel.json` in locale. Per "riprodurre il build Vercel" si usa `pnpm build:lock` contro un deployment locale.
- **Perché:**
  - con `CONVEX_DEPLOYMENT` impostato nell'ambiente di sessione, `convex deploy` punta al deployment **di produzione** del progetto;
  - in una shell non interattiva lo ferma solo la conferma, e `--yes` la salta;
  - `convex run|env|data --prod` funziona col solo login.
- **Preview:** le operazioni su `preview/multiutente` le fa solo l'orchestratore, sempre con `--deployment preview/multiutente` esplicito.
- **`wt exec`:** le corsie lanciano convex, vite e playwright solo con `node scripts/wt.mjs exec -- <cmd>`. Il wrapper:
  - toglie dall'ambiente ogni `*_PROD`, `CONVEX_DEPLOYMENT`, `VITE_CONVEX_*`, `CONVEX_DEPLOY_KEY*` e `BETTER_AUTH_SECRET_*`;
  - carica `.env.worktree` e imposta `WT_ENV=1`;
  - rifiuta argomenti che contengono `deploy`, `--prod`, `prod` (come parola intera) o `brave-chickadee`.
- **Orchestratore:** usa lo stesso wrapper nel worktree `integrazione`. Nel checkout principale esegue solo `convex dev` sul dev e `convex run --deployment agile-leopard-908 …`.
- **Segreti:** mai stampare, `cat` o `echo` valori di env o file `.env*`; si citano solo i nomi.
- **Altre difese** (blocco PreToolUse, profilo fnox caricato a richiesta per `*_PROD`): le può approvare solo Gabri (domanda 9 di §12).

### 4.3 Worktree di corsia (dal traguardo 2)

1. **Worktree:** `git worktree add ~/.t3/worktrees/concerti-gabri/fase3-mN -b fase3/mN multiutente`, poi `pnpm install --frozen-lockfile`.
2. **`node scripts/convex-locale.mjs init`.** Lo script:
   - parte con l'ambiente ripulito come `wt exec`;
   - crea il deployment con riferimento esplicito al progetto, `convex deployment create <team-slug>:concerti-gabri:local --select`, perché senza variabili di sessione la CLI non sa più quale progetto usare;
   - se la CLI scrive in `.env.local`, sposta quelle righe in `.env.worktree` senza stamparle e ripristina `.env.local` con `t3-env-sync`;
   - verifica che, con `--env-file .env.worktree`, il deployment risolto sia `local:`/anonimo con URL `127.0.0.1`; altrimenti si ferma;
   - imposta l'env del deployment locale da file, senza mai stamparla:
     - `BETTER_AUTH_SECRET`;
     - `SITE_URL` e `BETTER_AUTH_TRUSTED_ORIGINS` uguali a `portless get`;
     - `AUTH_DEV_OTP=1`;
     - `CHAT_SERVER_SECRET`;
     - `NOMINATIM_URL` dello stub;
     - l'eventuale JWKS statico, generato sul momento;
   - lancia `convex dev --once --env-file .env.worktree`, poi `seed:ensure`.
3. **Chiamate alla CLI Convex:** ogni chiamata nelle corsie e negli helper e2e porta `--env-file .env.worktree`, che la CLI 1.47 risolve prima di `process.env`. Vale per `dev`, `run`, `logs`, `env`, `devOtp:latest` e `devtools:*`.
4. **`pnpm dev` e `pnpm e2e`** (`scripts/dev.mjs`, `scripts/e2e.mjs`) rifiutano di partire in un worktree collegato (git-dir ≠ git-common-dir) se manca `WT_ENV=1`.
5. **`globalSetup` di Playwright:** legge l'URL Convex servito dall'app e quello dell'helper (`devtools:whoami`). Si interrompe se non sono entrambi `127.0.0.1` e identici. Gli e2e non girano mai sul dev condiviso.
6. **URL:** `https://fase3-mN.concerti-gabri.localhost:1355`, ammesso dal token Mapbox.
   - Google non accetta `*.localhost`: nelle corsie si entra solo con l'OTP di sviluppo.
   - Il backend locale prende da solo le porte da 3210 in su.
7. **`.gitignore`:** `.convex/`, `test-results/`, `playwright-report/`, `e2e-shots/`. `.env.worktree` è già coperto da `.env.*`.
8. **Alternativa al backend locale** (regola di t3node aggiornata il 2026-10-21, https://docs.convex.dev/cli/agent-mode): un deployment **cloud di sviluppo per worktree** con scadenza, `npx convex deployment create <team-slug>:concerti-gabri:dev/fase3-mN --type dev --expiration "in 7 days"`, scritto in `.env.worktree` come sopra. Non tiene un backend acceso sulla macchina, quindi pesa meno in memoria, ma eredita le variabili predefinite dei deployment dev. Lo spike del traguardo 2 sceglie tra le due strade; il controllo di `globalSetup` (punto 5) accetta allora l'URL del deployment della corsia invece di `127.0.0.1`, mai `agile-leopard-908`.

### 4.4 Risorse

- **Processo pesante:**
  - un build (vite più tsgo);
  - una run Playwright (Chromium più stack);
  - una run Vitest del progetto `convex` (edge-runtime);
  - uno stack acceso (vite dev, `convex dev` e backend locale).
- **Nessun tetto fisso** (tolto il 2026-10-21): i processi pesanti si serializzano con i lock qui sotto, e `pnpm e2e` aspetta la memoria libera. Contano anche lo stack :3100 dell'orchestratore, quello di `integrazione` e i job del revisore.
- **Lock:**
  - `pnpm build:lock`: `flock /tmp/concerti-build.lock` con `NODE_OPTIONS=--max-old-space-size=3072`;
  - `pnpm e2e`: `flock /tmp/concerti-e2e.lock`; aspetta finché `MemAvailable` non arriva a 3 GB;
  - `pnpm vitest:lock`: `flock /tmp/concerti-vitest.lock`.

  Nei brief, `pnpm build` e `pnpm vitest run` senza lock sono vietati alle corsie.
- **Server:** le corsie non tengono server accesi. Vite e convex partono con `wt exec` o dal `webServer` di Playwright solo durante la finestra di test e si fermano alla fine, backend locale compreso.
- **Orchestratore:** ferma lo stack :3100 durante le run di integrazione, salvo quando Gabri sta provando il dev. Lo stack di `integrazione` gira solo mentre si integra.

### 4.5 Regole di corsia

- **Perimetro:** ogni corsia tocca solo i propri file (§7.0). Questi contratti si cambiano solo tramite l'orchestratore:
  - schema;
  - catalogo;
  - formato di import;
  - `useViewer()`;
  - `shared/sections.ts`;
  - file slot del root;
  - nomi dei limiti;
  - voci dei cron;
  - file delle sezioni di `/modifica`.
- **Commit e push:**
  - commit WIP sul branch di corsia, quando si vuole;
  - push di `fase3/mN` ogni sera, entro le 22:50, senza build Vercel (§1.18);
  - dopo le 22:00 l'orchestratore chiede a Gabri prima di avviare lavoro lungo.
- **`.env.example`:** ogni nuova variabile entra lì nello stesso commit, con un commento.
- **Spike:** la corsia riporta l'esito all'orchestratore, che lo scrive in `DECISIONI.md`. Le corsie non toccano quel file.
- **Prima di dichiarare chiuso:** devono essere verdi
  - `pnpm build:lock`;
  - `pnpm vitest:lock`;
  - le spec Playwright del traguardo;
  - `e2e/parita.spec.ts`.

  La corsia riporta poi l'output sintetico.

### 4.6 Integrazione (per ogni corsia, in ordine)

1. Worktree `~/.t3/worktrees/concerti-gabri/integrazione` sul branch `integrazione`, con un proprio Convex locale. Prima di ogni corsia: `git reset --hard multiutente`. Git non permette di avere `multiutente` in due worktree.
2. `git merge --squash fase3/mN`.
3. File generati, mai risolti a mano:
   - lockfile: si uniscono i `package.json` e si lancia `pnpm install`;
   - `routeTree.gen.ts`: si rigenera con `vite build`;
   - `convex/_generated`: si rigenera con `convex dev --once --env-file .env.worktree`.
4. Giro completo con `wt exec`: build, vitest e tutte le spec Playwright esistenti a quel punto.
5. Revisione avversariale (§4.7). Le correzioni bloccanti si fanno sul branch di corsia, poi si ripete il merge.
6. Commit su `integrazione`, con il messaggio del traguardo e `Co-Authored-By`.
7. Nel checkout principale: `git merge --ff-only integrazione`.
8. Dev condiviso:
   - il `convex dev` dell'orchestratore pubblica le funzioni;
   - poi `convex run --deployment agile-leopard-908 seed:ensure`;
   - se lo schema rifiuta i dati esistenti: `devtools:reset`, seed, claim.
9. Push di `multiutente`.
10. Preview:
    - attendere lo stato `ready` (API Vercel);
    - `node scripts/check-setup.mjs --preview`;
    - smoke sull'URL del branch (§8.4).

### 4.7 Revisione avversariale: checklist fissa (bloccante)

1. **Classificazione via builder.**
   - Ogni funzione esportata nasce da `publicQuery`, `ownerQuery`, `ownerMutation`, `ownerAction`, `onboardingMutation` o `internal*`, oppure è una route di `http.ts`.
   - I builder si etichettano da soli con `catalogOp: "<nome>"` oppure `dashboardOnly: "<motivo>"`.
   - `convex/registry.test.ts` scorre gli export senza un elenco centrale e verifica:
     - che ogni funzione owner corrisponda a un'operazione del catalogo, o sia `dashboardOnly` con motivo scritto;
     - che ogni operazione del catalogo abbia la sua funzione.
   - Le query pubbliche hanno `returns` esplicito.
2. **Nessun `profileId` negli argomenti pubblici;** gli id arrivano a `getOwned()`, che dà lo stesso `not_found` per un documento altrui e per uno inesistente.
3. **Tabelle private** (§1.24):
   - `convex/privacy.test.ts` fa un grep stretto su `departureSecrets`, `geocodeDrafts` e `kmPairs`;
   - un altro test verifica che nessuna chiamata `scheduler.runAfter`/`runAt` passi chiavi `lng`, `lat` o `address`.
4. **`dashboardOnly`:** l'elenco di §5.2 rifiuta `agentToken` e `as: "oracolo"`.
5. **Isolamento:** `convex/isolation.test.ts`, generato dal registro, chiama ogni funzione owner come B con gli id di A. Sono ammessi solo `not_found` o `unauthorized`.
6. **Route Start:**
   - scrittura dell'Oracolo solo con sessione e `as: "oracolo"`, senza `web_search`, Origin obbligatorio;
   - strumenti fissi lato server;
   - CSRF attivo: un test verifica che un POST cross-site su una server function risponda 403;
   - Origin da allowlist per ambiente (§1.8);
   - client per richiesta e `Cache-Control` (§1.7).
7. **Iniezioni:**
   - JSON-LD con `<` escapato;
   - token CSS solo da enum o hex validati;
   - popup della mappa senza `setHTML` con stringhe utente;
   - niente `dangerouslySetInnerHTML` su dati utente;
   - URL dei "regalato da" e dei loghi solo `https:`;
   - `/autorizza` non incorniciabile.
8. **Segreti e log:**
   - `scripts/bundle-guard.mjs` confronta in memoria i valori segreti, compreso il segreto di bypass di Vercel, e stampa solo i nomi. Fallisce se `convex/server` compare nel bundle client;
   - niente segreti come argomenti Convex;
   - validazione degli input dentro gli handler, con errori che non ripetono i valori;
   - errori Convex tradotti in `{code, messaggio}`;
   - niente `console.log` di indirizzi o token;
   - scrubbing di Sentry e PostHog attivo.
9. **Limiti d'uso:** tutti quelli di §5.8, ognuno con un test.
10. **Better Auth:**
    - trusted origins come URL esatti;
    - `baseURL` esplicito;
    - `enableSessionForAPIKeys: false`;
    - OTP di sviluppo e `devtools` impossibili in produzione;
    - consenso MCP sempre richiesto;
    - limiti e pulizia della DCR.
11. **Dipendenze:** versioni esatte di §2 e override presente. L'avviso di peer su vitest è atteso.
12. **`.env.example`:** contiene i nomi nuovi della corsia.
13. **Soprannomi:** la regola (§1.42) c'è in ogni nuovo punto in cui si inseriscono nomi.

## 5. Modello dati (Convex)

### 5.1 Tabelle

Tutte le tabelle, `chatThreads`, `devOtpOutbox` e `kmPairs` compresi, sono nello schema del traguardo 2. Da lì in poi i cambi sono solo additivi (§1.17).

**Profili e anagrafica**

| Tabella | Campi principali | Indici | Visibilità |
|---|---|---|---|
| `profiles` | `authUserId?`, `handle?` (manca solo in `onboarding`), `displayName?`, `forma?` (`f`/`m`/`n`), `status` (`onboarding`/`active`), `onboardingStep` (`partenze`/`agente`/`regali`/`fatto`), `theme` {`preset`, `accent?`, `fontTitoli?`, `raggi?`, `densita?`}, `layout` {`ordine[]`, `nascoste[]`, `titoli{}`}, `extra` {`creditoFooter?`, `linkTappi?`}, `createdAt` | `by_handle`, `by_authUserId` | pubblici tutti i campi tranne `authUserId` e `onboardingStep`; solo profili `active` |
| `handleAliases` | `handle`, `profileId`, `createdAt` | `by_handle`, `by_profile` | solo per il 301; riservati finché il profilo esiste |
| `people` | `profileId`, `name` | `by_profile_name` | pubblici solo i nomi usati nei concerti |
| `gifters` | `profileId`, `label`, `url?` (https), `logo?` (`{storageId}`, oppure `{url}` solo per il seed) | `by_profile` | pubblica |
| `wishlist` | `profileId`, `artist`, `ordine` | `by_profile_ordine` | pubblica |

**Partenze e km**

| Tabella | Campi principali | Indici | Visibilità |
|---|---|---|---|
| `departures` | `profileId`, `name`, `hasAddress`, `legacy`, `lastCorrectionAt?`, `createdAt` | `by_profile` | pubblico solo `name`; `hasAddress` lo vedono proprietario e agenti |
| `departureSecrets` | `departureId`, `profileId`, `address`, `lng`, `lat`, `geocodedAt` | `by_departure` | **mai** |
| `geocodeDrafts` | `profileId`, `departureId`, `candidates[{label,lng,lat}]`, `expiresAt` | `by_departure`, `by_expires` | **mai**; un cron la pulisce |
| `kmPairs` | `profileId`, `departureId`, `venueId`, `km`, `source` (`legacy`/`calcolato`), `drawnAt` | `by_pair`, `by_departure` | **mai** come tabella; il km arriva al pubblico solo sui concerti |

**Catalogo venue (condiviso)**

| Tabella | Campi principali | Indici | Visibilità |
|---|---|---|---|
| `venues` | `name`, `city`, `nameKey`, `cityKey`, `lng`, `lat` (immutabili), `osm?`, `source` (`seed`/`osm`/`citta`), `createdBy?` | `by_key`, `by_osm` | pubblica |
| `cities` | `name`, `key`, `lng`, `lat` | `by_key` | pubblica |
| `venueSearchCache` | `keyHash` (SHA-256), `results` (solo POI), `fetchedAt` | `by_keyHash` | interna |

**Concerti**

| Tabella | Campi principali | Indici | Visibilità |
|---|---|---|---|
| `entries` | vedi sotto | `by_profile_sortKey`, `by_profile_departure`, `by_profile_venue` | pubblica, come proiezione con `returns` |

Campi di `entries`:
- comuni: `profileId`, `kind` (`concert`/`festival`), `date` ("gg/mm/aaaa" oppure "30–31/03/2017"), `sortKey`, `y`, `venueId`;
- biglietto: `cost?` (numero o `"na"`), `gift?`, `giftFromId?`, `accredito?`;
- viaggio: `departureId?`, `km?`, `kmSource?`, `kmPending?`;
- `comments?`, `updatedAt`;
- solo concerto: `artist`, `with[]`, `voto?`, `vicinanza?`, `canzoniNote?`;
- solo festival: `name` e `concerts[]` con almeno 2 elementi `{cid, artist, with[], voto?, vicinanza?, canzoniNote?, date?}`.

**Attività, chat e servizio**

| Tabella | Campi principali | Indici | Visibilità |
|---|---|---|---|
| `activity` | `profileId`, `at`, `actor` {`via`: `dashboard`/`oracolo`/`mcp`/`apikey`/`sistema`, `label`}, `op`, `table`, `docId`, `batchId?`, `summary`, `before?`, `after?`, `undoneBy?`, `undoOf?` | `by_profile_at`, `by_batch` | proprietario e suoi agenti |
| `chatThreads` | `profileId`, `threadId`, `visibility` (`pubblica`/`proprietario`), `title`, `author?`, `writeKeyHash?`, `ipHmac?`, `messages[]`, `updatedAt`, `expiresAt` | `by_threadId`, `by_profile_visibility_updatedAt`, `by_expires` | `pubblica`, senza `writeKeyHash` e `ipHmac`; `proprietario` solo per l'owner |
| `devOtpOutbox` | `email`, `otp`, `type`, `createdAt` | `by_email` | `internal` |

**Componenti:**
- `betterAuth`, in locale: `user`, `session`, `account`, `verification`, `jwks`, `oauthApplication`, `oauthAccessToken`, `oauthConsent`, `apikey`, `rateLimit`;
- `rateLimiter`;
- `_storage`.

### 5.2 Funzioni

**Query pubbliche** (`publicQuery`, con `returns`):
- `pages.byHandle({handle})`.
  - Restituisce:
    - profilo pubblico;
    - concerti;
    - nomi delle persone usate;
    - "regalato da" con `logoUrl`;
    - nomi delle partenze;
    - venue e città usate, con le coordinate;
    - wishlist, tema e layout.
  - Restituisce `null` se il profilo non è `active` e `{redirect}` se l'handle è un alias.
- `profiles.handleAvailable`, che controlla profili, alias e riservati, e `authFlags.get` (`{emailLogin}`).
- Dal traguardo 6, `chat.listThreads({handle})` e `chat.getThread({handle, threadId})`, solo sui thread `pubblica`.

**Query del proprietario:**
- `me.profile` (`null` se anonimo);
- `me.departures` (nome e `hasAddress`);
- `me.people`, `me.activity`, `me.agents`;
- dal traguardo 6, `me.chatThreads`.

**`dashboardOnly`, con il motivo scritto nel builder:**

| Funzione | Motivo |
|---|---|
| `me.departureAddresses` (solo testo, caricato dopo il mount), `geo.geocodeDeparture`, `departures.confirmAddress` | indirizzi (SPEC) |
| `account.export` | contiene il testo degli indirizzi |
| `account.delete` | un token rubato non deve cancellare tutto |
| `agents.createApiKey`, `agents.revokeApiKey`, `agents.revokeOAuthClient` | un token non crea né revoca token |
| `gifters.generateLogoUploadUrl` | upload dal browser; gli agenti usano `set_gifter_logo` con un URL |
| `style.consumeThemeGeneration` | la chiama solo la server function di `#stile` |
| `profiles.setOnboardingStep` | navigazione della UI |

**Owner con `catalogOp`:**
- concerti: aggiungi, modifica, cancella;
- persone: aggiungi, rinomina, unisci, cancella;
- partenze: aggiungi, rinomina, cancella;
- "regalato da": aggiungi, modifica, cancella, logo da URL;
- wishlist;
- `venues.createFromCandidate`, `geo.searchVenue`;
- `profiles.update` (nome, handle, forma);
- `profiles.setTheme` (preset, token, layout);
- `activity.undo`;
- `importer.preview` e `importer.apply`.

**`onboardingMutation`:** `profiles.completeOnboarding`, l'unica che accetta un profilo in `onboarding`.

**HTTP** (`convex/http.ts`):
- route di Better Auth;
- `/oracolo/turno` e `/oracolo/trascrizione`, con `Authorization: Bearer` e confronto a tempo costante. Nel traguardo 2 sono stub.

**Interne:**
- `seed.ensure`, `admin.claimProfile`, `migrations.importChatThreads`;
- `devOtp.*`;
- `devtools.*` (`addEntry`, profili di prova, `whoami`, `setDepartureForTest`, `reset`, `cleanupE2E`);
- ricalcolo dei km e cron.
- `devtools` e `devOtp` rifiutano se `CONVEX_CLOUD_URL` è quello di `brave-chickadee-534` o se manca `AUTH_DEV_OTP=1`. Un test unitario lo verifica.

### 5.3 Schema Zod unico (`shared/schema/`)

- **Zod puro, senza `convex-helpers`:** gli id sono "brandizzati" con un helper locale (`idDi<"entries">()`). La mappatura verso `zid`/`zodToConvexFields`/`zCustomMutation` avviene **solo dentro `convex/`**.
- **`campi.ts`:** scale e campi con `.describe()` in italiano, regole comprese:
  - `vicinanza`: "6 Transenna … 1 Anello alto";
  - `canzoniNote`: 1–5 oppure `"na"`;
  - `with` e "regalato da": "soprannomi o diminutivi, non nome e cognome: 'Marco Rossi' → 'Marco R.'";
  - `cost`: numero oppure `"na"`.
- **`entry.ts`:** forme DB e forme esterne con i nomi.
  - La data si accetta anche in ISO `AAAA-MM-GG`.
  - Un festival richiede almeno 2 concerti.
  - Gli URL devono essere `https`.
- **`profile.ts`, `departure.ts`, `venue.ts`, `gifter.ts`, `errors.ts`, `importFormat.ts`** (§5.10).
- **Da qui derivano:**
  - Convex;
  - i form (`validators: { onChange: schema }`);
  - MCP (`inputSchema`);
  - l'Oracolo (`toolDefinition`);
  - l'import (`safeParse` per riga);
  - il catalogo (`shared/agent/catalog.ts`): nome, descrizione, input, output e flag `confirm`/`dashboardOnly`.
- **Errori:** `ConvexError({code, messaggio, campo?, fix?})`. `fix` è un percorso tipo `/<handle>/modifica#partenze`, che MCP trasforma in URL assoluto. I messaggi non ripetono mai i valori ricevuti.
- **Test:** ogni campo foglia ha una descrizione.

### 5.4 Helper di proprietà (`convex/lib/owner.ts`, `convex/lib/builders.ts`)

```ts
type Actor = { via: "dashboard" | "oracolo" | "mcp" | "apikey" | "sistema"; userId: string; clientId?: string; keyId?: string };
async function resolveActor(ctx, { agentToken, as }): Promise<Actor>
  // T2: solo sessione · T3: authComponent.safeGetAuthUser · T7: "cgk_…" → SHA-256 in apikey; altro → oauthAccessToken
  // as: "oracolo" può solo declassare: via "dashboard" → "oracolo"; con un token agente si ignora
export async function requireOwner(ctx, { agentToken, as, dashboardOnly }) → { profile, actor }
  // profilo by_authUserId (unico); status "onboarding" → ConvexError {code:"no_profile", fix:"/benvenuto"}
  // dashboardOnly && actor.via !== "dashboard" → ConvexError {code:"solo_dashboard"}
export const ownerQuery / ownerMutation / ownerAction / onboardingMutation  // { catalogOp | dashboardOnly, input: zod, handler }
  // args Convex larghi; input validato con Zod nell'handler dopo resolveActor; profileId mai dagli args
export async function getOwned(ctx, owner, table, id)                     // not_found identico per assenti e altrui
```

- Le scritture degli agenti passano dal limite `agentWrites`.
- Ogni scrittura chiama `logActivity` nella stessa transazione.
- Un utente ha un solo profilo, quindi un token o una sessione valgono per un solo profilo.

### 5.5 Partenze, km e geocoding

1. **Indirizzo, solo da dashboard.**
   - `geo.geocodeDeparture({departureId, address})` è un'action. L'indirizzo arriva come `v.string()` e si valida dentro l'handler.
   - Interroga Nominatim attraverso la coda, senza cache e senza log.
   - Salva i candidati con `internal.departures.saveDraft` e restituisce `[{indice, etichetta}]`.
   - `departures.confirmAddress({departureId, indice})` scrive `departureSecrets`.
2. **Dopo `confirmAddress`:**
   - **Prima volta su una partenza `legacy`:** le coppie con km legacy restano; si calcolano solo i `kmPending`, con un'estrazione nuova per ogni coppia nuova.
   - **Correzione** (al massimo 1 al giorno per partenza): nuova estrazione per ogni coppia della partenza in `kmPairs`, poi riscrittura dei concerti a lotti con `ctx.scheduler`, passando solo id. Tutto con un `batchId` e come attività `sistema`.
3. **Nuovo concerto o cambio di venue:**
   - se c'è la coppia in `kmPairs`, se ne riusa il km;
   - altrimenti, se la partenza ha l'indirizzo, si calcola `km = round(d·(1.2+0.25·e^(−d/20))·j)` con `j ∈ [0.95, 1.07]` da `crypto.getRandomValues` e si salva la coppia;
   - senza indirizzo si mette `kmPending: true` e l'agente riceve il link a `#partenze`.
   - Cancellare concerti non cancella mai le coppie.
4. **Venue:**
   - `geo.searchVenue({query})` è per utenti loggati, con limiti per profilo e per attore. Cerca all'invio con `layer=poi` e applica i filtri e la cache hashata di §1.23. Ripiega sulla città, con l'attribuzione "© OpenStreetMap contributors".
   - `venues.createFromCandidate` deduplica per id OSM e per nome+città. Non esiste un modo per aggiornare le coordinate.
   - Il flusso delle partenze non chiama e non alimenta mai la creazione di venue.
5. **Nominatim:**
   - UA `concerti-gabri/1.0 (+https://concerti.gabrifila.me)`;
   - `NOMINATIM_URL` ha un default;
   - errori `geocoder_busy` e `geocoder_unavailable` con il messaggio "riprova".
6. **Spike nel traguardo 2:** User-Agent conservato e `setTimeout` nelle action del runtime predefinito. Se non vanno, si passa a `"use node"` con Node 24 in `convex.json`.

### 5.6 Seed e claim

- **`seed:ensure`** (interna e idempotente; la usa anche `--preview-run`):
  - 49 persone e 1 "regalato da", con il logo esterno https del seed;
  - la wishlist;
  - 38 venue più le città;
  - 2 partenze, "Milano" e "Genova", `legacy` e senza indirizzo, con i nomi identici a oggi;
  - 84 righe (91 concerti, 2 festival) **con i km di oggi copiati tali e quali** (`kmSource: "legacy"`);
  - `kmPairs` da quei km: per ogni coppia il valore del concerto più recente, mentre ogni concerto tiene il suo km. `seed.test` conta le coppie con più valori diversi; per la ricetta di CLAUDE.md devono essere 0.
- **Profilo:** `status: "active"`, `onboardingStep: "fatto"`, forma `m`, nome "Gabri", `extra` con credito e link Loop, senza `authUserId`.
- **`admin:claimProfile({handle, email})`**, in un'unica mutation:
  - trova l'utente per email;
  - cancella il suo profilo `onboarding` vuoto, creato dal primo login, e rifiuta se quel profilo ha handle o dati;
  - imposta `authUserId` su `gabrifila`.

  Si esegue sul dev dopo il primo login di Gabri. Sulla preview si rifà dopo ogni ricreazione del deployment.

### 5.7 Registro attività e Annulla

- **Conferme.** Le scritture valgono subito; chiedono conferma solo:
  - le cancellazioni: modale, `confirm: true` via MCP, `needsApproval` nell'Oracolo;
  - gli import di più di `CONFIRM_IMPORT_ROWS = 10` righe.
- **Annulla:**
  - applica l'inverso solo se il documento coincide ancora con `after`, ignorando `km`, `kmPending` e `kmSource`. Altrimenti risponde "modificato dopo: annulla prima le modifiche successive";
  - unioni di persone e import si annullano per `batchId`, anche se il lotto è parziale;
  - i ricalcoli `sistema` non si annullano;
  - annullare è a sua volta un'attività, e annullarlo rifà l'operazione;
  - il km di un concerto ripristinato arriva da `kmPairs`, quindi è identico.
- **Conservazione:** 180 giorni, tramite cron.

### 5.8 Limiti d'uso (tutti i nomi definiti nel traguardo 2 in `convex/rateLimits.ts`)

| Nome | Chiave | Limite |
|---|---|---|
| `chatIpMinute` / `chatIpDay` | HMAC dell'IP | 8 al minuto / 40 al giorno |
| `chatGlobalDay` | globale | 200 al giorno |
| `chatPageDay` | pagina | 60 al giorno (`gabrifila` 120) |
| `chatOtherPagesDay` | tutte le pagine tranne `gabrifila` | 120 al giorno: a `gabrifila` restano sempre almeno 80 del globale |
| `agentWrites` | profilo | 200 all'ora (un import conta 1 per lotto) |
| `geocodeProfile` / `geocodeActor` | profilo / attore | 30 all'ora ciascuno |
| `nominatimGlobal` | globale | 1 al secondo, coda con `reserve` |
| `addressCorrection` | partenza | 1 al giorno |
| `otpSendEmail` / `otpSendGlobal` | email / globale | 3 ogni 10 minuti / 50 all'ora |
| `dcrGlobal` | globale | 20 all'ora |
| `themeFromDescription` / `themeGlobalDay` | profilo / globale | 10 al giorno / 50 al giorno |
| `logoUpload` | profilo | 20 al giorno |

### 5.9 Eliminazione dell'account (cascata)

- **Si cancellano:**
  - `profiles`, `handleAliases`, `entries`, `people`;
  - `gifters` con i file `_storage` dei loghi;
  - `wishlist`, `departures`, `departureSecrets`, `geocodeDrafts`, `kmPairs`;
  - `activity`;
  - `chatThreads` di ogni visibilità;
  - `devOtpOutbox` per quell'email;
  - in Better Auth: `user`, `session`, `account`, `verification`, `apikey`, `oauthAccessToken`, `oauthConsent`, e gli `oauthApplication` dell'utente.
- **Si conservano:** le venue (catalogo condiviso), a cui si toglie `createdBy`.
- **Flusso:**
  1. in `#account` si conferma scrivendo l'handle;
  2. se la sessione è più vecchia di `freshAge`, compare "Per sicurezza rientra con Google", che fa un login nuovo e torna a `#account?elimina=1`;
  3. `account.delete` esegue la cascata e poi `deleteUser`;
  4. reload su `/`.

### 5.10 Formato di import (congelato nel traguardo 2, `shared/schema/importFormat.ts`)

- **Colonne CSV**, in quest'ordine:
  ```
  tipo,data,data_concerto,artista,festival,venue,citta,con,voto,vicinanza,canzoni_note,costo,regalo,regalato_da,accredito,partenza,commento
  ```
  - `tipo` è `concerto` o `festival`;
  - `con` è separato da `;`;
  - `canzoni_note` va da 1 a 5 oppure `na`.
- **Festival nel CSV:**
  - le righe `tipo=festival` con gli stessi `festival`, `venue` e `data` formano un unico festival;
  - `data_concerto` è la data del singolo concerto, per i festival su più giorni;
  - `costo`, `regalo`, `regalato_da`, `accredito`, `partenza` e `commento` devono essere identici o vuoti in tutte le righe del gruppo.
- **JSON:** è lo schema esterno di `entry.ts`, un array di concerti e festival con i nomi.
- **Uso:**
  - il modello scaricabile, a cura del traguardo 3, si genera da qui;
  - il parser papaparse, a cura del traguardo 7, è un adattatore e non cambia il formato.

## 6. SSR e rotte

| Rotta | File | Traguardo | Note |
|---|---|---|---|
| `/` | `routes/index.tsx` | 1 (307 → `/gabrifila`), 3 (landing e `?chat=` → 308) | utente loggato: §1.39 |
| `/dati` | `routes/dati.tsx` | 4 | 308 → `/gabrifila/dati`; il browser conserva `#sec-…` |
| `/accedi` | `routes/accedi.tsx` | 3 | login a pagina intera con `?next=`; `loginPage` di MCP |
| `/autorizza` | `routes/autorizza.tsx` | 7 | consenso MCP, non incorniciabile |
| `/benvenuto` | `routes/benvenuto.tsx` | 3 (+ slot del passo 3 in 7) | guard per `onboardingStep` |
| `/privacy` | `routes/privacy.tsx` | 3 | |
| `/$handle` | `routes/$handle.tsx` (layout), `$handle.index.tsx`, `$handle.dati.tsx` | 1, 2, 4 | regex dell'handle, altrimenti `notFound()`; alias → 301 |
| `/$handle/manifest.webmanifest` | `routes/$handle.manifest[.]webmanifest.ts` | 4 | §1.41 |
| `/$handle/modifica` | `routes/$handle.modifica.tsx` | 3 (guard e scheletro), 5 | non proprietario → `/$handle` |
| `/api/auth/*` | `routes/api/auth/$.ts` | 3 | proxy verso il sito Convex |
| `/api/chat` | `routes/api/chat/index.ts` | 1, 2 (dati Convex), 6 | SSE |
| `/mcp`, `/.well-known/oauth-*` | `routes/mcp.ts`, `routes/[.]well-known/…` | 7 | |
| `/og/$handle` | `routes/og/$handle.ts` | 4 | PNG, `s-maxage=600, stale-while-revalidate` |
| `/ingest/**` | `routeRules` di Nitro | 2 (regola), 8 (uso) | non passa dal router |

**Segmenti riservati.** Il test dei riservati controlla due livelli:
- ogni segmento di primo livello del route tree è un handle riservato;
- sotto `$handle` esistono solo `dati`, `modifica` e `manifest.webmanifest`.

**Loader di `$handle`.**

```ts
loader: async ({ context, params }) => {
  const page = await context.queryClient.ensureQueryData(convexQuery(api.pages.byHandle, { handle: params.handle }))
  if (!page) throw notFound()
  if ("redirect" in page) throw redirect({ to: ..., params: { handle: page.redirect }, statusCode: 301 })
  return { now: context.now }
}
// componenti: useSuspenseQuery(convexQuery(api.pages.byHandle, { handle }))
```

**Isolamento e cache:**
- client per richiesta e `Cache-Control: private, no-store` (§1.7);
- `#partenze` usa `useQuery` senza suspense, abilitato da `useHydrated()`, così gli indirizzi non entrano mai nello stato SSR.
- Un test lancia due richieste SSR concorrenti con sessioni diverse, su `/A/modifica` e su `/B`. Nessuna delle due risposte deve contenere i dati `me.*` dell'altra.

**`head()`:**
- stili con `?url` (`styles.css`, `wishlist.css`);
- icone e `theme-color`;
- manifest per profilo;
- titolo `<displayName> ai concerti`, con il prefisso delle preview ricavato da `VERCEL_ENV`/`VERCEL_GIT_COMMIT_REF`;
- meta OG e Twitter, e canonical dall'origine per ambiente (§1.8);
- token del tema in `<style>:root{…}</style>`, solo da valori validati;
- JSON-LD:
  - `ProfilePage` più un `MusicEvent` per concerto;
  - mai compagni, prezzi o commenti;
  - `<` escapato.

**Solo client:**
- Mapbox negli effetti, con un segnaposto `.mapwrap` della stessa altezza;
- `TrendPlot` in `<ClientOnly>`;
- `isPhone` parte da `false`;
- le letture di `localStorage` della chat stanno negli effetti;
- `?chat=` passa dalla search del router.

**Guard (`beforeLoad`, solo per la UX):**
- `/modifica`: utente anonimo, oppure `me.profile.handle !== params.handle` → `/$handle`;
- `/benvenuto`:
  - utente anonimo → `/accedi?next=/benvenuto`;
  - profilo in `onboarding` → passo 1;
  - `onboardingStep` → quel passo;
  - `fatto` → `/<handle>/modifica`.

## 7. Traguardi

### 7.0 Proprietà dei file nelle ondate parallele

Lo scheletro condiviso lo congela il traguardo 2:
- schema completo;
- tutte le voci dei cron, che puntano a funzioni stub nei moduli proprietari;
- tutti i nomi dei limiti;
- `vite.config.ts` con `ssr.noExternal` e la regola `/ingest`;
- `src/start.ts` con CSRF;
- le route stub di `http.ts`;
- gli slot del root;
- `shared/sections.ts`;
- `e2e/helpers/canarino.ts`.

Le corsie riempiono gli stub e non aggiungono voci a quei file.

| Corsia | Possiede | Tocca solo in modo additivo |
|---|---|---|
| 3 auth | `convex/{auth,auth.config,authFlags,email,devOtp,admin}.ts`, `convex/betterAuth/`, `src/lib/auth-*`, `routes/{index,accedi,benvenuto,privacy}.tsx` (compreso il 308 di `/?chat`), `routes/api/auth/`, `$handle.modifica.tsx` più lo scheletro di `src/modifica/`, `src/ui/AddressPicker.tsx`, `src/root/providers.tsx` | `lib/owner.ts` (ramo sessione), route auth in `http.ts`, `profiles.ts` (onboarding) |
| 4 pubbliche | `shared/{labels,theme,jsonld}.ts`, `src/shell/`, `src/ritratto/`, `src/dashboard/`, `routes/dati.tsx`, `routes/og/`, `$handle.tsx` (head), route del manifest | `shared/sections.ts` (etichette per forma), validatore del tema in `profiles.ts`; `redirect.spec` testa il 308 di `/?chat` senza toccare `index.tsx` |
| 8 osservabilità | `src/{client,server}.tsx`, `instrument.*`, `shared/scrub.ts`, `src/root/errors.tsx` | `vite.config.ts` (una riga per il plugin Sentry), `src/start.ts` (Sentry in testa) |
| 5 modifica | `src/modifica/sezioni/*` tranne `Agenti.tsx`, `convex/{account,gifters,style}.ts`, server function del tema da descrizione, `e2e/fughe/pagine.spec.ts` | `convex/departures.ts` (flussi di conferma e correzione) |
| 7 MCP/API | `src/server/mcp/`, `routes/mcp.ts`, `routes/[.]well-known/`, `routes/autorizza.tsx`, `shared/import.ts`, `convex/{importer,agents}.ts`, `src/modifica/sezioni/Agenti.tsx`, `src/import/` (upload e conferma), `e2e/fughe/mcp.spec.ts` | `lib/owner.ts` (rami apikey e oauth), `convex/auth.ts` (endpoint MCP), `routes/benvenuto.tsx` (slot del passo 3) |
| 6 Oracolo | `src/server/oracolo/`, `src/chat/`, `convex/chat.ts`, `routes/api/chat/`, `e2e/fughe/oracolo.spec.ts` | `src/modifica/` (chat in scrittura) |

---

### Traguardo 1: TanStack Start su Vercel, a parità di funzioni

**Obiettivo.** Il sito di oggi gira in SSR sotto `/gabrifila` e `/gabrifila/dati`, ancora con i dati statici. Ha le stesse sezioni, gli stessi numeri e lo stesso aspetto della build di `main`. Il tema arriva dal cookie, senza flash.

**Consegne**
- **Struttura dell'app:**
  - via `index.html` e `src/main.tsx`;
  - nuovi `src/router.tsx`, `routes/__root.tsx`, `routes/index.tsx` (307 temporaneo verso `/gabrifila`, con la query string), `routes/$handle.tsx` (solo `gabrifila`), `$handle.index.tsx`, `$handle.dati.tsx`;
  - `vite.config.ts` con `tanstackStart()`, `nitro({ vercel: { functions: { regions: ['dub1'] } } })` e `viteReact()`; `server.port = PORT || 3100` con `strictPort`; `allowedHosts: ['t3node.tail4a8e3b.ts.net']`;
  - `package.json`:
    - script `dev`, `build` (`vite build && tsc -b`), `build:lock`, `e2e`, `vitest:lock`;
    - `engines.node` = `24.x`.
  - `vercel.json`: `git.deploymentEnabled` per `fase3/*` e `integrazione` (§1.18).
  - `.gitignore`: `test-results/`, `playwright-report/`, `e2e-shots/`.
- **Scomposizione di `App.tsx`** (§1.15), passi 0–3:
  - spostamenti in `shared/lib/*`, `shared/model/*` e `shared/sections.ts` (`SECTIONS` esce da `src/chat/tools.ts`), più i componenti;
  - `ProfileContext {profile, dataset, now}` con `buildDataset()`;
  - `now` iniettato;
  - protezioni per l'SSR (§6).
- **Tema:**
  - cookie `tema`, `ScriptOnce` per `system`, migrazione da `localStorage.theme`;
  - lo strumento client `set_theme` diventa `set_visitor_theme` e scrive il cookie.
- **Chat:**
  - `netlify/functions/chat.mts` diventa `routes/api/chat/index.ts`, con la logica in `src/server/oracolo/`;
  - l'IP viene da `getRequestIP({xForwardedFor:true})`;
  - fino al traguardo 6 l'Oracolo funziona senza storico: `/api/chat/history` risponde 503 come oggi senza Redis, e il rate limit usa il fallback in memoria;
  - le origini sono per ambiente (§1.8).
- **HTML:** `Cache-Control: private, no-store`.
- **Strumenti:**
  - `scripts/preview-shot.mjs` perde il workaround TLS/fetch dei sandbox: su t3node Chromium va diretto. Il bypass vale solo verso l'origine della preview (§8.4), la mappa si giudica dalle tile e trace e video sono spenti;
  - `scripts/bundle-guard.mjs`.
- **Playwright:**
  - `playwright.config.ts`:
    - progetti `desktop` (Desktop Chrome), `mobile` (Pixel 7) e `preview` (trace e video spenti), con `workers: 1`;
    - `timezoneId: 'Europe/Rome'`, `reducedMotion: 'reduce'`;
    - SwiftShader per la mappa, `ignoreHTTPSErrors` per portless;
  - `scripts/parita-main.mjs`: worktree `/tmp/concerti-main` da `main`, build e `vite preview --port 4173`.
- **`.env.example`:** `E2E`, `E2E_NOW`, `VITE_E2E`, con il commento "solo locale".

**Accettazione**
- **Vitest:**
  - `shared/lib/kpis.test.ts`, i 12 KPI con `now = 2026-10-21T12:00+02:00`:
    - Concerti 80 · In programma 11 (prossimo 18/11/2026) · media per anno 15.6 · Voto medio 3,4★ · Speso €3375 / 68 biglietti · Spesa media €50;
    - Città 13 (53% a Milano) · Artisti 50 (Emma Nolde 10x) · Compagni 44 (#1 Cami <3) · Da solo 11 (14%) · Alla cieca 25 (32%) · Km 7278;
    - aggregati delle card;
  - `dates`: confine UTC/Roma tra le 00:00 e le 02:00;
  - `filters`;
  - `dataset`: `COST_MAX` 150, `KM_MAX` 980;
  - `src/server/oracolo/validate.test.ts`: origini per ambiente, limiti di dimensione.
- **Playwright:**
  - `e2e/parita.spec.ts`: 8 coppie, `main` (`/`, `/dati`) contro Start (`/gabrifila`, `/gabrifila/dati`), in chiaro/scuro e desktop/mobile:
    - stesso orario congelato su entrambe le build;
    - maschere su `.mapwrap` e `.trendcanvas`;
    - stessi testi KPI e stessi id `sec-*`;
    - al massimo lo 0,2% dei pixel diversi e stessa altezza di pagina;
    - zero errori di idratazione;
  - `e2e/tema.spec.ts`: `data-theme` nell'SSR, script in `<head>` per `system`, migrazione da `localStorage`, `set_visitor_theme` scrive il cookie;
  - `e2e/mappa.spec.ts`, sull'URL portless: `canvas.mapboxgl-canvas` presente, niente "Mappa non disponibile", almeno una risposta `vector.pbf` con 200 e nessuna con 403;
  - `e2e/http.spec.ts`: `Cache-Control` dell'HTML;
  - `e2e/oracolo-sse.spec.ts` (`@gemini`): "quanti concerti ho visto nel 2025?" produce `TOOL_CALL_*` di `query_concerts`;
  - `bundle-guard` verde.
- **Preview:**
  - stato `ready`;
  - l'HTML di `/gabrifila` contiene già "80";
  - mappa viva per tile sull'URL del branch;
  - un push di prova su `fase3/prova` non crea nessun deployment.
- **Gabri** guarda le 8 coppie di screenshot e le immagini delle differenze.

**Commit:** `Fase 3.1: il sito gira su TanStack Start con SSR sotto /gabrifila, parità con main verificata da Playwright`

---

### Traguardo 2: Convex, schema Zod unico e scheletro condiviso

**Obiettivo.**
- Tutti i dati vivono in Convex e lo schema è unico.
- Ogni funzione passa da un builder che la classifica.
- Il seed conserva i km.
- Le pagine pubbliche e l'Oracolo leggono da Convex.
- Lo scheletro condiviso delle ondate è congelato.

**Consegne**
- **Convex di base:**
  - `convex/convex.config.ts` con il rate limiter;
  - `schema.ts` con **tutte** le tabelle di §5.1;
  - `convex/tsconfig.json`, `convex.json`;
  - `crons.ts` con tutte le voci verso stub;
  - `rateLimits.ts` con tutti i nomi di §5.8;
  - `http.ts` con le route stub `/oracolo/*`.
- **Dipendenze:** tutte quelle di §2 tranne TanStack AI, in un solo cambio di lockfile, con l'override.
- **Configurazione condivisa:**
  - `vite.config.ts` con `ssr.noExternal: ['@convex-dev/better-auth']` e le `routeRules` di `/ingest`;
  - `src/start.ts` con CSRF;
  - slot `src/root/{providers,errors}.tsx`, per ora vuoti;
  - `vercel.json`: `buildCommand` con `--preview-run seed:ensure` (§1.17) e header di sicurezza (§1.9).
- **Schema e catalogo:**
  - `shared/schema/*` in Zod puro, con `importFormat.ts` (§5.10);
  - `shared/agent/catalog.ts` con l'elenco completo del traguardo 7, congelato;
  - `shared/chat/ids.ts`.
- **Logica:**
  - `convex/lib/{builders,owner,km}.ts`, owner solo sul ramo sessione;
  - moduli `pages`, `entries`, `people`, `gifters`, `wishlist`, `departures`, `venues`, `geo`, `activity`, `profiles`, `seed`, `devtools`, `migrations` (stub), `devOtp` (stub con guardia);
  - `kmPairs`.
- **Client e SSR:**
  - `src/router.tsx` con i client per richiesta (§1.7) e `setupRouterSsrQueryIntegration`;
  - loader di `$handle`;
  - `pageToDataset(page)`;
  - `useViewer()`, che restituisce `null` fino al traguardo 3.
- **Oracolo su Convex** (§1.14): vocabolari, `chatToolDefs` e `query_concerts` da `pageToDataset(pages.byHandle('gabrifila'))`.
- **Dati statici:** `src/data.ts` diventa `shared/seed/gabrifila.ts`; `src/` non lo importa più.
- **Sicurezza:** popup della mappa costruito con nodi DOM; URL dei "regalato da" solo https.
- **Strumenti locali** (§4.2–4.3):
  - `scripts/{convex-locale,wt,dev,e2e,nominatim-stub}.mjs`. Lo stub restituisce un `display_name` fisso per il canarino;
  - `e2e/helpers/canarino.ts`;
  - `globalSetup` con i controlli su `127.0.0.1`;
  - `check-setup.mjs --preview`.
- **Vitest:** `vitest.config.ts` con i progetti `unit` (node) e `convex` (edge-runtime, `server.deps.inline`).
- **Ambienti:**
  - `CHAT_SERVER_SECRET` generato e portato su dev, sulle variabili predefinite delle preview e sui locali;
  - `AUTH_DEV_OTP=1` sulle preview predefinite;
  - seed del dev e seed manuale di `preview/multiutente` (§1.17).
- **Spike:** una query reale a Nominatim dal dev ("Forum di Assago") e lo User-Agent; `--preview-run` con una funzione `internal`.
- **`.env.example`:** `NOMINATIM_URL`, `CHAT_SERVER_SECRET`, `AUTH_DEV_OTP`, `ORACOLO_FAKE`.

**Accettazione**
- **Vitest:**
  - `shared/schema/schema.test.ts`:
    - righe valide e non valide;
    - festival con meno di 2 concerti rifiutato;
    - date nei due formati, https;
    - descrizioni presenti;
    - Zod→Convex uguale ai validatori delle tabelle;
    - nessun import di `convex/*` sotto `shared/`.
  - `convex/lib/km.test.ts`:
    - su 10.000 estrazioni il jitter resta in [0.95, 1.07] e non si ripete mai;
    - la formula è deterministica a `j` fisso;
    - una coppia esistente si riusa;
    - cancellare l'ultimo concerto di una coppia e riaggiungerlo dà un km identico;
    - Annulla e Rifai danno un km identico.
  - `convex/lib/owner.test.ts`:
    - senza identità → `unauthorized`;
    - senza profilo → `no_profile`;
    - documento altrui → `not_found`;
    - niente `profileId` negli argomenti;
    - un input non valido non viene ripetuto nell'errore.
  - `registry.test.ts`, `isolation.test.ts`, `privacy.test.ts` (§4.7, compresi `kmPairs` e gli argomenti dello scheduler).
  - `convex/devtools.test.ts`: con l'URL di produzione `devtools` e `devOtp` rifiutano.
  - `convex/seed.test.ts`:
    - KPI e aggregati identici tra `ALLDATA` e `pages.byHandle`;
    - km identici riga per riga;
    - `kmPairs` coerenti;
    - seed idempotente.
  - `convex/pages.test.ts`:
    - niente `authUserId`, indirizzi o coordinate delle partenze;
    - un profilo `onboarding` dà `null`;
    - un alias dà `{redirect}`.
  - `convex/activity.test.ts`: annulla di creazione, modifica, cancellazione e lotto; annulla dell'annulla; conflitto; i campi km vengono ignorati.
  - `convex/departures.test.ts`: il primo indirizzo non ricalcola; la correzione ricalcola nel range; le coordinate non escono mai.
  - `convex/geo.test.ts` (`fetch` simulato):
    - User-Agent e parametri;
    - i risultati non POI vengono scartati;
    - chiave di cache hashata;
    - cache usata;
    - coda a 1 richiesta al secondo;
    - limite per profilo.
  - `src/server/oracolo/query.test.ts`: `query_concerts` su `pageToDataset(seed)` dà lo stesso risultato che su `ALLDATA`.
  - `shared/agent/names.test.ts`: nomi unici tra `chatToolDefs` e catalogo.
  - `src/router.test.ts`: nessun client a livello di modulo.
- **Playwright:**
  - `e2e/live.spec.ts`: una pagina anonima si aggiorna quando `devtools:addEntry` aggiunge un concerto;
  - `e2e/http.spec.ts` esteso: un POST cross-site su una server function risponde 403;
  - `e2e/oracolo-sse.spec.ts` (`@gemini`) verde su dati Convex;
  - `parita.spec.ts` verde.
- **Preview:** `check-setup --preview` OK e `/gabrifila` servito da `preview/multiutente`.

**Commit:** `Fase 3.2: dati su Convex con schema Zod unico, builder classificati, km per coppia e Oracolo sui dati Convex`

---

### Traguardo 3: auth e onboarding (ondata A)

**Obiettivo.** L'account nasce al primo login. In produzione si entra solo con Google; l'OTP via email sta dietro configurazione, e in sviluppo c'è il sender di sviluppo. Il traguardo consegna anche la landing, `/benvenuto`, `/privacy` e lo scheletro di `/modifica`.

**Consegne**
- **Componente Better Auth in locale:**
  - schema da `pnpm dlx auth@1.6.33 generate`;
  - plugin `mcp` e `apiKey` inclusi senza condizioni;
  - `/mcp/*` in `disabledPaths` fino al traguardo 7.
- **`convex/auth.ts`:**
  - `baseURL: SITE_URL`;
  - Google con `prompt: "select_account"`;
  - `emailOTP` se `authFlags.emailLogin` (§1.28): 6 cifre, 10 minuti, 5 tentativi, hashato;
  - `oAuthProxy` solo con `OAUTH_PROXY_SECRET`;
  - `apiKey({defaultPrefix:"cgk_", enableSessionForAPIKeys:false, rateLimit:{enabled:false}})`;
  - `deleteUser` abilitato;
  - limiti `otpSendEmail`/`otpSendGlobal` nella callback di invio;
  - `databaseHooks.user.create.before` con `SIGNUP_ALLOWLIST`, se Gabri accetta la domanda 8;
  - trigger `user.onCreate` → profilo `onboarding`.
- **`convex/email.ts`:** Resend via `fetch`, modello in italiano (oggetto "Il tuo codice per Concerti", codice e scadenza), `EMAIL_FROM` predefinito.
- **Altri file Convex:**
  - `convex/devOtp.ts`, con guardia;
  - `convex/authFlags.ts`;
  - `convex/admin.ts`, con `claimProfile` (§5.6);
  - `profiles.completeOnboarding`/`setOnboardingStep` (§1.19);
  - `handleAvailable`, con gli alias.
- **Lato Start:**
  - `src/lib/auth-server.ts`, `auth-client.ts`, `routes/api/auth/$.ts`;
  - il `beforeLoad` di root ottiene il token, chiama `setAuth` sul client della richiesta e imposta `data-auth`;
  - `src/root/providers.tsx` con `ConvexBetterAuthProvider`;
  - `useViewer()` reale;
  - reload completo dopo login e logout;
  - "Esci" nel footer (§1.39).
- **Landing `/`:** "Entra / Crea il tuo sito", con una finestra sopra la landing: Google, più "Entra con email" se `emailLogin`. Per i loggati vale §1.39. C'è anche `/accedi`, e il 308 di `/?chat=`.
- **`/benvenuto`** (TanStack Form), con ripresa da `onboardingStep`:
  1. handle (regex, riservati, disponibilità dal vivo), forma e nome visualizzato → `completeOnboarding` (profilo `active`);
  2. partenze: nome e indirizzo con `src/ui/AddressPicker.tsx` (il componente condiviso, che T5 riusa);
  3. "collega il tuo agente":
     - URL `${origin}/mcp`;
     - istruzioni per Claude, ChatGPT e Claude Code;
     - prompt generato da `shared/agentPrompt.ts`, con handle, forma, regola dei soprannomi ed esempio, scale, nomi delle partenze e "dopo la serata";
     - modello CSV/JSON scaricabile da `importFormat.ts`;
     - uno slot vuoto per l'upload, che riempie T7;
  4. "regalato da": nome e link, con il suggerimento sui soprannomi. Il logo si carica poi in `#regali`;
  5. pagina pronta → `/<handle>`.
- **Handle** (`shared/handles.ts`):
  - regex `^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$`;
  - riservati:
    - quelli di SPEC;
    - `accedi`, `autorizza`, `esci`, `logout`, `well-known`, `static`, `public`, `admin`, `account`, `impostazioni`, `robots`, `sitemap`, `manifest`, `www`, `app`, `aiuto`, `gabrifila`;
    - ogni segmento di primo livello del route tree.
- **`/privacy`:**
  - cookie di auth e `tema`;
  - responsabili del trattamento: Convex EU, Vercel, Google, Gemini, Sentry EU senza IP, PostHog EU senza cookie e senza IP, OSMF/Nominatim;
  - id opaco, pagine pubbliche, esporta ed elimina.
- **`/$handle/modifica`:** guard e le 9 ancore, con un segnaposto per sezione. `#account` ha già "Esci".
- **`.env.example`:** `RESEND_API_KEY`, `EMAIL_FROM` (con il default nel commento), `SIGNUP_ALLOWLIST`, `OAUTH_PROXY_SECRET`, `OAUTH_PROXY_PRODUCTION_URL`.

**Accettazione**
- **Vitest:**
  - `shared/handles.test.ts`: regex; riservati; i due livelli di segmenti di §6; `gabrifila` riservato tranne che per il seed.
  - `convex/auth.test.ts`:
    - il trigger crea un profilo `onboarding`;
    - `completeOnboarding` porta il profilo ad `active` e dà errori leggibili per handle riservati, già presi o alias;
    - con `onboardingStep` da `partenze` a `regali`, la creazione di partenze e "regalato da" riesce;
    - un secondo profilo è impossibile;
    - `claimProfile` cancella il profilo vuoto e rifiuta quello con dati;
    - `SIGNUP_ALLOWLIST` rifiuta le email fuori elenco.
  - `convex/email.test.ts` (`fetch` simulato):
    - payload di Resend e modello;
    - `EMAIL_FROM` predefinito;
    - precedenza tra i sender;
    - `emailLogin` falso senza sender;
    - `otpSendEmail`.
  - `convex/devOtp.test.ts`: con l'URL di produzione rifiuta.
  - `owner.test.ts` esteso: una sessione scaduta o revocata viene rifiutata.
- **Playwright:**
  - `e2e/login-otp.spec.ts`: landing → finestra → OTP letto con `devOtp:latest --env-file` → `/benvenuto`.
  - `e2e/onboarding.spec.ts`:
    - dopo il passo 1, `/<handle>` esiste, vuota e senza errori;
    - passi 2–5 con lo stub;
    - ripresa dopo un reload;
    - a onboarding finito, `/benvenuto` porta a `/modifica`.
  - `e2e/guard-modifica.spec.ts`: visitatore e utente B rediretti; il proprietario vede le 9 ancore.
- **A mano (Gabri), una volta dopo il merge:** login Google sul dev, all'URL tailnet nel browser T3. Poi `admin:claimProfile`.

**Commit:** `Fase 3.3: login con Better Auth (Google, OTP email dietro configurazione), landing, onboarding /benvenuto e /privacy`

---

### Traguardo 4: pagine pubbliche multiutente (ondata A)

**Obiettivo.** Ogni profilo ha la sua pagina:
- etichette secondo la forma;
- token del tema nell'HTML;
- meta, OG, JSON-LD e manifest;
- redirect dei vecchi link;
- switch a tre stati.

**Consegne**
- **Etichette per forma** (`shared/labels.ts`):
  - tabella f/m/n per le etichette marcate per genere:
    - titoli e TOC "Dove sono andato/a", "Quanto sono vicino/a", "Concerti da solo/a";
    - filtro "Da solo/a" e `describeFilters`;
    - Ritratto, legenda del voto 5, descrizione dei commenti;
  - il neutro riformula, per esempio "Dove ho visto concerti";
  - `m` = testi di oggi.
- **`shared/sections.ts`:** etichette per forma e layout del profilo (§1.35).
- **Nome:** `displayName` al posto di "Gabri". Credito e Loop da `profile.extra`.
- **Regole e stati vuoti:** le regole di §1.33; stati vuoti (nessun concerto, solo pianificati, un anno solo) senza `NaN`.
- **Comportamenti di §1.36–1.37:** avvisi solo al proprietario; `kmPending` nell'archivio e nella KPI dei km.
- **Tema** (`shared/theme.ts`):
  - token `accent` (hex), `fontTitoli` (enum di §1.40), `raggi`, `densita`;
  - controllo di contrasto in chiaro e in scuro;
  - preset "predefinito" (identico a oggi) più altri due;
  - `themeCss(tokens)`.
- **OG:** `routes/og/$handle.ts` con nome, numero di concerti, artisti, città e il font titoli del profilo in woff statico. Spike con `@vercel/og`, fallback `satori` + `resvg-wasm`, ultima istanza un PNG statico.
- **Head:** meta, canonical per ambiente, JSON-LD, manifest per profilo (§1.41).
- **Redirect:** `/dati` → 308; alias di handle → 301. Il 308 di `/?chat=` è di T3; qui si testa soltanto.
- **Switch:** "Sul palco · I dati · Modifica" con il CSS a tre segmenti. Lo stato proprietario si scrive dopo il rebase su T3.
- **`parita.spec.ts`:** dal traguardo 4 maschera `.vicalert`, se oggi `gabrifila` ha avvisi.

**Accettazione**
- **Vitest:**
  - `labels`: tre forme; `m` coincide con oggi; nessun participio maschile in `f`/`n`;
  - `theme`: token non validi, contrasto, niente iniezione CSS, enum dei font;
  - `jsonld`;
  - `derive`: per `gabrifila` "dal" 2022 e Milano al 53%; profilo vuoto senza `NaN`;
  - `sections`: una sezione nascosta sparisce dal TOC e `go_to_section` restituisce `ok:false`; i titoli personalizzati vengono rispettati.
- **Playwright:**
  - `e2e/redirect.spec.ts`: `/dati#sec-mappa` → `/gabrifila/dati#sec-mappa`; `/?chat=x` → `/gabrifila?chat=x`;
  - `e2e/seo.spec.ts`:
    - og:title, og:description, og:image, JSON-LD e canonical;
    - `/og/gabrifila` risponde 200 `image/png`;
    - `/gabrifila/manifest.webmanifest` ha `start_url` `/gabrifila`;
    - `Cache-Control` dell'HTML;
  - `e2e/forme.spec.ts`;
  - `e2e/switch.spec.ts`: tre stati per il proprietario, due per gli altri;
  - `e2e/profilo-vuoto.spec.ts`: stati vuoti; sezione nascosta; `kmPending`; avvisi visibili al proprietario e non al visitatore;
  - `e2e/ssr-isolamento.spec.ts`: due SSR concorrenti con sessioni diverse (§6);
  - `parita.spec.ts` verde.
- **Gabri** guarda gli screenshot delle tre forme, dei preset e dei font.

**Commit:** `Fase 3.4: pagine pubbliche per profilo con forma grammaticale, tema nell'HTML, OG/JSON-LD/manifest e redirect dei vecchi link`

---

### Traguardo 8: osservabilità (ondata A)

**Obiettivo.** Sentry su client e server e PostHog senza cookie via `/ingest`. Né indirizzi, né coordinate, né PII, né segreti di URL arrivano a nessuno dei due. I proprietari sono identificati con un id opaco.

**Consegne**
- **Sentry:**
  - `src/client.tsx`, con `instrument.client.ts` importato per primo;
  - `instrument.server.mjs`;
  - `src/server.ts` con `wrapFetchWithSentry`;
  - middleware Sentry in testa a `src/start.ts`;
  - configurazione di §1.12, con `environment` da `__VERCEL_ENV__`;
  - `captureException` in `src/root/errors.tsx`.
- **Scrubbing** (`shared/scrub.ts`), usato da `beforeSend`/`beforeBreadcrumb` di Sentry e da `before_send` di PostHog:
  - chiavi `address|indirizzo|lat|lng|lon|coords|geo…` → `[Filtered]`;
  - stringhe che sembrano coordinate → `[coords]`;
  - breadcrumb `console` e `ui.input` eliminati;
  - via `agentToken`, `authorization`, `x-api-key`, `cgk_…` e i token opachi;
  - lato server, via i valori in memoria dei segreti server;
  - query string tolte dagli URL di §1.12.
- **Build:** plugin Sentry per ultimo in `vite.config.ts` (una riga). Source map `hidden`, cancellate dopo l'upload.
- **PostHog:**
  - `api_host: '/ingest'`, `cookieless_mode: 'always'`, `capture_pageview: 'history_change'`, autocapture spento;
  - replay, sondaggi, heatmap, eccezioni e caricamento di dipendenze esterne disattivati;
  - `person_profiles: 'identified_only'`;
  - `identify(profileId)` a ogni caricamento se il visitatore è il proprietario. Il fallback dipende dallo spike (§9). `reset()` al logout;
  - `disable_compression` solo nel build e2e.
- **Spike:** evento Sentry lato server da una funzione Vercel della preview; `identify` con `cookieless 'always'`.
- **Rebase su T3** prima delle spec su cookie di sessione e `identify`.

**Accettazione**
- **Vitest:** `shared/scrub.test.ts`, con oggetti annidati, eccezioni, breadcrumb, URL con query, `cgk_…`, bearer e il canarino.
- **Playwright** `e2e/osservabilita.spec.ts`:
  - gli unici cookie sono quello di auth e `tema`; PostHog non scrive in `localStorage`;
  - `POST /ingest/e/` passa dal proxy e risponde 200;
  - un pageview per ogni navigazione del router, non di più;
  - un errore provocato arriva al sink Sentry locale (DSN `http://public@127.0.0.1:<porta>/1`) senza IP, header, body, cookie, query string o variabili di stack;
  - con sessione, `identify` porta solo l'id opaco.
- **Sulla preview:**
  - un evento Sentry client e uno server, con stack leggibile;
  - un evento PostHog visibile;
  - dopo qualche giorno, i visitatori unici non collassano in uno solo.

**Commit:** `Fase 3.8: Sentry e PostHog senza cookie, con scrubbing di indirizzi, coordinate, token e URL sensibili`

---

### Traguardo 5: `/<handle>/modifica` (ondata B)

**Obiettivo.** Il proprietario modifica tutto dalla dashboard, con modali e TanStack Form. In più:
- partenze private;
- catalogo venue;
- stile e tema da descrizione;
- registro con Annulla;
- export;
- eliminazione dell'account.

**Consegne**
- **`#concerti`:**
  - elenco e modale derivati dallo schema, con il suggerimento sui soprannomi nel campo `with`;
  - editor dei festival;
  - riquadro "da completare", con gli avvisi di §1.36;
  - venue dal catalogo o nuova (§5.5.4).
- **`#wishlist`.**
- **`#persone`:**
  - aggiungi e rinomina;
  - unisci, con `batchId`;
  - cancella, bloccato se la persona è usata, con l'elenco dei concerti;
  - suggerimento sui soprannomi.
- **`#partenze`:**
  - nome e indirizzo con `AddressPicker`, solo nel client;
  - stato `impostato`/`mancante`;
  - correzione limitata a una al giorno, con l'avviso "una correzione ricalcola i km con un nuovo scarto";
  - rinomina;
  - cancella, bloccato se la partenza è usata;
  - suggerimento "cambiare casa = aggiungere una partenza".
- **`#regali`:**
  - aggiungi, modifica e cancella, con il suggerimento sui soprannomi;
  - logo: `generateLogoUploadUrl` e `setGifterLogo`, che controlla png/jpeg/webp fino a 256 KB, cancella i file rifiutati e il logo precedente;
  - rimozione del logo;
  - limite `logoUpload`;
  - cron per gli upload orfani.
- **`#stile`:**
  - preset, token con anteprima e contrasto, font (§1.40);
  - layout di §1.35;
  - "tema da descrizione":
    - server function Start, solo con la sessione del proprietario;
    - consuma `themeFromDescription` tramite `style.consumeThemeGeneration`;
    - chiama Gemini con output strutturato via `@google/genai`;
    - valida con `shared/theme.ts`, mostra l'anteprima e poi salva;
    - con `E2E=1` e `ORACOLO_FAKE=1` restituisce token fissi.
- **`#attivita`:** elenco con autore (dashboard, Oracolo, MCP, API key, sistema) e Annulla.
- **`#account`:**
  - handle con alias, forma, nome, email;
  - "Esci";
  - esporta JSON nel formato di import (`dashboardOnly`, §1.31);
  - elimina (§5.9).
- **Conferme:** modali per ogni cancellazione.

**Accettazione**
- **Vitest:**
  - `gifters.test`: tipo, dimensione, limite, cancellazioni;
  - `style.test`: token, layout, `themeFromDescription` per profilo e globale;
  - `account.test`: la cascata svuota **ogni** tabella di §5.9 e `venues.createdBy`. L'export non contiene coordinate, `ipHmac`, `writeKeyHash` o `authUserId`;
  - `departures.test`: flusso dei candidati, limite della correzione, cancellazione bloccata;
  - `activity.test`: unione di persone annullata per `batchId`; ricalcolo `sistema` dopo una modifica senza conflitto su Annulla;
  - `people.test`: unione e cancellazione bloccata.
- **Playwright:**
  - `e2e/modifica-concerti.spec.ts`, con due contesti: il proprietario aggiunge, modifica e annulla; il visitatore su `/gabrifila` e `/gabrifila/dati` vede i cambiamenti senza ricaricare;
  - `e2e/partenze.spec.ts`: canarino tramite stub; km calcolato e visibile; il visitatore non vede l'indirizzo;
  - `e2e/stile.spec.ts`, con `ORACOLO_FAKE`: tema da descrizione validato e salvato, messaggio quando si supera il limite;
  - `e2e/account.spec.ts`: export ed eliminazione, compreso il percorso con sessione non recente;
  - `e2e/fughe/pagine.spec.ts`: il canarino (testo, `display_name` dello stub e coordinate) è assente da:
    - l'HTML SSR di tutte le rotte, anche `/modifica` vista dal proprietario;
    - il bundle;
    - le risposte delle query pubbliche;
    - i `convex logs` locali;

    e inoltre:
    - un payload di geocoding malformato non lascia il canarino né nei log né nell'errore;
    - l'indirizzo cercato come venue non diventa una venue e non entra in chiaro nella cache.
- **Gabri** guarda gli screenshot di `/gabrifila/modifica`.

**Commit:** `Fase 3.5: /<handle>/modifica con partenze private, km per coppia, catalogo venue, stile, registro con annulla, export ed eliminazione account`

---

### Traguardo 7: MCP e API (ondata B)

**Obiettivo.**
- `/mcp` con OAuth e API key, gestite in `#agenti`.
- Gli strumenti coprono tutta la dashboard tranne le funzioni `dashboardOnly`, e un test lo verifica.
- Import CSV/JSON dalla dashboard e dall'onboarding.

**Consegne**
- **MCP di Better Auth:**
  - endpoint attivi tranne `/mcp/get-session`;
  - hook `before` che forza `prompt=consent`;
  - il proxy Start manda `/api/auth/mcp/authorize` non autenticato a `/accedi?next=…`;
  - `/autorizza` con l'host del `redirect_uri` ben visibile e header anti-frame;
  - `oidcConfig`: `requirePKCE`, scope `concerti`, access token da 1 ora, refresh da 30 giorni;
  - `dcrGlobal`;
  - cron per i client DCR senza token.
- **Metadati OAuth** dall'origine per ambiente (§1.8):
  - `/.well-known/oauth-protected-resource` (anche con suffisso `/mcp`);
  - `/.well-known/oauth-authorization-server`.
- **`routes/mcp.ts`:**
  - POST: controllo dell'Origin, poi `x-api-key` → Bearer, poi `requireBearerAuth` con `agent.introspect`, poi handler stateless;
  - GET e DELETE → 405;
  - 401 con `WWW-Authenticate`;
  - ogni errore diventa `{code, messaggio}` (§1.25).
- **Helper:** rami `apikey` e `oauth` in `owner.ts`, con `agentWrites`.
- **Strumenti** (dal catalogo; le descrizioni contengono la regola dei soprannomi con l'esempio e le scale):
  - **lettura:**
    - `get_profile`;
    - `list_concerts` (anno, artista, `da_completare`), `get_concert`;
    - `list_people`;
    - `list_departures` (nome più `impostato`/`mancante`);
    - `list_gifters`, `list_wishlist`;
    - `search_venue`;
    - `get_stats`;
    - `list_activity`;
  - **scrittura:**
    - concerti: `add_concert`, `update_concert`, `delete_concert` (`confirm`);
    - persone: `add_person`, `rename_person`, `merge_person`, `delete_person` (`confirm`, bloccato se usata);
    - partenze: `add_departure` (solo il nome), `rename_departure`, `delete_departure` (`confirm`, bloccato se usata);
    - venue: `add_venue` (da un candidato);
    - "regalato da": `add_gifter`, `update_gifter`, `delete_gifter` (`confirm`), `set_gifter_logo` (URL https scaricato lato server con gli stessi controlli; `null` lo toglie);
    - `set_wishlist`;
    - `update_profile` (nome visualizzato, **handle** con alias, **forma**);
    - `set_theme` (preset, token **e layout**: niente `set_layout` separato);
    - `import_concerts` (`confirm` sopra le 10 righe);
    - `undo`;
  - nessuno strumento legge o scrive indirizzi; `departure_address_missing` porta il link `…/<handle>/modifica#partenze`.
- **Import:**
  - `shared/import.ts`: parser papaparse e JSON sul formato di §5.10, errori per riga;
  - `convex/importer.ts`:
    - `preview` valida **tutte** le righe prima di qualunque scrittura e restituisce conteggio ed errori;
    - `apply` scrive a lotti con un solo `batchId`;
    - un fallimento a metà ferma l'import e risponde "importate N di M, annullabili";
    - Annulla per `batchId` funziona anche sul lotto parziale.
- **UI di import:** `src/import/ImportUpload.tsx`, con anteprima, numero di righe e conferma sopra `CONFIRM_IMPORT_ROWS`. Si usa in `#agenti` e nello slot del passo 3 di `/benvenuto`.
- **`#agenti`:**
  - URL MCP e istruzioni (Claude, ChatGPT, `claude mcp add --transport http …`, API key);
  - prompt;
  - API key: mostrata una volta sola, poi elencata e revocabile;
  - client OAuth revocabili;
  - cron per i token scaduti.

**Accettazione**
- **Vitest:**
  - `src/server/mcp/tools.test.ts`:
    - strumenti = catalogo;
    - ogni descrizione di strumenti con nomi di persona (compagni e "regalato da") contiene la regola e "Marco Rossi → Marco R.";
    - ci sono le scale;
    - nessun output contiene `address`, `lat` o `lng`.
  - `registry.test.ts` esteso: ogni funzione owner ↔ operazione del catalogo, oppure `dashboardOnly` con motivo.
  - `convex/agentAuth.test.ts`:
    - API key hashata;
    - chiave disattivata o scaduta rifiutata;
    - token OAuth scaduto rifiutato;
    - A non vede e non modifica B;
    - `dashboardOnly` rifiuta i token: `account.export` e `account.delete` rispondono `solo_dashboard`;
    - un `agentToken` malformato non compare nell'errore.
  - `shared/import.test.ts`:
    - export reimportato = stesso risultato;
    - errori per riga;
    - festival raggruppati;
    - conferma sopra le 10 righe.
  - `convex/importer.test.ts`:
    - nessuna scrittura se una riga non è valida;
    - Annulla di un lotto parziale;
    - import durante l'onboarding (`onboardingStep: agente`).
  - `isolation.test.ts` esteso agli attori agente.
- **Playwright:**
  - `e2e/mcp-apikey.spec.ts`:
    - `add_concert`, `update_concert` e `list_concerts` via JSON-RPC;
    - `list_departures` senza indirizzi;
    - aggiornamento dal vivo;
    - un `x-api-key` su `/api/auth/convex/token` non ottiene un token.
  - `e2e/mcp-oauth.spec.ts`:
    - DCR;
    - authorize con la sessione OTP;
    - il consenso compare **anche senza** `prompt=consent`;
    - `/autorizza` rifiuta l'incorniciamento;
    - PKCE, poi `tools/call`.
  - `e2e/isolamento.spec.ts`: B dalla UI viene rediretto; la chiave di B scrive solo su B; id di A manomessi danno `not_found`; A resta invariata.
  - `e2e/import.spec.ts`: upload in `#agenti` → anteprima → conferma sopra le 10 righe → pagina aggiornata → Annulla del lotto.
  - `e2e/onboarding.spec.ts` esteso: al passo 3 l'import CSV riempie `/<handle>` dal vivo in un secondo contesto.
  - `e2e/fughe/mcp.spec.ts`:
    - tutte le risposte di lettura;
    - una chiamata agente malformata;
    - grep di `convex logs` e degli errori MCP.
- **A mano, a cura dell'agente:** Claude Code su t3node collegato all'URL tailnet `/mcp`, login OTP e consenso nel browser T3, poi una lettura.

**Commit:** `Fase 3.7: server MCP su /mcp con OAuth e API key, strumenti allineati alla dashboard e import CSV/JSON con conferma`

---

### Traguardo 6: Oracolo per pagina (ondata B)

**Obiettivo.**
- L'Oracolo risponde solo sui dati della pagina.
- Ha uno storico pubblico per pagina, con la chiave di scrittura come oggi, e i limiti Convex.
- In `/modifica` ha una modalità di scrittura privata per il proprietario.

**Consegne**
- **TanStack AI 0.71:**
  - tutti i pacchetti insieme;
  - via l'aggiunta manuale del messaggio in `onFinish`, che duplicherebbe le risposte;
  - salvataggio con `ctx.defer`.
- **`/api/chat`:**
  - `forwardedProps.handle`;
  - `pages.byHandle` con il client della richiesta;
  - prompt per profilo: terza persona, forma, nome; via "Camilla"/"Cami <3";
  - `chatToolDefs(vocab)` per profilo;
  - `query_concerts`, `report_unsupported_query` e `web_search` restano server tool, con Google Search in una chiamata annidata separata.
- **Convex:**
  - `httpAction` `/oracolo/turno` e `/oracolo/trascrizione` (§1.25);
  - `beginTurn` interno:
    - limiti di §5.8, con rollback se il turno fallisce;
    - controllo `thread.profileId === page.profileId`;
    - chiave facoltativa con rivendicazione al primo turno con chiave;
    - visibilità.
  - `listThreads`/`getThread` solo sui thread `pubblica`; `me.chatThreads` per quelli privati;
  - cron TTL a 90 giorni.
- **ChatWidget:**
  - storico con `useQuery`;
  - `/api/chat/history` sparisce;
  - le conversazioni possedute portano l'`handle` (quelle vecchie valgono come `gabrifila`);
  - link `/<handle>?chat=<id>`;
  - i messaggi riconosciuti da `friendlyError` restano uguali.
- **Modalità scrittura** (§1.27):
  - sessione verificata con `getToken()` e handle del proprietario;
  - Origin della stessa origine;
  - strumenti del catalogo con `as: "oracolo"`;
  - niente `web_search`;
  - cancellazioni e import sopra le 10 righe con `needsApproval`;
  - prompt con la regola dei soprannomi e l'esempio;
  - thread `proprietario`.
- **Pulizia:**
  - via `@upstash/*`;
  - `.env.example` perde le variabili chat di Netlify ormai inutili;
  - `ORACOLO_FAKE=1` funziona solo con `E2E=1`.

**Accettazione**
- **Vitest** `src/server/oracolo/*.test.ts` (`fakeText`):
  - prompt con forma e nome;
  - vocabolario per profilo;
  - una sola risposta salvata;
  - nessun indirizzo nell'output;
  - in scrittura il prompt contiene la regola e `web_search` non è tra gli strumenti;
  - nomi unici tra `chatToolDefs` e gli strumenti del catalogo in scrittura.
- **Vitest** `convex/chat.test.ts`:
  - Authorization sbagliata → 401, e il segreto non compare mai negli errori;
  - limiti con rollback e riserva per `gabrifila`;
  - chiave sbagliata → "appartiene";
  - un thread legacy senza chiave viene rivendicato dal primo turno con chiave;
  - un `threadId` di `/a` continuato con handle `b` viene rifiutato;
  - le query pubbliche non espongono hash e IP e non elencano i thread `proprietario`;
  - TTL;
  - una funzione indirizzi chiamata con `as: "oracolo"` → `solo_dashboard`.
- **Playwright:**
  - `e2e/oracolo.spec.ts` (`fakeText`): `/a` non compare nello storico di `/b`; ripresa con la chiave; un estraneo legge ma non scrive; messaggio del limite;
  - `e2e/oracolo-scrittura.spec.ts`:
    - aggiunta dal vivo;
    - la cancellazione chiede l'approvazione;
    - in `#attivita` l'autore è "Oracolo";
    - senza Origin la richiesta viene rifiutata;
  - `e2e/oracolo-sse.spec.ts` (`@gemini`): una domanda reale per pagina;
  - `e2e/fughe/oracolo.spec.ts`:
    - alla domanda sull'indirizzo, l'SSE non contiene il canarino;
    - il proprietario **scrive** il canarino nella chat in modalità scrittura, e il canarino non compare in `listThreads`, `getThread` o nell'SSR pubblico di `/<handle>?chat=<id>`.

**Commit:** `Fase 3.6: Oracolo per pagina su Start con storico e rate limit in Convex e modalità scrittura privata per il proprietario`

---

### Traguardo 9: migrazione (dry-run), documentazione e giro finale

**Obiettivo.** Lo script di migrazione è provato solo in dry-run e i documenti sono aggiornati. C'è un giro completo in locale e sulla preview, con il riepilogo per Gabri.

**Consegne**
- **`scripts/migra-storico-chat.mjs`:**
  - legge `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN_RW` da fnox;
  - usa la REST via `POST`, con array JSON di comandi (`["GET", key]`);
  - allowlist di sola lettura su `array[0]` (`GET`, `MGET`, `ZRANGE`, `ZCARD`, `HGET`, `HMGET`, `HGETALL`, `PTTL`); qualunque altro comando lancia un errore prima della rete;
  - niente `Redis.fromEnv()`, niente `SCAN`/`KEYS`;
  - legge solo `concerti:chat:log:index`, poi per ogni id valido secondo `THREAD_ID_RE` il record, `titles`, `keys`, `authors` e `PTTL`. Il namespace `preview:` non si tocca;
  - converte ogni conversazione: stesso `threadId`, `title`, `author`; chiave → SHA-256 (o assente); IP scartato; `expiresAt` dal TTL; `visibility: "pubblica"`; profilo `gabrifila`;
  - `--dry-run` di default: stampa conteggi, errori e dimensioni, mai chiavi, IP o testi;
  - `--apply --deployment <nome>` chiama `migrations:importChatThreads` (`convex/migrations.ts`, interna, idempotente); in Fase 3 **non si esegue**.
- **Prima del dry-run reale** l'orchestratore scrive a Gabri: "sola lettura su Upstash di produzione: l'indice più circa 25 record, solo conteggi".
- **`CLAUDE.md`**, punto per punto:

  | Punto di oggi | Nel nuovo CLAUDE.md |
  |---|---|
  | Intestazione "Vite 8 + React 19 + TypeScript 7" | TanStack Start (SSR) su Vercel, dati in Convex EU, Better Auth; pnpm only |
  | "Concert data lives in `src/data.ts`… App code in `src/App.tsx`" | i dati stanno in Convex e si scrivono da dashboard, MCP o import; `shared/seed/gabrifila.ts` è solo seed e fixture; mappa delle cartelle (§3) |
  | Modello concerto/festival | resta, con i percorsi `shared/model/` e la tabella `entries` |
  | Scale, `VICINANZA_LABELS`, `VIC_ORDER` | restano (`shared/model/`); in più `CANZONI_NOTE_LABELS` è la fonte unica (4 = "Molte", non "Quasi tutte") |
  | `KpiDots` | resta, con il percorso nuovo; avvisi di manutenzione solo per il proprietario |
  | `comments`, `sec-commenti`, `SECTIONS` in `src/chat/tools.ts` | restano; `SECTIONS` sta in `shared/sections.ts`; il layout può nascondere o rinominare sezioni (`go_to_section` → `ok:false`) |
  | "Verify with `pnpm build`" | `pnpm build` e `pnpm vitest run` prima di ogni commit; `pnpm e2e`, `pnpm e2e:preview`; varianti `:lock` e regole sulle risorse |
  | "Deploys are git-driven… Netlify" | Vercel: dopo lo switch, push su `main` → produzione; branch → preview con Convex `preview/<branch>`; `fase3/*` non buildati; mai deploy manuali, mai `convex deploy` in locale |
  | "Open a PR and wait for Netlify's bot" | tolta: la preview è l'URL del branch su Vercel, protetto; lo stato `ready` si legge con l'API Vercel |
  | "On the `multiutente` branch… Netlify paused" | tolta (assorbita sopra) |
  | `preview-shot.mjs` con il workaround TLS/fetch | caricamento diretto; bypass solo verso l'origine della preview; mappa viva = tile `vector.pbf` con 200 e nessun 403 |
  | curl su `/api/chat` e controllo `preview:` di `/api/chat/history` | `/api/chat` resta (SSE, `TOOL_CALL_*`); lo storico è per deployment in `chatThreads`, verificato con `chat.listThreads`; niente namespace |
  | Netlify API e site id | tolta |
  | "A new venue/city needs coordinates in `VENUE_COORDS`/`CITY_COORDS`" | catalogo venue in Convex, geocodificato con Nominatim (dashboard o `search_venue`/`add_venue`); nessuna coordinata a mano; venue immutabili |
  | Ricetta dei km con le coordinate di casa | km solo in Convex (`convex/lib/km.ts`, `kmPairs`); resta la spiegazione del jitter; le coordinate di casa **si tolgono** |
  | "`VITE_MAPBOX_TOKEN` set in Netlify" | fnox più Vercel (Production e Preview); token limitato per URL |
  | Oracolo: `netlify/functions/chat.mts`, Upstash, `concerti:chat:log:*` | `routes/api/chat/`, `src/server/oracolo/`, `chatThreads`, modalità scrittura privata, `set_visitor_theme`, limiti in `convex/rateLimits.ts` |
  | TS volutamente lasco in `App.tsx` | vale per i moduli usciti da `App.tsx` |
  | (nuovo) | Convex nei worktree: `convex-locale.mjs`, `wt exec`, `--env-file .env.worktree`; regole di §4.2 |
  | (nuovo) | partenze private, regola dei soprannomi, classificazione via builder e registro |

- **Altri documenti:**
  - `.claude/skills/add-concert-data/SKILL.md`: stesso flusso di domande, ma scrive con `add_concert`/`update_concert`, con il collegamento MCP come prerequisito; niente più `data.ts` né km a mano;
  - `.env.example`: controllo finale contro §10;
  - `DECISIONI.md`: sezione "Decisioni della Fase 3", con le scelte di §1, le deroghe §1.43–1.45 e gli esiti degli spike;
  - `docs/multiutente/SWITCH.md`: la checklist di §12.
- **Giro finale:**
  - tutto Vitest e tutta la matrice Playwright di §8;
  - `e2e/fughe/osservabilita.spec.ts`:
    1. il proprietario scrive il canarino in `/modifica#partenze`;
    2. si provoca un errore client e si invia un evento PostHog;
    3. si ispezionano il sink Sentry e i payload `/ingest`;
  - `e2e/screenshot.spec.ts`: landing, `/gabrifila`, `/gabrifila/dati` e `/gabrifila/modifica`, in chiaro/scuro e desktop/mobile: 16 PNG in `e2e-shots/`;
  - push, preview `ready`, `check-setup --preview`, poi `pnpm e2e:preview` (§8.4);
  - riepilogo con:
    - cosa è fatto;
    - cosa non passa, con l'output;
    - le esclusioni sulla preview con la loro sostituzione;
    - la checklist dello switch.

**Accettazione**
- **Vitest:**
  - `scripts/migra-storico-chat.test.ts`:
    - un comando di scrittura viene rifiutato;
    - gli id non validi vengono scartati;
    - niente `SCAN`;
    - conversione corretta, chiave hashata compresa;
    - il dry-run non chiama mai Convex;
  - `convex/migrations.test.ts`:
    - import idempotente;
    - `threadId`, titolo e autore conservati;
    - un thread senza chiave resta rivendicabile.
- **Dry-run reale:** circa 25 conversazioni, 0 errori.
- **Fughe:** tutte le spec di `e2e/fughe/` verdi in locale; sulla preview, l'equivalente di §8.4.

**Commit:** `Fase 3.9: script di migrazione dello storico chat (solo dry-run), CLAUDE.md, skill add-concert-data, .env.example e DECISIONI aggiornati`

## 8. Test

### 8.1 Matrice (PROMPT.md → file → traguardo)

**Vitest**

| Richiesta | File | Traguardo |
|---|---|---|
| Ricetta km, jitter in [0.95, 1.07], mai ripetuto | `convex/lib/km.test.ts` | 2 |
| Helper di proprietà | `owner`, `isolation`, `registry`, `privacy` | 2, poi 3 e 7 |
| Handle riservati | `shared/handles.test.ts` | 3 |
| Etichette nelle tre forme | `shared/labels.test.ts` | 4 |
| Parità delle statistiche tra statico e seed | `kpis.test.ts`, `seed.test.ts` | 1, 2 |
| Schema Zod | `schema.test.ts`, `import.test.ts` | 2, 7 |

**Playwright**

| Richiesta | File | Traguardo |
|---|---|---|
| Landing → login OTP | `e2e/login-otp.spec.ts` | 3 |
| Google a mano, una volta | browser T3 (Gabri) | 3 |
| Onboarding → la pagina si riempie | `e2e/onboarding.spec.ts` | 3, poi 7 |
| Aggiungi, modifica, annulla → visibile senza ricaricare | `modifica-concerti.spec.ts`, `live.spec.ts` | 5 (2) |
| Il secondo utente non scrive (UI, MCP/API); il visitatore viene rediretto | `guard-modifica.spec.ts`, `isolamento.spec.ts` | 3, 7 |
| MCP con API key | `e2e/mcp-apikey.spec.ts` | 7 |
| Controllo fughe | `e2e/fughe/{pagine,mcp,oracolo,osservabilita}.spec.ts` | 5, 7, 6, completo in 9 |
| Redirect | `e2e/redirect.spec.ts` | 4 |
| OG e JSON-LD | `e2e/seo.spec.ts` | 4 |
| Mappa viva (tile) | `e2e/mappa.spec.ts` | 1 |
| Screenshot | `parita.spec.ts`, `screenshot.spec.ts` | 1, 9 |

**Test aggiunti dal piano:**
- **Vitest:** `dates`, `filters`, `dataset`, `derive`, `sections`, `theme`, `jsonld`, `scrub`, `chat`, `agentAuth`, `account`, `gifters`, `people`, `style`, `activity`, `geo`, `pages`, `devtools`, `email`, `importer`, `migrations`, `names`, `router`, `query`, `migra-storico-chat`.
- **Playwright:** `tema`, `http`, `live`, `forme`, `switch`, `profilo-vuoto`, `ssr-isolamento`, `partenze`, `stile`, `account`, `import`, `mcp-oauth`, `oracolo`, `oracolo-scrittura`, `osservabilita`, `parita`.

### 8.2 Controllo fughe

- **Canarino** (`e2e/helpers/canarino.ts`, traguardo 2):
  - indirizzo "Via dei Canarini 7, Genova";
  - il `display_name` dello stub, diverso dal testo scritto;
  - coordinate `44.4123456, 8.9345678`.
- **Cosa si cerca:**
  - testo e `display_name`, anche URL-encoded e JSON-escaped;
  - coordinate a 4, 5 e 7 decimali, con punto e con virgola;
  - le coordinate di casa di Gabri, lette al momento da `git show main:CLAUDE.md` e mai riscritte;
  - in memoria, i valori di `CHAT_SERVER_SECRET`, della API key di prova e del segreto di bypass.
- **Dove si cerca:**
  - HTML SSR da visitatore e da proprietario;
  - JS e CSS del build;
  - risposte delle query pubbliche;
  - risposte MCP ed errori;
  - SSE dell'Oracolo;
  - `listThreads`/`getThread`;
  - envelope di Sentry, client e server;
  - payload `/ingest`;
  - `convex logs`.
- **Casi provocati:**
  - payload di geocoding malformato (traguardo 5);
  - chiamata agente malformata (traguardo 7);
  - canarino scritto nella chat in modalità scrittura (traguardo 6);
  - errore client e evento PostHog con il canarino sullo schermo (traguardo 9).

### 8.3 Comandi

| Comando | Cosa fa |
|---|---|
| `pnpm vitest:lock` | tutti i progetti Vitest, sotto lock |
| `pnpm e2e` | Playwright locale, con `wt exec`, lock e controllo della memoria; mai sul dev condiviso |
| `pnpm e2e:preview` | stessa suite contro `PREVIEW_URL` (l'URL del branch), progetto `preview` (§8.4) |

### 8.4 Giro sulla preview (stessi punti di PROMPT.md)

- **Bypass:**
  - si aggiunge solo con `page.route` sull'origine della preview, alla prima navigazione, con `x-vercel-set-bypass-cookie: true`; dopo basta il cookie;
  - nelle chiamate API (MCP) va solo verso quell'origine;
  - mai `extraHTTPHeaders`;
  - trace e video spenti; i report non si allegano al riepilogo.

| Punto di PROMPT.md | Sulla preview | Sostituzione e motivo |
|---|---|---|
| Landing → login OTP | sì: OTP da `convex run --deployment preview/multiutente devOtp:latest`, a cura dell'orchestratore | – |
| Onboarding → la pagina si riempie | sì, con l'import CSV al passo 3 | niente stub Nominatim: si scrive il canarino e Nominatim vero riceve una richiesta; se non ci sono candidati, `devtools:setDepartureForTest` salva il canarino |
| Aggiungi, modifica, annulla dal vivo | sì | – |
| Secondo utente (UI, MCP) e visitatore rediretto | sì, con utenti OTP `e2e-a`/`e2e-b`, cancellati alla fine con `devtools:cleanupE2E` | – |
| MCP con API key | sì | – |
| Fughe: SSR, bundle, query, MCP, SSE | sì | – |
| Fughe: Sentry client | sì: `page.route` intercetta gli envelope verso Sentry, li ispeziona e risponde 200 senza inoltrarli | – |
| Fughe: Sentry server | no: non si può intercettare | l'orchestratore cerca il canarino nell'evento server di prova dell'ambiente preview, con l'API/MCP di Sentry |
| Fughe: PostHog | sì: si intercetta `/ingest` dal browser, si decomprime (gzip), si ispeziona e si lascia proseguire | – |
| Fughe: log Convex | sì: `convex logs --deployment preview/multiutente` in sola lettura, nella finestra del test | – |
| Oracolo | solo `@gemini` (una domanda per pagina, più un'aggiunta e un annulla in scrittura) | `ORACOLO_FAKE` non esiste mai su Vercel: le spec con `fakeText` restano locali |
| Redirect, OG/JSON-LD, manifest, header di sicurezza | sì (gli header di `vercel.json` si verificano solo qui) | – |
| Mappa viva | sì: tile `vector.pbf` con 200 e nessun 403, sull'URL del branch | – |
| Screenshot | sì: 16 PNG in `e2e-shots/preview/` | – |
| Parità con `main` | no: servono `E2E_NOW` e la build di `main` | testi KPI di `/gabrifila` confrontati con `computeKpis` alla data del giorno |

Il riepilogo finale elenca queste esclusioni.

## 9. Spike programmati

Si fanno all'inizio del traguardo indicato. La corsia riporta l'esito e l'orchestratore lo scrive in DECISIONI.

| Spike | Traguardo | Fallback |
|---|---|---|
| Build Start + Nitro sulla preview, SSE da `dub1` | 1 | correzioni di configurazione; è bloccante |
| `git.deploymentEnabled` con il glob `fase3/*` | 1 | Ignored Build Step per branch (chiedere a Gabri) |
| `convex deployment create <team>:concerti-gabri:local` e `--env-file` | 2 | spostamento delle righe da `.env.local` a `.env.worktree` |
| `--preview-run` con una funzione `internal` | 2 | `seed:ensure` pubblica protetta da segreto, oppure seed manuale controllato da `check-setup --preview` |
| User-Agent e `setTimeout` nelle action Convex | 2 | `"use node"` |
| `@vercel/og` in Nitro/Vercel | 4 | `satori` + `resvg-wasm`, poi un PNG statico |
| `routeRules` `/ingest` in dev e sulla preview | 8 | rewrite in `vercel.json` più un `server.proxy` dedicato |
| Evento Sentry dal server di una funzione Vercel della preview | 8 | `instrument.server.mjs` iniettato con `--import` o a runtime |
| `identify` di PostHog con `cookieless_mode: 'always'` | 8 | id del profilo come sola proprietà dell'evento |
| SDK MCP v2 con Claude Code | 7 | `@modelcontextprotocol/sdk` 1.32.1 |
| Hook oidc di `convex()` con `mcp()` in authorize | 7 | gate nel proxy Start (già previsto) |

## 10. Variabili d'ambiente nuove (solo nomi)

| Variabile | fnox | Vercel | Convex | Note |
|---|---|---|---|---|
| `CHAT_SERVER_SECRET` | ✓ | Preview (Production allo switch) | dev, preview predefinite, `preview/multiutente`, locali (prod allo switch) | generata dall'agente; header verso le `httpAction`; base HKDF per l'HMAC degli IP (nessuna variabile separata) |
| `AUTH_DEV_OTP` | – | – | dev, locali, preview predefinite = `1`; **mai** prod | il codice la rifiuta in prod |
| `NOMINATIM_URL` | – | – | facoltativa (default OSM); stub nei locali | DECISIONI |
| `RESEND_API_KEY`, `EMAIL_FROM` | – (per ora) | – | – (per ora) | default di `EMAIL_FROM` nel codice: `Concerti <notifications@concerti.gabrifila.me>` |
| `SIGNUP_ALLOWLIST` | – | – | prod allo switch, se accettata (domanda 8); assente = registrazione aperta | email separate da virgola |
| `OAUTH_PROXY_SECRET`, `OAUTH_PROXY_PRODUCTION_URL` | ✓ (il primo) | – | prod e preview predefinite, **allo switch** | §1.43 |
| `PREVIEW_URL` | – | – | – | solo per `pnpm e2e:preview` in locale |
| `E2E`, `E2E_NOW`, `ORACOLO_FAKE`, `VITE_E2E` | – | **mai** | – | solo nei comandi di test locali |

- Ogni traguardo aggiunge i suoi nomi a `.env.example`, con un commento (§4.5).
- `VITE_SITE_URL` resta. Sul server, l'origine assoluta si ricava dall'ambiente (§1.8).

## 11. Rischi

| Rischio | Mitigazione |
|---|---|
| Un agente raggiunge la produzione (`CONVEX_DEPLOYMENT` e `*_PROD` nell'ambiente di sessione, CLI loggata) | regole di §4.2 in ogni brief; `wt exec` che ripulisce l'ambiente e rifiuta gli argomenti pericolosi; domanda 9 di §12 |
| Dati di test sul dev condiviso | `--env-file .env.worktree` ovunque; `globalSetup` su `127.0.0.1`; `pnpm dev`/`e2e` rifiutano senza `WT_ENV` |
| Start appena stable, Nitro v3 beta, Sentry beta | versioni esatte; spike sulla preview dal traguardo 1; push dopo ogni traguardo |
| Better Auth fermo a 1.6; `mcp()` rimosso in 1.7 | override; il passaggio a `@better-auth/mcp` è lavoro futuro |
| `mcp()` 1.6 con DCR aperta | consenso forzato in Better Auth e nel proxy; e2e dedicato; `get-session` spento; scadenze corte; limiti e pulizia della DCR |
| Media dei km con estrazioni ripetute | `kmPairs` per sempre; venue immutabili; correzioni a una al giorno |
| Il deployment `preview/multiutente` viene ricreato o ripulito | `--preview-run seed:ensure`; variabili predefinite delle preview; `check-setup --preview`; schema additivo; `devtools:reset` |
| Fuga di dati tra richieste SSR concorrenti | client per richiesta, `no-store`, test con due sessioni |
| Segreti negli errori di validazione | segreto in header, validazione nell'handler, errori tradotti, scrub |
| Idratazione (fuso orario, `localStorage`) | `now` iniettato, cookie, `ClientOnly`, controllo console |
| Parità pixel instabile | `reducedMotion`, orologio congelato, maschere; il cancello vero sono i testi dei KPI |
| Nominatim blocca gli IP AWS di Convex | `NOMINATIM_URL` intercambiabile, errore "riprova", cache delle venue |
| La rewrite CDN di `/ingest` perde l'IP | verifica sulla preview; in alternativa proxy via funzione con `X-Forwarded-For` |
| OOM con le corsie | §4.4: lock su build, e2e e vitest; nessun server acceso a vuoto; soglia di `MemAvailable` |
| Iscrizioni aperte che consumano le quote condivise | allowlist (domanda 8), riserva dell'Oracolo per `gabrifila`, limiti per profilo |
| Connettori Claude.ai/ChatGPT veri non raggiungibili | Claude Code su t3node; i test reali dopo lo switch |

## 12. Domande aperte e cosa serve da Gabri

**Domande.** Se Gabri non risponde, il piano procede con la proposta indicata.

1. **Credito "supporto di Cami" e link Loop.** Proposta: campi opzionali del profilo, solo su `gabrifila`, modificabili in `#stile`.
2. **Export.** Proposta: include il testo degli indirizzi, mai le coordinate. È solo da dashboard: nessun token agente può chiamarlo.
3. **Eliminazione dell'account solo da dashboard**, anche se SPEC dice "agenti: tutto tranne gli indirizzi". Proposta: sì.
4. **Coordinate di casa nella repo pubblica.** Il traguardo 9 le toglie da `CLAUDE.md`, ma restano nella storia git. Opzioni:
   - (a) accettare;
   - (b) rendere privata la repo;
   - (c) riscrivere la storia, con un force-push su `main` che può fare solo Gabri.

   Non blocca il lavoro.
5. **Claude.ai e ChatGPT veri prima dello switch.** Servirebbe esporre il dev con Tailscale Funnel. Proposta: aspettare lo switch.
6. **Forma neutra.** Le riformulazioni si rivedono sugli screenshot; non blocca il lavoro.
7. **Conversazioni dell'Oracolo in modalità scrittura.** Proposta: private, visibili solo a te in `/modifica`, mai nello storico pubblico, perché lì si scrivono dati personali.
8. **Chi può creare una pagina.** Con il login Google chiunque potrebbe aprire una pagina pubblica su `concerti.gabrifila.me` e consumare le quote comuni. Proposta: `SIGNUP_ALLOWLIST` in produzione con le email degli amici; dev e preview restano aperti.
9. **Protezione della produzione dagli agenti** (solo Gabri può cambiare la configurazione). Proposta:
   - (a) un blocco PreToolUse per `convex deploy`, `--prod`, `brave-chickadee` e `vercel --prod`;
   - (b) spostare le voci `*_PROD` di fnox in un profilo caricato solo a richiesta.

   Senza, valgono solo le difese di §4.2.
10. **Correzione dell'indirizzo al massimo una volta al giorno per partenza** (§1.22). Proposta: sì.

**Cosa serve da Gabri, in ordine**
1. **Ora:** approvare il piano e rispondere alle domande 1–10, oppure accettare le proposte.
2. **Dopo il traguardo 1:** guardare le 8 coppie di screenshot di parità.
3. **Prima dell'ondata A**, nella Google Auth Platform:
   - aggiungere l'origine e il redirect `https://concerti-gabri-git-multiutente-gabrifilas-projects.vercel.app/api/auth/callback/google`;
   - confermare quello del tailnet (lo verifica `check-setup`).
4. **Dopo il traguardo 3:** un login Google sul dev, all'URL tailnet nel browser T3; poi l'agente lega `gabrifila` al tuo account. Facoltativamente, lo stesso sulla preview.
5. **Dopo il traguardo 4:** etichette f/m/n, preset e font sugli screenshot.
6. **Dopo i traguardi 5 e 9:** screenshot di `/modifica` e i 16 finali (più quelli della preview).
7. **PostHog,** in Project Settings: "Cookieless server hash mode" **e** "Discard client IP data" su ON. `check-setup` non può leggerli con la chiave di progetto.
8. **Prima del dry-run reale della migrazione:** OK alla lettura di Upstash di produzione (sola lettura: l'indice più circa 25 record, solo conteggi).
9. **La sera:** OK a saltare lo spegnimento di Ripple se un'ondata sfora le 22:00.

**Allo switch, fuori dalla Fase 3** (`SWITCH.md`, in quest'ordine):
1. **Env di Convex prod:**
   - `CHAT_SERVER_SECRET`, `OAUTH_PROXY_SECRET`, `OAUTH_PROXY_PRODUCTION_URL` e, se accettata, `SIGNUP_ALLOWLIST`;
   - mai `AUTH_DEV_OTP`;
   - `SITE_URL` resta quello `vercel.app` fino al DNS.

   Impostarle prima del deploy non ha effetti: il codice che le legge non c'è ancora.
2. **`CHAT_SERVER_SECRET` su Vercel Production,** prima del primo build di produzione: le variabili Vercel valgono solo per i deploy nuovi.
3. **Merge di `multiutente` su `main`** (PR).
4. **Togliere l'Ignored Build Step:** parte il deploy di produzione su `concerti-gabri.vercel.app`, e Convex prod riceve schema e funzioni. `gabrifila` è già riservato nel codice.
5. **`seed:ensure` su prod.**
6. **Login Google** di Gabri su `concerti-gabri.vercel.app`.
7. **`admin:claimProfile`** per `gabrifila`.
8. **Indirizzi reali in `#partenze`:** i km legacy restano, quelli in attesa si calcolano.
9. **Migrazione dello storico:** dry-run, poi `--apply --deployment prod`.
10. **Google:** controllare il redirect `https://concerti.gabrifila.me/api/auth/callback/google`, già configurato nella Fase 1.
11. **Dominio** `concerti.gabrifila.me` su Vercel, DNS su Cloudflare (modifica pubblica: serve l'OK di Gabri), poi `SITE_URL=https://concerti.gabrifila.me` su Convex prod.
12. **Rilanciare la migrazione,** che è idempotente: recupera le chat scritte da Netlify fino al cambio DNS.
13. **Verificare oAuthProxy:** login Google da una preview di un altro branch (§1.43).
14. **Chiudere Upstash e Netlify:**
    - togliere `netlify.toml` e `netlify/`;
    - togliere `UPSTASH_*` da fnox;
    - Resend resta facoltativo (DECISIONI).
