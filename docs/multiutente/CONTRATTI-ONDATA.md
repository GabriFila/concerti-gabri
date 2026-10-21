# Contratti tra le corsie (ondata unica, notte del 2026-10-21)

Dopo il merge di T2, le corsie 3, 4, 8, 5, 7, 6 e lo script di migrazione partono **insieme**, invece che in due ondate (A: 3, 4, 8; B: 5, 7, 6). Questo file vince su PIANO.md dove i due divergono. Lo cambia solo l'orchestratore.

## Regole

- **Proprietà dei file:** quella di PIANO §7.0, più le righe qui sotto.
- **File di contratto:** si trovano già nel commit base. Le firme restano quelle; chi ne è proprietario riempie il corpo e può **aggiungere** export. Chi li usa importa solo quello che c'è scritto qui.
- **Merge** (orchestratore, branch `integrazione`): ordine 3 → 4 → 8 → 5 → 7 → 6 → migrazione.
  - Su un file di contratto vince la versione della corsia proprietaria.
  - Le aggiunte agli altri file condivisi si uniscono a mano.
- **Spec con sessione:** il login arriva con la corsia 3.
  - Le spec Playwright che lo richiedono importano `e2e/helpers/auth.ts`, hanno il tag `@sessione` e girano all'integrazione.
  - Nelle corsie si lancia il resto con `--grep-invert @sessione`; la corsia 3 lancia tutto.
- **Funzioni owner nuove:** passano dai builder e si classificano nel catalogo o come `dashboardOnly` con motivo.
  - Il registro si estende al proprio traguardo: `o.traguardo <= N` in `convex/registry.test.ts` vale per la propria corsia.
  - Il catalogo non si cambia: se manca un'operazione, va in `contract_changes`.

## File di contratto

| File | Proprietario | Lo usano | Firma |
|---|---|---|---|
| `src/modifica/tipi.ts` | orchestratore | 3, 5, 7 | `SezioneProps { handle }` |
| `src/modifica/sezioni.ts` | orchestratore | 3 (scheletro) | `SEZIONI_MODIFICA`: 9 voci `{id, titolo, Componente}` nell'ordine di SPEC |
| `src/modifica/sezioni/{Concerti,Wishlist,Persone,Partenze,Regali,Stile,Attivita,Account}.tsx` | 5 | 3 (tramite `sezioni.ts`) | `Sezione<Nome>(props: SezioneProps)` |
| `src/modifica/sezioni/Agenti.tsx` | 7 | 3 (tramite `sezioni.ts`) | `SezioneAgenti(props: SezioneProps)` |
| `src/modifica/ChatScrittura.tsx` | 6 | 3 (la rende una volta nello scheletro di `/modifica`) | `ChatScrittura({ handle })` |
| `src/ui/AddressPicker.tsx` | 3 | 5 (`#partenze`) | `AddressPicker({ departureId, correzione?, onConfermato?, onAnnulla? })`: `geo.geocodeDeparture` → `departures.confirmAddress`, solo client |
| `src/import/ImportUpload.tsx` | 7 | 3 (passo 3 di `/benvenuto`), 7 (`#agenti`) | `ImportUpload({ contesto: "agenti" \| "onboarding", onImportato? })` |
| `src/lib/auth-client.ts` | 3 | 5 (`#account`) | `esci(): Promise<void>`, che esce e ricarica |
| `src/lib/auth-server.ts` | 3 | 6 (scrittura), 5 (tema da descrizione), 7 | `convexBetterAuthReactStart(...)`: `handler`, `getToken`, `fetchAuthQuery`, `fetchAuthMutation`, `fetchAuthAction` (già reale) |
| `convex/authMcp.ts` | 7 | 3 (`convex/auth.ts`) | `MCP_ATTIVO`, `opzioniMcp`: `mcp({ ...opzioniMcp })`, con `/mcp/*` in `disabledPaths` finché `MCP_ATTIVO` è falso |
| `e2e/helpers/auth.ts` | 3 | 4, 5, 6, 7, 8 | `accediConOtp(page, email)`, `nuovoProprietario(page, {handle?, forma?, nome?})` → `{email, handle}`, `accediComeGabrifila(page)`, `esci(page)` |
| `src/lib/viewer.ts` | 3 | tutti | `useViewer()`, `useIsOwner(handle)`: forma congelata da T2 |

## Spec che cambiano proprietario

- `e2e/onboarding.spec.ts` è della corsia 3.
- L'estensione dell'import al passo 3 (corsia 7) va in un file a parte, `e2e/onboarding-import.spec.ts`.

## Cosa resta all'integrazione

Lo fa l'orchestratore:
- spec `@sessione` di tutte le corsie;
- il punto di `convex/auth.ts` dove si abilita MCP (nota della corsia 7);
- `shared/theme.ts` (corsia 4) usato dal tema da descrizione (corsia 5);
- strumenti MCP che puntano a funzioni della corsia 5;
- spike sulla preview (Sentry lato server, `identify`, OG);
- il collegamento di Claude Code a `/mcp`.

## Note del T2 per le corsie

- **Corsia 3:**
  - `me.profile` esiste già in `convex/me.ts` (publicQuery). Restituisce `null` per gli anonimi e per chi non ha profilo, altrimenti `{profileId, handle|null, displayName|null, status, onboardingStep}`. `useViewer()` legge da lì.
  - L'identità si ricava solo in `utenteDellaSessione` (`convex/lib/owner.ts`): va passata ad `authComponent.safeGetAuthUser`.
  - Handle riservati e `cambiaHandle` stanno in `convex/lib/handles.ts` (`profiles.ts` li riesporta). Se l'elenco si sposta in `shared/handles.ts`, `cambiaHandle` e `motivoHandle` restano uguali: il proprio handle di prima è sempre ammesso.
  - Il glob del registro esclude già `convex/betterAuth/`.
- **Corsia 5:**
  - `departures.confirmAddress` restituisce `stessoPunto`: un candidato entro 50 m da quello salvato non conta come correzione.
  - Una partenza ripristinata da Annulla torna senza indirizzo e conserva le coppie di km.
  - Venue: `search_venue` dà candidati con un `ref`; `add_venue`/`venues.createFromCandidate` accetta solo `{ref, name?}` e rilegge coordinate, OSM e città dalla cache del server.
- **Corsia 7:**
  - `get_stats` → `agents:stats` (corsia 7), con `statisticheInput` di `shared/schema/entry.ts`.
  - `import_concerts` usa `importaConcertiInput` di `shared/schema/importFormat.ts`.
  - `registry.test` vuole che l'input della funzione sia **lo stesso oggetto** schema del catalogo.
  - `add_venue` come sopra.
- **Corsia 8:** le regole `/ingest` filtrano `cookie` e `authorization`, quindi su Vercel il proxy gira nella funzione e non nel CDN (deroga a §1.13). Sulla preview si verifica che `/ingest` funzioni e che a monte non arrivi il cookie.
- **Tutte:**
  - gli e2e di corsia girano sul build del worktree alla porta 3100, più il Convex locale, uno alla volta sotto il lock e2e;
  - `wt.mjs` dà alla CLI Convex un token finto, quindi da un worktree non si raggiunge mai un deployment cloud;
  - il backend locale si accende solo quando serve (`convex-locale.mjs up`/`down`).
