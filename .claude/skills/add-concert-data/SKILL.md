---
name: add-concert-data
description: Collect concert details from Gabri via the questions tool, recap for confirmation, then write them to his page in Convex through the concerti MCP tools (add_concert / update_concert, search_venue + add_venue). Use whenever the user wants to add a new concert or fill in / update the fields of an existing one (voto, vicinanza, canzoni note, companions, ticket, trip origin, etc.) — e.g. "I saw X, what do you need", "add this concert", "fill in the data for Y", "update the Caparezza row".
---

# Adding / updating concert data

Concert data lives in Convex, one page per profile (Gabri's is `gabrifila`). This
skill never edits files: no `src/data.ts` (gone), no `shared/seed/gabrifila.ts`
(only the seed and test fixture: editing it changes nothing live), no km computed
by hand, no build, no commit. Every write goes through the MCP tools of the
`concerti` server, the same operations as the dashboard at `/<handle>/modifica`,
and shows up live on the page and in `#attivita` (author: MCP or API key, with
the client's name), where it can be undone.

## Step 0 — Prerequisite: the MCP server is connected

- The tools must be available in this session (in Claude Code they show up as
  `mcp__concerti__<tool>` when the server is added under the name `concerti`).
  Call `get_profile` first: it must answer with the handle you expect
  (`gabrifila` for Gabri).
- **Not connected → stop before asking anything** and tell Gabri how to connect it:
  `claude mcp add --transport http concerti <origin>/mcp`, then `/mcp` inside
  Claude Code to log in and consent in the browser (or an API key from
  `/<handle>/modifica#agenti`, sent as `--header "x-api-key: cgk_…"`). Never ask
  for the API key in chat.
- **The origin decides which data you write.** Production is
  `https://concerti.gabrifila.me/mcp` (after the switch,
  `docs/multiutente/SWITCH.md`). The t3node dev site
  (`https://t3node.tail4a8e3b.ts.net:8444/mcp`) and Vercel previews are separate
  test databases: a concert written there never reaches the live page. Until the
  switch the live site is still `main` on Netlify, with its own copy of this skill
  that writes `src/data.ts`; say so if Gabri wants a real concert recorded before
  then.

The user (Gabri) logs concerts on his page. When he wants to record a show he
attended — or fill in the blanks on a future row that has now happened — **do not
ask for fields free-form and do not make him type a paste-back block**. Use the
questions tool (AskUserQuestion) for anything with a fixed set of answers, then
recap the whole entry in plain text for him to confirm or edit before it's written.
This is the workflow he settled on; follow it exactly.

## Step 1 — Check the date first

Before asking anything else, get today's date (Europe/Rome) and compare it to the
concert's date (the entry's `date`, or the day being filled in for an existing
future entry).

- **Concert date is in the future** (later than today): this is a booked-but-not-yet-
  attended show. **Do not ask about voto, vicinanza, or canzoni note at all** — they
  describe an experience that hasn't happened yet, so they must stay absent from the
  entry (that is what planned concerts on the page look like). Only collect
  ticket/trip/companions fields.
- **Concert date is today or in the past**: ask about all fields, including the
  experiential ones.

Getting this wrong (asking for a rating on a show that hasn't happened yet) is the
mistake this step exists to prevent.

## Step 2 — Locate the entry, or plan a new one

- Look it up first: `list_concerts({artista})` (or `{anno}`), then
  `get_concert({id})` for the full entry with names. `list_concerts({da_completare: true})`
  lists past concerts still missing voto, vicinanza or canzoni note: offer to fill
  those in too. If the concert is **already present** (planned ones often have only
  `cost`/`with`), you're filling in its blanks — treat everything already recorded
  as answered, don't re-ask it.
- If it's a **new** concert, you're creating a new `Concert`. Check
  `list_wishlist`: if the artist is there, this is a wish come true — plan to take
  it off the wishlist (Step 5).
- If it's a **festival** (one ticket/trip bundling ≥2 concerts, see `CLAUDE.md`),
  repeat Steps 3–4 per concert (artist, with, voto, vicinanza, canzoni note, and a
  per-day `date` if multi-day), then once for the shared ticket/trip block and the
  comment. `cost`, `gift`/`giftFrom`/`accredito`, `from`, `venue`, `city`, `date`
  and `comments` live on the festival, not on its concerts.
- Read the reference lists you'll need in the same pass: `list_people` (companions),
  `list_departures` (trip origins: name and set/missing, never an address),
  `list_gifters` ("regalato da").

## Step 3 — Ask with the questions tool

Use AskUserQuestion for every field that has a closed set of valid answers, and
skip asking (leave it unset) for anything already known from the data, the user's
message, or ruled out by Step 1. Batch up to 4 questions per call; it supports 1-4
options plus a free-form "Other". Fields to ask this way, each as its own question:

- **VOTO** — overall rating, options "5" down to lower numbers (best-first, since
  higher is better); only when Step 1 allows it.
- **VICINANZA** — options labelled with both the number and the
  `VICINANZA_LABELS` name from `shared/model/scale.ts` (e.g. "6 Transenna",
  "5 Sottopalco", ...), best-first; only when Step 1 allows it.
- **CANZONI NOTE** — options labelled with both the number and the
  `CANZONI_NOTE_LABELS` name (4 = "Molte"), best-first, plus an "na" option if
  needed; only when Step 1 allows it.
- **BIGLIETTO** — one of: paid (ask the amount as a follow-up, or via "Other" text),
  paid but forgotten, gift (then who gave it, from `list_gifters`), accredito.
- **DA DOVE** — the trip's departure, options from `list_departures` (today
  "Milano" and "Genova" for Gabri). Never ask for or mention an address.
- **Disambiguation** — anything genuinely ambiguous from the source material: a
  first-name-only companion that matches more than one person in `list_people`
  (e.g. "Fra" could be "Fra M" or "Fra G"), an uncertain venue (several
  `search_venue` results), whether a cost mentioned by the user is per-ticket or a
  total across companions, etc.

Free-text fields with no fixed enum — companion names, the venue when it's known
outright, the paid amount, the optional comment — are collected from what the user
already said, or asked for directly in a normal chat message, not via the tool.
New companions follow the nickname rule: nicknames or short forms, never first
and last name ("Marco Rossi" → "Marco R."); propose the short form yourself.

**COMMENTO** — always ask it, never skip it silently. When Step 1 allows the
experiential fields and he hasn't already given a remark on the evening, ask in a
plain chat message (alongside or right after the tool questions) whether he wants
to add a comment on the evening, making clear it's optional and can be left blank.
Ask once per event: on a festival it's one comment for the whole event, not one
per concert. Skip the question for a future show (Step 1) — there's no evening to
comment on yet.

## Step 4 — Recap before writing

Before calling any write tool, send a short plain-text recap of the full entry as
it will be written: artist, date, venue/city (as named in the catalog), with,
voto/vicinanza/canzoniNote (or "not asked yet — show hasn't happened" if Step 1
skipped them), ticket, trip departure ("km: calcolati dal server"), the comment
(or "nessun commento" if he left it blank), plus any new person, gifter or venue
you will add and the wishlist change. Ask him to confirm or correct anything
before you write it. Only proceed to Step 5 once he confirms (or edits and then
confirms).

## Step 5 — Write through the MCP tools

Once he's confirmed the recap, in this order:

- **Venue.** `add_concert` takes the venue and city **by name**, and they must
  already be in the shared catalog. `search_venue({query})` returns `catalogo`
  (existing venues: use that exact name and city) and `candidati` from
  OpenStreetMap. If the venue isn't in the catalog, pick the right candidate (ask
  Gabri when ambiguous) and call `add_venue({ref})`; the venue keeps its
  OpenStreetMap name, so use the name and city the catalog shows afterwards (a
  new `search_venue` lists it). Coordinates come from the server and can never be
  set or edited; a `conflitto` error means a different place already has that
  name in that city: show it to Gabri.
