# Switch alla versione multiutente: checklist

Lo switch porta `concerti.gabrifila.me` da Netlify (sito statico di `main`,
dati in `src/data.ts`, storico dell'Oracolo su Upstash) a Vercel + Convex prod
`brave-chickadee-534`, con la pagina di Gabri su `/gabrifila`. Fonti: PIANO
§12 ("Allo switch"), DECISIONI.md e i passi manuali di PROMPT.md.

**Regole**
- I passi che toccano la produzione li fa Gabri: `.claude/settings.json` vieta
  agli agenti `--prod`, il nome del deployment prod, il profilo fnox `prod`, i
  deploy Vercel e i push su `main`. Un agente prepara i comandi, fa i passi su
  dev e preview e verifica dove basta leggere.
- Segreti sempre per riferimento, mai sulla riga di comando o a video:
  `fnox [-P prod] exec -- sh -c 'printf %s "$NOME" | pnpm exec convex env set NOME …'`,
  dentro apici singoli. Senza valore, `convex env set NOME` lo legge da stdin.
- Tutti i comandi partono dal checkout principale `~/code/personal/concerti-gabri`
  su t3node.
- La parte B dura qualche ora: iniziarla presto (Ripple si spegne alle 23).

## A. Prima dello switch

### A1. Decidere il rischio delle sonde sui km
- **Chi:** Gabri.
- **Come:** scegliere tra lasciare così e le opzioni (a), (b), (c) di
  DECISIONI → "Decisioni della Fase 3" → "Rischi residui". Con (a) o (b) un
  agente le implementa, con un test Convex in cui la venue sonda di un agente
  non dà un km usabile.
- **Verifica:** la scelta è scritta in DECISIONI; l'eventuale codice è su
  `multiutente` con build, vitest ed e2e verdi.

### A2. Ruotare `GOOGLE_CLIENT_SECRET` (esposto il 2026-10-21)
- **Chi:** Gabri nella console e su prod; l'orchestratore su dev e preview.
- **Come:**
  1. Google Auth Platform → Clients → client web di concerti-gabri → "Add
     secret" (il vecchio resta valido finché non lo disattivi).
  2. `fnox set GOOGLE_CLIENT_SECRET` e incolla il nuovo valore.
  3. Per riferimento, nei quattro posti:
     - dev: `fnox exec -- sh -c 'printf %s "$GOOGLE_CLIENT_SECRET" | pnpm exec convex env set GOOGLE_CLIENT_SECRET'`
     - predefinite delle preview: `fnox exec -- sh -c 'printf %s "$GOOGLE_CLIENT_SECRET" | pnpm exec convex env default set GOOGLE_CLIENT_SECRET --type preview'`
     - `preview/multiutente`: `fnox exec -- sh -c 'printf %s "$GOOGLE_CLIENT_SECRET" | pnpm exec convex env set GOOGLE_CLIENT_SECRET --deployment preview/multiutente'`
     - prod (Gabri): `fnox exec -- sh -c 'printf %s "$GOOGLE_CLIENT_SECRET" | pnpm exec convex env set GOOGLE_CLIENT_SECRET --prod'`
  4. Dopo le verifiche, nella console disattivare ed eliminare il secret
     vecchio.
- **Verifica:** login Google riuscito sul dev
  (`https://t3node.tail4a8e3b.ts.net:8444/accedi`) e sull'URL del branch
  `multiutente`; `pnpm check:setup` senza KO su Google e Better Auth. In
  produzione lo verifica il passo B7.

### A3. Aghi del controllo fughe e build di parità fuori da `main`
- **Fatto il 2026-10-22** (`f3827ad`): i tre script leggono il commit fisso
  `296205d`. Resta solo la verifica qui sotto, dopo il merge.
- **Chi:** agente.
- **Come:** `scripts/bundle-guard.mjs` ed `e2e/helpers/fughe.ts` leggono le
  coordinate di casa da `git show main:CLAUDE.md`. Il nuovo `CLAUDE.md` non le
  ha più: dopo il merge `bundle-guard` salterebbe il controllo (solo un
  avviso) e le spec di `e2e/fughe/` fallirebbero all'import. Puntarli a un
  commit fisso di `main` precedente al merge (oggi `296205d`), senza mai
  riscrivere le coordinate altrove; se un giorno si riscrive la storia, un
  file locale non tracciato. Stessa cosa per `scripts/parita-main.mjs`, che
  builda `main` per `e2e/parita.spec.ts`: fissarlo allo stesso commit, oppure
  togliere la spec di parità.
- **Verifica:** dopo un build, `node scripts/bundle-guard.mjs` non stampa
  "coordinate di casa non trovate"; le spec di `e2e/fughe/` partono anche con
  un `main` che non ha più le coordinate.

### A4. Seed allineato a `main`
- **Chi:** agente.
- **Come:** fino allo switch i concerti nuovi vanno su `main` (`src/data.ts`).
  Ogni concerto aggiunto o completato lì va riportato in
  `shared/seed/gabrifila.ts`, km compreso (stesso valore, mai ricalcolato):
  `git log --oneline multiutente..main -- src/data.ts` elenca i commit da
  portare.
- **Verifica:** il comando non elenca niente di non portato;
  `pnpm vitest:lock` e `e2e/parita.spec.ts` (KPI di `/gabrifila` contro la
  build di `main`) verdi.

### A5. Impostazioni di Sentry e PostHog
- **Chi:** Gabri.
- **Come:**
  - Sentry → Issues, environment `preview`: l'errore di prova del server del
    2026-10-22 alle 09:49 UTC;
  - PostHog → Project settings: "Cookieless server hash mode" e "Discard
    client IP data";
  - Sentry → Project settings: "Prevent Storing of IP Addresses".
- **Verifica:** l'evento Sentry mostra `[indirizzo]`, `[coords]` e
  `[Filtered]`, nessun utente o IP, niente header, cookie, dati o query
  string, e uno stack leggibile; le tre impostazioni sono ON.

### A6. Giro sulla preview e Claude Code (consigliato)
- **Chi:** Gabri per i login e il consenso; l'agente per il resto.
- **Come:**
  - login Google sull'URL del branch `multiutente`, poi (agente)
    `pnpm exec convex run --deployment preview/multiutente admin:claimProfile '{"handle":"gabrifila","email":"<la tua email Google>"}'`;
  - `PREVIEW_URL=<url del branch> pnpm e2e:preview` e il giro di PIANO §8.4;
  - Claude Code sul dev:
    `claude mcp add --transport http concerti https://t3node.tail4a8e3b.ts.net:8444/mcp`,
    `/mcp` per login e consenso nel browser T3, poi `get_profile` e una
    scrittura annullata con `undo`.
- **Verifica:** `/gabrifila/modifica` si apre sulla preview; `e2e:preview`
  verde salvo le esclusioni di §8.4; Claude Code legge il profilo, e si annota
  se il token arriva con un `refresh_token` (DECISIONI, "Aperti").

### A7. Variabili di Vercel Production
- **Chi:** agente (lettura); Gabri per la pulizia.
- **Come:** `vercel env ls production` (solo nomi). Pulizia facoltativa dei
  nomi che il codice non legge più: `vercel env rm UPSTASH_REDIS_REST_TOKEN -y`,
  e lo stesso per `CHAT_RPM_PER_IP`, `CHAT_RPD_PER_IP`, `CHAT_RPD_GLOBAL`,
  `CHAT_LOG_TTL_DAYS`.
- **Verifica:** ci sono `CONVEX_DEPLOY_KEY`, `ENABLE_EXPERIMENTAL_COREPACK`,
  `VITE_MAPBOX_TOKEN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
  `VITE_POSTHOG_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`; manca solo
  `CHAT_SERVER_SECRET` (passo B2).

## B. Lo switch, in quest'ordine

### B1. Variabili di Convex prod
- **Chi:** Gabri.
- **Come:**
  1. `CHAT_SERVER_SECRET` di produzione, generato senza vederlo, nel profilo
     `prod` di fnox:
     `umask 077; f=$(mktemp); openssl rand -base64 32 | tr -d '\n' > "$f"; fnox -P prod set CHAT_SERVER_SECRET_PROD --from-file "$f"; shred -u "$f"`,
     controllo che il valore ci sia con
     `grep '^CHAT_SERVER_SECRET_PROD=' fnox.toml | grep -c 'value ='` (1 = c'è),
     poi
     `fnox -P prod exec -- sh -c 'printf %s "$CHAT_SERVER_SECRET_PROD" | pnpm exec convex env set CHAT_SERVER_SECRET --prod'`.
  2. `SIGNUP_ALLOWLIST`: la tua email Google e quelle degli amici, separate da
     virgola, **prima** del tuo primo login in produzione (senza la tua email
     non potresti creare l'account): `pnpm exec convex env set SIGNUP_ALLOWLIST --prod`
     (senza valore lo chiede).
  3. Mai `AUTH_DEV_OTP`. `SITE_URL` resta `https://concerti-gabri.vercel.app`
     fino al DNS (B11). `OAUTH_PROXY_*` solo dopo il DNS (B13): con `SITE_URL`
     diverso da `OAUTH_PROXY_PRODUCTION_URL` la produzione farebbe passare dal
     proxy anche il proprio login Google.

  Impostarle prima del deploy non ha effetti: il codice che le legge arriva
  con il passo B4.
- **Verifica:** `pnpm exec convex env list --prod --names-only` elenca
  `CHAT_SERVER_SECRET` e `SIGNUP_ALLOWLIST` accanto a `SITE_URL`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_TRUSTED_ORIGINS`, `GOOGLE_CLIENT_ID` e
  `GOOGLE_CLIENT_SECRET`, e non `AUTH_DEV_OTP`.

### B2. `CHAT_SERVER_SECRET` su Vercel Production
- **Chi:** Gabri.
- **Come:**
  `fnox -P prod exec -- sh -c 'printf %s "$CHAT_SERVER_SECRET_PROD" | vercel env add CHAT_SERVER_SECRET -e production --sensitive'`.
  Va fatto prima del primo build di produzione: le variabili Vercel valgono
  solo per i deploy nuovi. Stesso valore di Convex prod, altrimenti
  `/api/chat` risponde 503.
- **Verifica:** `vercel env ls production` elenca `CHAT_SERVER_SECRET`.

### B3. Togliere l'Ignored Build Step
- **Chi:** Gabri.
- **Come:** Vercel → progetto `concerti-gabri` → Settings → Git → Ignored
  Build Step → "Automatic". Prima del merge, così è il merge a far partire il
  build di produzione.
- **Verifica:** l'impostazione è "Automatic".

### B4. Merge di `multiutente` su `main`
- **Chi:** l'agente apre la PR, Gabri la unisce.
- **Come:** `gh pr create --base main --head multiutente`, poi Gabri la unisce
  su GitHub. Netlify è in pausa: `concerti.gabrifila.me` resta il vecchio sito
  fino al DNS (B11).
- **Verifica:** Vercel → Deployments: il deploy di produzione di `main` è
  Ready. Nel log: `convex deploy` verso il deployment prod, release Sentry
  creata e finalizzata, source map caricate e poi cancellate.
  `https://concerti-gabri.vercel.app/` mostra la landing; `/gabrifila` dà
  ancora 404 (manca il seed).

### B5. Seed di produzione
- **Chi:** Gabri.
- **Come:** `pnpm exec convex run --prod seed:ensure`.
- **Verifica:** `https://concerti-gabri.vercel.app/gabrifila` e `/gabrifila/dati`
  hanno gli stessi numeri del sito Netlify; mappa viva con
  `node scripts/preview-shot.mjs https://concerti-gabri.vercel.app/gabrifila`.

### B6. Migrazione dello storico dell'Oracolo
- **Chi:** Gabri.
- **Come:** prima di nuovo il dry-run, poi l'apply (dopo il seed: senza il
  profilo `gabrifila` la mutation si ferma):
  - `fnox exec -- node scripts/migra-storico-chat.mjs`
  - `fnox exec -- node scripts/migra-storico-chat.mjs --apply --deployment brave-chickadee-534`
