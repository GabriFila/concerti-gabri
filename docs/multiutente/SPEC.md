# Concerti multiutente — specifica di prodotto e stack

Decisioni prese prima dell'implementazione. Questo documento è la fonte di verità:
dove il codice attuale e questo file divergono, vince questo file; dove questo file
tace, vince il comportamento attuale del sito (CLAUDE.md).

## 1. Prodotto

Un servizio in cui ogni persona ha la propria pagina di concerti (quella che oggi è
il sito di Gabri), la modifica da una dashboard o tramite agenti AI, e ne
personalizza lo stile. Progetto tra amici: realisticamente ~3 utenti.

**Fuori scope per ora:** tagging/social tra utenti, pagine private o visibilità per
campo, pagine globali di artisti/venue, lingue diverse dall'italiano, nome e dominio
del prodotto (si decideranno dopo).

### Attori
- **Proprietario**: ha un account, modifica solo la propria pagina.
- **Visitatore**: legge qualunque pagina, usa l'Oracolo di quella pagina.
- **Agente del proprietario** (Oracolo in modalità modifica, Claude/ChatGPT via MCP,
  script via API key): legge e scrive **solo** la pagina del proprietario che lo ha
  autorizzato. Deve poter fare tutto ciò che fa la dashboard, tranne leggere gli
  indirizzi di partenza.

