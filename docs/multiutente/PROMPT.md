ultracode

Trasformiamo concerti-gabri in un servizio multiutente. La specifica completa e
vincolante è in `docs/multiutente/SPEC.md`: leggila tutta prima di fare qualsiasi
cosa, insieme a `CLAUDE.md` e al codice attuale (`src/`, `netlify/functions/`).
Dove SPEC.md e il codice divergono vince SPEC.md; dove SPEC.md tace, conserva il
comportamento attuale. Lavori su un clone locale, su un branch dedicato
(`multiutente`: se non esiste crealo dal branch corrente, quello che contiene
`docs/multiutente/`, non da `main`). L'interfaccia resta in italiano.

Il lavoro ha tre fasi, in quest'ordine. Non passare alla fase successiva finché
quella corrente non è chiusa.

## Regole fisse (valgono in tutte le fasi)

- **Segreti**: non chiedermeli mai in chat e non stamparli mai nell'output. Li
  inserisco io in `.env.local` (gitignored), con `npx convex env set` e con
  `vercel env add`. Tu verifichi solo che esistano e funzionino. Tieni aggiornato
  `.env.example` con nomi e commenti, senza valori.
- **Niente produzione**: non fare push su `main`, non deployare in produzione, non
  toccare il DNS di `concerti.gabrifila.me` (resta su Netlify, che è in pausa) e
  non cancellare nulla su Upstash. Push solo sul branch di lavoro.
- **Coordinate di casa**: gli indirizzi di partenza e le loro coordinate non
  devono mai finire nel bundle client, nell'HTML SSR, nelle risposte di
  MCP/API/Oracolo o nei log di Sentry e PostHog. Il calcolo dei km avviene solo
  lato server, con la ricetta e il jitter di CLAUDE.md.
- Prima di ogni commit: `pnpm build` e `pnpm vitest run` devono passare.
  Commit piccoli, uno per traguardo, con messaggi descrittivi in italiano.
- Fermati e chiedimi solo per decisioni non coperte da SPEC.md o per passi che
  posso fare solo io. Il resto decidilo tu, seguendo la specifica.

## Fase 1 — Setup esterno guidato (interattivo, niente workflow multi-agente)

Guidami un servizio alla volta, nell'ordine qui sotto. Per ogni servizio:
1. dimmi esattamente cosa fare, con URL, nomi dei campi e valori da inserire,
   verificando sulla documentazione ufficiale attuale (le UI cambiano);
2. dimmi quali variabili creare e dove: `.env.local`, env di Convex (dev e
   prod) o env di Vercel (Preview e Production);
3. aspetta la mia conferma prima di passare al servizio successivo.

Ordine (le dipendenze lo impongono):
1. **Strumenti locali**: Node, pnpm, Vercel CLI, Convex CLI (via `npx`) e
   Chromium per Playwright (in locale puoi usare `pnpm exec playwright install
   chromium`).
2. **Convex**: login, progetto, deployment dev (`npx convex dev`) e prod, deploy
   key di produzione e di preview per Vercel.
3. **Vercel**: progetto collegato alla repo GitHub `gabrifila/concerti-gabri`,
   preset TanStack Start, `vercel link` in locale e production branch `main`
   (finché non si fa il merge, ogni deploy è una preview). Integra il build
   Convex (`npx convex deploy --cmd …`) con le deploy key. Per ora nessun dominio
   custom: si usa l'URL `*.vercel.app`.
4. **Better Auth**: `BETTER_AUTH_SECRET` (generato da me in locale), URL del
   sito e trusted origins (localhost, URL Vercel di produzione, preview,
   `concerti.gabrifila.me`), impostati dove li legge il componente
   `@convex-dev/better-auth`.
5. **Google OAuth**: progetto Google Cloud, consent screen (External,
   pubblicato in produzione, solo gli scope `email`, `profile` e `openid`) e
   client Web. Origini autorizzate e redirect URI per localhost, produzione
   Vercel e `concerti.gabrifila.me`. Le preview passano dal plugin oAuthProxy di
   Better Auth, perché Google non accetta wildcard.
6. **Resend**: dominio di invio `concerti.gabrifila.me` (regione EU), record DNS
   da aggiungere io sul provider DNS di `gabrifila.me` (sono solo sotto-nomi,
   non toccano il record del sito) e verifica. API key con solo permesso di
   invio. Mittente `notifications@concerti.gabrifila.me`.