- **Verifica:** il dry-run torna come quello del 2026-10-22 (25 conversazioni,
  227 messaggi, 0 errori, o di più se ne sono nate altre su Netlify); l'apply
  esce con 0 errori; le conversazioni vecchie compaiono nello storico
  dell'Oracolo di `https://concerti-gabri.vercel.app/gabrifila`
  (`pnpm exec convex run --prod chat:listThreads '{"handle":"gabrifila"}'`:
  sono pubbliche).

### B7. Primo login di Gabri in produzione
- **Chi:** Gabri.
- **Come:** `https://concerti-gabri.vercel.app/accedi` → Google. Si arriva su
  `/benvenuto` con un profilo vuoto: **non** completare l'onboarding.
- **Verifica:** il login riesce, senza messaggio d'invito.

### B8. Claim di `gabrifila`
- **Chi:** Gabri.
- **Come:**
  `pnpm exec convex run --prod admin:claimProfile '{"handle":"gabrifila","email":"<la tua email Google>"}'`:
  cancella il profilo vuoto di B7 e lega `gabrifila` al tuo account.
- **Verifica:** ricaricando, `/gabrifila` ha "Modifica" nello switch e
  `/gabrifila/modifica` si apre.

### B9. Indirizzi reali delle partenze
- **Chi:** Gabri.
- **Come:** `/gabrifila/modifica#partenze` → "Milano" e "Genova" → imposta
  l'indirizzo e scegli il candidato. La prima volta su una partenza legacy i
  km legacy restano; si calcolano solo quelli in attesa.