- **People.** Every name in `with` must exist: `add_person({name})` for the new
  ones (nickname rule), never a near-duplicate of an existing person.
- **Gifter.** `giftFrom` (only with `gift: true`) must be an existing
  "regalato da": `add_gifter` first if needed (nickname rule if it's a person).
- **Departure.** `from` is a departure name from `list_departures`. If its
  address is `mancante`, the km stays pending: tell Gabri to set the address in
  `/<handle>/modifica#partenze` (only he can, from the dashboard).
- **The entry.** New: `add_concert` with `{kind: "concert", date: "gg/mm/aaaa",
  venue, city, artist, with, voto?, vicinanza?, canzoniNote?, cost? | gift +
  giftFrom? | accredito?, from?, comments?}`, or `{kind: "festival", name, date,
  venue, city, …ticket/trip/comments, concerts: [≥2 × {artist, with, voto?,
  vicinanza?, canzoniNote?, date?}]}`; a multi-day festival date is
  `"30–31/03/2017"`. Existing: `update_concert({id, patch})` with only the
  changed fields (`null` removes one; for a festival, `concerts` replaces the
  whole lineup). Enum values: `voto` 1–5, `vicinanza` 1–6 (6 = Transenna, the
  closest: the scale rises with the advantage), `canzoniNote` 1–5|"na". Ticket:
  Paid → `cost` (a number), Paid-but-forgotten → `cost: "na"`, Gift →
  `gift: true` (+ `giftFrom`), Accredito → `accredito: true`.
- **`cost: "na"` vs omitting `cost`:** `"na"` means a ticket was bought and the price
  is forgotten; leaving `cost` out means the price isn't defined yet (a future
  entry). Both stay out of every money stat — the difference is only what the
  archive shows ("n.d." vs "—"). Never invent or estimate a forgotten price.
- **`cost` is always the TOTAL actually paid**, commissions included — the grand
  total of the order, not the face value of the seat. On a ticketing confirmation
  that means the nominal price plus every fee line ("commissioni ordine",
  "commissioni spedizione", prevendita, ...), summed. Don't ask which one he wants:
  it's always the total.
- **`comments`:** copy his words verbatim (skip the field when he left it blank —
  never write a comment he didn't write). It belongs to the EVENT, so on a
  festival it goes on the festival, not on a single set.
- **`km`:** never send it and never compute it: the server draws it once per
  (departure, venue) pair, with the jitter of the recipe in `CLAUDE.md`.
- **Wishlist:** if the artist was on it (Step 2), `set_wishlist` with the list
  from `list_wishlist` minus that artist — it replaces the whole list, so pass
  every other artist unchanged and in order.
- **Errors** are `{code, messaggio, campo?, fix?}`: `nome_sconosciuto` lists the
  valid names, `input_non_valido` names the field, `fix` is a dashboard link for
  Gabri. Fix the input and retry; never retry blindly in a loop.

## Step 6 — Verify

- Read the entry back with `get_concert({id})` and tell Gabri it's on his page
  (`<origin>/<handle>`, it updates live), mentioning anything still pending: km
  waiting for a departure address, voto/vicinanza/canzoni note to fill in after a
  future show.
- If something went wrong, `list_activity` shows the latest writes and `undo`
  reverts one (or its batch); Gabri can do the same from `#attivita`.
- Nothing to build, commit or push: the data isn't in git.