7. **Mapbox**:
   - token `pk.` pubblico ristretto per URL (localhost, domini Vercel,
     `concerti.gabrifila.me`) per la mappa;
   - token separato server-only per il geocoding.

   Controlla i termini attuali sulla **memorizzazione** dei risultati di
   geocoding: salviamo coordinate di venue e di indirizzi, quindi potrebbe
   servire il geocoding permanente. Dimmi costi e implicazioni prima di
   scegliere.
8. **Sentry**: progetto per TanStack Start (SDK ufficiale se esiste, altrimenti
   React + Node), regione EU se disponibile, DSN e auth token per caricare le
   source map da Vercel.
9. **PostHog**: progetto in EU Cloud, modalità **senza cookie** (attiva
   l'impostazione di progetto che serve), session replay disattivato, host per
   il reverse proxy `/ingest`.
10. **Gemini**: riusa la chiave e il modello attuali (vedi `.env.example`),
    spostandoli in env Vercel/locale.
11. **Upstash**: solo credenziali **read-only**, per la migrazione futura dello
    storico chat. Nessuna scrittura.

## Fase 2 — Verifica del setup

Scrivi `scripts/check-setup.mjs` (ripetibile, senza stampare segreti) che
verifica ogni servizio con una chiamata reale e stampa una tabella OK/KO con il
motivo:
- **Convex**: deployment raggiungibile e variabili attese presenti (solo i nomi).
- **Vercel**: `vercel env ls` contiene tutte le variabili attese per Preview e
  Production.
- **Better Auth**: segreto presente e di lunghezza sufficiente, trusted origins
  coerenti.
- **Google**: il client id è valido. La richiesta di autorizzazione non deve
  restituire `invalid_client` o `redirect_uri_mismatch` per l'URI locale.
- **Resend**: dominio `concerti.gabrifila.me` in stato verified. Invio di
  un'email di prova al mio indirizzo da `notifications@concerti.gabrifila.me`,
  che io confermo di aver ricevuto.
- **Mapbox**:
  - il token pubblico carica lo stile con `Origin: http://localhost:<porta>`;
  - il token server geocodifica "Forum di Assago";
  - il token pubblico usato da un'origine non ammessa viene rifiutato.
- **Sentry**: evento di prova inviato, che io confermo di vedere.
- **PostHog**: evento di prova accettato (200), senza cookie impostati.
- **Gemini**: una chiamata minima con il modello configurato risponde.
- **Upstash**: lettura dell'indice dello storico chat riuscita (solo conteggio).

Se qualcosa fallisce, guidami a correggerlo e rilancia lo script. Si passa alla
Fase 3 solo con tutto OK.

## Fase 3 — Implementazione (workflow multi-agente)

Prima scrivi un piano a traguardi e mostramelo. Poi esegui. I traguardi 1–2 sono
fondamenta sequenziali; da 3 in poi parallelizza ciò che è indipendente, con un
passo di integrazione e una revisione avversariale (sicurezza e isolamento tra
utenti) prima di ogni merge nel branch.

1. **Migrazione a TanStack Start su Vercel, a parità di funzioni.** Il sito
   attuale gira con SSR sotto `/gabrifila` e `/gabrifila/dati`, ancora con i dati
   statici. Va mantenuta la parità con il sito attuale: stesse sezioni, stessi
   numeri nei KPI, stesso aspetto. Va verificata con screenshot Playwright
   confrontati con la build di `main`. Tema chiaro/scuro da cookie, senza flash.
2. **Convex + schema Zod unico.**
   - Lo schema ha le descrizioni dei campi ed è usato da form, validatori,
     strumenti e import.
   - Tabelle per profili, partenze (indirizzi isolati: nessuna query pubblica li
     restituisce), concerti/festival, persone, regalato da, wishlist, catalogo
     venue/città, attività, storico chat.
   - Helper unico di proprietà usato da ogni mutation.
   - Seed `gabrifila` da `src/data.ts` **conservando i km esistenti**.
   - Le pagine pubbliche leggono da Convex con SSR (loader + TanStack Query) e
     restano sottoscritte dopo l'idratazione.
3. **Auth e onboarding.**
   - Better Auth (email OTP via Resend, Google, oAuthProxy). L'account nasce al
     primo login.
   - Landing su `/`.
   - `/benvenuto` con handle (handle riservati), forma grammaticale, partenze,
     "collega il tuo agente" (istruzioni MCP + prompt generato per il profilo),
     regalato da.
   - `/privacy`.
4. **Pagine pubbliche multiutente.**
   - Etichette secondo la forma grammaticale.
   - Token del tema nell'HTML.
   - Meta e immagine OG per profilo, JSON-LD `MusicEvent`.
   - Redirect `/dati` e `/?chat=`.
   - Switch a tre stati per il proprietario.
5. **`/<handle>/modifica`.**
   - Sezioni con ancore come da SPEC, modali, TanStack Form.
   - Partenze con indirizzo visibile solo al proprietario, geocoding e km lato
     server.
   - Catalogo venue con geocoding automatico.
   - Regalato da con upload logo.
   - Stile: temi, token, sezioni e tema da descrizione.
   - Registro attività con Annulla e conferma per cancellazioni e import grandi.
   - Esporta dati ed elimina account.
6. **Oracolo per pagina.**
   - Route server di Start con TanStack AI e Gemini, logica attuale, dati da
     Convex.
   - Storico per pagina in Convex con chiave di scrittura come oggi.
   - Modalità scrittura per il proprietario.
   - Rate limit con il componente Convex.
7. **MCP e API.**
   - `/mcp` con OAuth Better Auth e API key, gestite in `#agenti`.
   - Strumenti come da SPEC; nessuno restituisce indirizzi. Quando serve un
     indirizzo, l'errore contiene il link a `#partenze`.
   - Descrizioni con la regola dei soprannomi e il significato delle scale.
   - Import CSV/JSON.
8. **Osservabilità.** Sentry client e server, con scrubbing di indirizzi e
   coordinate. PostHog senza cookie via `/ingest`, con identify dei proprietari.
9. **Migrazione e documentazione.**
   - Script di migrazione dello storico chat da Upstash a Convex, chiavi
     comprese, con `--dry-run`. Va eseguito **solo** in dry-run: la vera
     migrazione si fa allo switch.
   - Aggiorna `CLAUDE.md` (Vercel, Convex, nuovo flusso preview, comandi di
     test), la skill `add-concert-data` (scrive via MCP) e `.env.example`.

### Test

- **Vitest**:
  - ricetta km (il jitter resta in [0.95, 1.07]; mai lo stesso valore su
    estrazioni ripetute);
  - helper di proprietà;
  - handle riservati;
  - etichette per le tre forme;
  - parità delle statistiche tra dati statici e seed Convex;
  - schema Zod.
- **Playwright e2e in locale** (`pnpm dev` + Convex dev), browser visibile quando
  serve un passo mio:
  - landing → login con OTP. Per i test automatici usa un sender di sviluppo che
    rende l'OTP leggibile dal test, attivo solo in dev e mai in produzione.
    Google lo provo io a mano una volta, nel browser aperto da Playwright;
  - onboarding completo → la pagina si popola;
  - aggiungi, modifica e annulla un concerto dalla dashboard → lo vedi in "Sul
    palco" e "I dati" senza ricaricare;
  - un secondo utente non può scrivere sulla pagina del primo, né da UI né da
    MCP/API. Un visitatore su `/<handle>/modifica` viene rediretto;
  - chiamate MCP con API key: add/update/list; `list_departures` senza indirizzi;
  - **controllo fughe**: inserisci un indirizzo di prova e cerca le sue
    coordinate e il suo testo in HTML SSR, bundle JS, risposte MCP/API/Oracolo
    e payload inviati a Sentry e PostHog. Devono essere assenti;
  - redirect `/dati#sec-mappa` → `/gabrifila/dati#sec-mappa` e `/?chat=x` →
    `/gabrifila?chat=x`;
  - meta OG e JSON-LD presenti nell'HTML SSR di `/gabrifila`;
  - la mappa è viva: c'è `canvas.mapboxgl-canvas` e non compare il testo
    "Mappa non disponibile";
  - screenshot full-page di landing, `/gabrifila`, `/gabrifila/dati` e
    `/gabrifila/modifica`, in chiaro e scuro, desktop e mobile, da farmi vedere.

Alla fine fai push sul branch e verifica che la preview Vercel sia `ready` e
passi lo stesso giro di smoke test. Poi dammi un riepilogo con:
- cosa è fatto;
- cosa non ha passato i test, con l'output;
- la checklist dei passi manuali per lo switch: migrazione storico, inserimento
  degli indirizzi, merge su `main`, DNS di `concerti.gabrifila.me` su Vercel,
  chiusura di Upstash e Netlify.