- **Verifica:** entrambe "impostato"; la KPI "Km di viaggi" senza
  "(N viaggi in attesa)"; nell'archivio nessun "—" in Viaggio per i concerti
  con una partenza.

### B10. Google: redirect e Branding
- **Chi:** Gabri.
- **Come:** Google Auth Platform → Clients → client web: i redirect
  `https://concerti.gabrifila.me/api/auth/callback/google` e
  `https://concerti-gabri.vercel.app/api/auth/callback/google` (dalla Fase 1);
  Branding: home page `https://concerti.gabrifila.me`, privacy
  `https://concerti.gabrifila.me/privacy`.
- **Verifica:** le voci ci sono; `https://concerti-gabri.vercel.app/privacy`
  risponde.

### B11. Dominio e DNS
- **Chi:** Gabri. È una modifica pubblica: un agente tocca il DNS solo con il
  suo OK, via API Cloudflare (`CLOUDFLARE_API_TOKEN`), dopo avergli mostrato il
  record esatto.
- **Come:**
  1. Vercel → progetto → Settings → Domains → Add `concerti.gabrifila.me`
     (Production): Vercel mostra il record da creare.
  2. Cloudflare → `gabrifila.me` → DNS: il record `concerti`, che oggi punta a
     Netlify, diventa quello di Vercel, "DNS only" (proxy spento, così Vercel
     emette il certificato). I record di Resend non c'entrano.
  3. `pnpm exec convex env set SITE_URL https://concerti.gabrifila.me --prod`
     (le trusted origins lo contengono già).
  4. Vercel → Deployments → ultimo deploy di produzione → Redeploy:
     `VERCEL_PROJECT_PRODUCTION_URL`, da cui nascono canonical e origine MCP,
     si fissa a ogni deploy.