### Oggetti
- **Profilo**: handle, nome visualizzato, forma grammaticale (femminile / maschile /
  neutro, chiesta all'onboarding come fa Apple), tema.
- **Partenze**: una o più per profilo, ciascuna con nome pubblico (es. "Casa Milano")
  e **indirizzo**. L'indirizzo e le sue coordinate non lasciano mai il server:
  li vede e modifica solo il proprietario in dashboard; MCP/API/Oracolo/pagina
  pubblica non li restituiscono mai (solo nome + `impostato`/`mancante`). Un agente
  che ne ha bisogno risponde all'utente di impostarlo da
  `/<handle>/modifica#partenze`.
- **Concerto / Festival**: stesso modello di oggi (`Concert`, `Festival` ≥2
  `FestivalConcert`), stesse scale (`voto` 1–5, `canzoniNote` 1–5|na, `vicinanza`
  1–6 con 6 = Transenna, più alto = meglio). Ogni concerto con viaggio indica la
  partenza; `km` calcolato **lato server** con la ricetta di CLAUDE.md (haversine ×
  `(1.2 + 0.25·e^(−d/20))` × jitter uniforme [0.95, 1.07], estratto una volta).
  Correggere l'indirizzo di una partenza ricalcola i km dei concerti collegati con
  nuovo jitter; cambiare casa = aggiungere una nuova partenza.
- **Persone** (compagni): elenco privato per profilo, nessun collegamento ad
  account. In ogni punto in cui si inseriscono nomi (dashboard, prompt di
  onboarding, descrizioni degli strumenti MCP) compare il suggerimento: *usa
  soprannomi o diminutivi, non nome e cognome*. Gli agenti trasformano da soli i
  nomi completi (es. "Marco Rossi" → "Marco R.").
- **Regalato da**: elenco personalizzabile per profilo (nome, link e logo
  opzionali — logo caricato). Stessa regola dei soprannomi se è una persona.
- **Wishlist**: per tutti i profili, come l'atto di oggi.
- **Commenti**: come oggi.
- **Catalogo venue/città**: condiviso tra tutti i profili; una venue nuova viene
  geocodificata lato server (Mapbox) — nessuno compila coordinate a mano.
- **Registro attività**: ogni scrittura (dashboard, Oracolo, MCP, API) con autore e
  **Annulla**. Le scritture si applicano subito; chiedono conferma solo
  cancellazioni e import di più di ~10 righe.

Tutti i campi sono disponibili a tutti. Tutte le pagine sono pubbliche, con le
accortezze già presenti oggi (km con jitter, nessuna coordinata di casa nel
bundle o nelle risposte).

### Forma grammaticale
Le etichette in prima persona ("Dove sono andato") seguono la forma scelta; il
neutro riformula senza participio marcato. L'Oracolo parla del proprietario ai
visitatori in terza persona con la stessa forma.

### Stile
1. Temi predefiniti (l'aspetto attuale è il **tema predefinito**), ciascuno con
   chiaro/scuro.
2. Token: accento, font titoli, raggi, densità.
3. Layout: ordine e visibilità delle sezioni, titoli modificabili.
4. Tema da descrizione: l'agente genera i token da un prompt.
Niente CSS libero: i token sono validabili (contrasto, leggibilità dei grafici).
Il selettore chiaro/scuro/sistema del visitatore resta, salvato in **cookie**.

### Oracolo
Per pagina: risponde solo sui dati di quella pagina; storico pubblico per pagina
con l'approccio attuale (lettura pubblica, continuare richiede la chiave di
scrittura nel localStorage di chi l'ha iniziata). Per il proprietario loggato,
in `/<handle>/modifica`, può anche scrivere. Limiti d'uso: sì, dettagli
implementativi.

## 2. Flussi

**Primo accesso:** landing → login (finestra sopra la landing: OTP via email o
Google; l'account nasce al primo login) → `/benvenuto`:
1. handle + forma grammaticale (+ nome visualizzato);
2. partenze (nome + indirizzo);
3. **collega il tuo agente** (passo consigliato): istruzioni per collegare l'MCP a
   Claude/ChatGPT + prompt pronto da copiare. Con l'MCP collegato l'agente scrive
   direttamente (attingendo a email dei biglietti, calendario, ecc.) e la pagina si
   riempie dal vivo; senza, lo stesso prompt produce un CSV/JSON da caricare;
4. "regalato da" (facoltativo);
5. pagina pronta con il tema predefinito.

**Dopo la serata:** i concerti pianificati diventano passati; la dashboard (e
l'agente) propone di completare voto, vicinanza, canzoni note, commento.

## 3. Rotte (nessuna `@`)

```
/                         landing: «Tutti i tuoi concerti, in un solo posto.»,
                          «Crea la tua pagina»; chi è entrato → 307 a /<handle>
                          o a /benvenuto (superato: DECISIONI, Landing e accesso)
/benvenuto                onboarding (solo primo accesso)
/privacy                  informativa minima
/<handle>                 Sul palco
/<handle>/dati            I dati
/<handle>/modifica        Modifica (solo proprietario; altri → /<handle>)
  ?chat=<id>              conversazione dell'Oracolo (come oggi)
  #sec-…                  sezioni (come oggi)
/api/…  /mcp              endpoint per macchine (non pagine)
```
- Lo switch in alto diventa **Sul palco · I dati · Modifica** per il proprietario
  loggato; due stati per tutti gli altri.
- `/<handle>/modifica` è una pagina sola a sezioni con ancore: `#concerti`,
  `#wishlist`, `#persone`, `#partenze`, `#regali`, `#stile`, `#agenti`,
  `#attivita`, `#account` (handle, forma, email, esporta dati, elimina account).
  Le singole schede si modificano in finestre modali, come oggi `CommentModal`.
  (Superato: DECISIONI, UX di /modifica: un'app di gestione, una vista alla
  volta nell'hash `#<vista>`, form in pannelli su `<dialog>`.)
- Handle: minuscole, numeri, `-`; modificabile (il vecchio reindirizza). Riservati
  almeno: `dati`, `benvenuto`, `privacy`, `modifica`, `api`, `mcp`, `ingest`,
  `assets`, `og`, `login`, più qualunque prefisso usato dall'app.
- Redirect del sito attuale: `/dati` → `/gabrifila/dati` (il `#sec-…` sopravvive),
  `/?chat=<id>` → `/gabrifila?chat=<id>`.
- Il sito di Gabri diventa `/gabrifila`; il dominio resta `concerti.gabrifila.me`.

## 4. Agent-friendly
- **MCP** su `/mcp`, OAuth (Better Auth come authorization server) + API key per
  client senza OAuth. Strumenti indicativi: `list_concerts`, `add_concert`,
  `update_concert`, `delete_concert`, `list_people`, `add_person`,
  `list_departures` (mai indirizzi), `search_venue`, `get_stats`, `set_theme`,
  `list_activity`, `undo`.
- **Un solo schema Zod** con descrizioni dei campi da cui derivano form, validatori
  Convex, strumenti MCP, import CSV/JSON e strumenti dell'Oracolo. Errori di
  validazione leggibili da un agente, con link alla dashboard quando serve
  un'azione umana.
- **Pagina pubblica leggibile**: SSR con dati, JSON-LD `schema.org/MusicEvent`,
  meta/OG per profilo.
- Isolamento: un token/sessione vale per un solo profilo; ogni mutation verifica
  la proprietà con un unico helper condiviso.

## 5. Stack

| Area | Scelta |
|---|---|
| Framework | React 19 + TypeScript, **TanStack Start** (SSR) con Router, Query, Form |
| Hosting | **Vercel** (Netlify in pausa fino allo switch) |
| Dati | **Convex** (unico posto dei dati; reattivo → pagina dal vivo) |
| Auth | **Better Auth** su Convex (`@convex-dev/better-auth`): email OTP + Google; plugin oAuthProxy (preview), MCP/OAuth provider, API key |
| Email | **Resend**, mittente `notifications@concerti.gabrifila.me` (dominio di invio verificato `concerti.gabrifila.me`) |
| Mappe / geocoding | **Mapbox**: token `pk.` pubblico ristretto per URL (mappa) + token server-only (geocoding) |
| AI interna | approccio attuale: TanStack AI + Gemini (`web_search` annidato separato), su route server di Start |
| MCP | route `/mcp` di Start |
| Rate limit / storico chat | Convex (componente rate-limiter, tabelle) — **Upstash eliminato** dopo lo switch |
| File (loghi) | Convex file storage |
| Errori | **Sentry** (client + server) |
| Analytics | **PostHog** EU, **senza cookie**, session replay off, reverse proxy `/ingest`; proprietari loggati identificati |
| Test | **Vitest** (unit) + **Playwright** (e2e locale) |
| Grafici | come oggi (SVG a mano; ECharts solo in `TrendPlot`) |
| Validazione | Zod |

Niente export periodico per ora. Minimo legale: `/privacy`, esporta dati, elimina
account; l'unico cookie è quello tecnico di autenticazione (+ preferenza tema),
nessun banner.

## 6. SSR
- Loader delle rotte pubbliche precaricano i dati Convex via TanStack Query.
- Meta e immagine OG generate per profilo; JSON-LD in pagina.
- Token del tema del proprietario come variabili CSS nell'HTML; chiaro/scuro da
  cookie (niente flash).
- Guard di `/modifica` e redirect dei vecchi link lato server.
- Mapbox solo client (placeholder di pari dimensioni); `TrendPlot` lazy.
- Dopo l'idratazione la pagina resta sottoscritta a Convex.

## 7. Migrazione e passaggio
- Stessa repo. Sviluppo su branch → preview Vercel; Netlify resta fermo sul vecchio
  sito finché non si fa lo switch DNS di `concerti.gabrifila.me` verso Vercel.
- Seed del profilo `gabrifila` da `src/data.ts`: `PEOPLE` → persone, `GIFTERS` →
  regalato da, `from` m/g → due partenze (indirizzi inseriti poi da Gabri),
  `VENUE_COORDS`/`CITY_COORDS` → catalogo. **I km esistenti si conservano**:
  impostare l'indirizzo la prima volta non ricalcola.
- Storico Oracolo da Upstash a Convex **al momento dello switch**, chiavi di
  scrittura comprese (stesso dominio → i browser restano validi). Poi si chiude
  Upstash.
- Aggiornare CLAUDE.md (Vercel, Convex, flusso preview) e la skill
  `add-concert-data` (scrive via MCP invece che in `data.ts`).