- **Verifica:**
  - Vercel segna il dominio "Valid Configuration";
    `curl -sI https://concerti.gabrifila.me/gabrifila` → 200 con
    `server: Vercel`;
  - `issuer` di `/.well-known/oauth-authorization-server` e
    `authorization_servers[0]` di `/.well-known/oauth-protected-resource/mcp`
    valgono entrambi `https://concerti.gabrifila.me`, come canonical e
    `og:url` di `/gabrifila`;
  - `/dati#sec-mappa` → `/gabrifila/dati#sec-mappa` e `/?chat=<id>` →
    `/gabrifila?chat=<id>`;
  - login Google su `https://concerti.gabrifila.me/accedi`; mappa viva con
    `node scripts/preview-shot.mjs https://concerti.gabrifila.me/gabrifila`;
  - una conversazione vecchia si continua dal browser che l'aveva iniziata
    (stessa origine, stessa chiave nel localStorage).

### B12. Rilanciare la migrazione
- **Chi:** Gabri.
- **Come:** qualche ora dopo il cambio DNS,
  `fnox exec -- node scripts/migra-storico-chat.mjs --apply --deployment brave-chickadee-534`:
  è idempotente e recupera le chat scritte su Netlify fino al cambio.
- **Verifica:** 0 errori; le conversazioni sono almeno quelle di B6.

### B13. oAuthProxy per le preview (PIANO §1.43)
- **Chi:** Gabri su prod; l'orchestratore sulle predefinite delle preview.
- **Come:**
  1. `OAUTH_PROXY_SECRET` generato come in B1, ma nel profilo predefinito
     (serve uguale su prod e preview):
     `umask 077; f=$(mktemp); openssl rand -base64 32 | tr -d '\n' > "$f"; fnox set OAUTH_PROXY_SECRET --from-file "$f"; shred -u "$f"`.
  2. prod:
     `fnox exec -- sh -c 'printf %s "$OAUTH_PROXY_SECRET" | pnpm exec convex env set OAUTH_PROXY_SECRET --prod'`
     e `pnpm exec convex env set OAUTH_PROXY_PRODUCTION_URL https://concerti.gabrifila.me --prod`.
  3. preview:
     `fnox exec -- sh -c 'printf %s "$OAUTH_PROXY_SECRET" | pnpm exec convex env default set OAUTH_PROXY_SECRET --type preview'`
     e `pnpm exec convex env default set OAUTH_PROXY_PRODUCTION_URL https://concerti.gabrifila.me --type preview`.
- **Verifica:** un login Google dalla preview di un altro branch (non
  `multiutente`) finisce loggato su quella preview. Se viene rifiutato per
  l'origine, l'URL esatto di quel branch va in `BETTER_AUTH_TRUSTED_ORIGINS`
  di prod (mai jolly su `*.vercel.app`, DECISIONI).

### B14. Chiudere Upstash e Netlify
- **Chi:** Gabri per console e fnox; l'agente per la PR di pulizia.
- **Come**, solo dopo B12 e un controllo dello storico:
  1. PR di pulizia: via `netlify.toml` (`netlify/` non c'è più dal traguardo
     6), `README.md` aggiornato (parla ancora di Netlify e Upstash), via la
     riga Upstash di `scripts/check-setup.mjs`, la regola su
     `UPSTASH_REDIS_REST_TOKEN_RW` in `CLAUDE.md` e DECISIONI e, in
     `CLAUDE.md`, la frase "Until the switch…" sui deploy.
  2. Netlify → sito `concerti-gabrifila` → Site configuration → Delete site.
  3. Upstash → database dello storico → Delete (fino allo switch era vietato
     da PROMPT.md).
  4. `fnox remove UPSTASH_REDIS_REST_URL` e
     `fnox remove UPSTASH_REDIS_REST_TOKEN_RW`.
  5. Resend resta facoltativo (DECISIONI, "Email"): quando si libera uno slot,
     dominio `concerti.gabrifila.me` in EU, poi `RESEND_API_KEY` **ed**
     `EMAIL_FROM` su Convex prod.
- **Verifica:** `pnpm check:setup` senza KO;
  `https://concerti-gabrifila.netlify.app` non risponde più; in fnox non ci
  sono più nomi `UPSTASH_*`.

## C. Dopo lo switch

- Claude.ai e ChatGPT veri su `https://concerti.gabrifila.me/mcp` (domanda 5
  di PIANO §12): collegare, consentire, una lettura e una scrittura annullata;
  controllare che il token si rinnovi.
- La skill `add-concert-data` scrive su `https://concerti.gabrifila.me/mcp`.
- PostHog dopo qualche giorno: i visitatori unici non collassano in uno.
- Il branch `multiutente` si chiude; `preview/multiutente` scade da solo.
  `node scripts/check-setup.mjs --preview` controlla proprio quel deployment:
  va portato sul branch di lavoro successivo.
- Restano gli "Aperti" di DECISIONI.
