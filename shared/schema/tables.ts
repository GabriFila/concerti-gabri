/* ──────────────────────────────────────────────────────────────
   Tutte le tabelle dell'app (PIANO §5.1), in Zod puro: convex/schema.ts
   le traduce con convex/lib/zodConvex.ts. Da qui in poi i cambi sono solo
   additivi (campi opzionali, tabelle nuove: PIANO §1.17).
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { forma, handle, nomeCitta, nomePartenza, nomePersona, nomeVenue, nomeVisualizzato, urlHttps, etichettaRegalo, artista } from "./campi.ts";
import { entryDbFields } from "./entry.ts";
import { idDi } from "./ids.ts";
import { extra, layout, PASSI_ONBOARDING, STATI_PROFILO, tema } from "./profile.ts";

const ms = (d: string) => z.number().describe(d);

export const ATTORI = ["dashboard", "oracolo", "mcp", "apikey", "sistema"] as const;

export const tables = {
  profiles: {
    authUserId: z.string().optional().describe("Utente Better Auth (mai pubblico)"),
    handle: handle.optional(),
    displayName: nomeVisualizzato.optional(),
    forma: forma.optional(),
    status: z.enum(STATI_PROFILO).describe("onboarding finché non c'è l'handle"),
    onboardingStep: z.enum(PASSI_ONBOARDING).describe("Passo dell'onboarding (mai pubblico)"),
    theme: tema,
    layout,
    extra,
    createdAt: ms("Creazione (ms)"),
  },
  handleAliases: {
    handle,
    profileId: idDi("profiles").describe("Profilo che aveva l'handle"),
    createdAt: ms("Creazione (ms)"),
  },
  people: {
    profileId: idDi("profiles").describe("Proprietario"),
    name: nomePersona,
  },
  gifters: {
    profileId: idDi("profiles").describe("Proprietario"),
    label: etichettaRegalo,
    url: urlHttps.optional(),
    logo: z
      .union([
        z.object({ storageId: idDi("_storage").describe("File caricato") }),
        z.object({ url: urlHttps.describe("Logo esterno (solo seed)") }),
      ])
      .optional()
      .describe("Logo caricato o, solo per il seed, esterno"),
  },
  wishlist: {
    profileId: idDi("profiles").describe("Proprietario"),
    artist: artista,
    ordine: z.number().int().describe("Posizione nella lista"),
  },
  departures: {
    profileId: idDi("profiles").describe("Proprietario"),
    name: nomePartenza,
    hasAddress: z.boolean().describe("Se l'indirizzo è impostato"),
    legacy: z.boolean().describe("Partenza del seed con km già calcolati"),
    lastCorrectionAt: z.number().optional().describe("Ultima correzione dell'indirizzo (ms)"),
    createdAt: ms("Creazione (ms)"),
  },
  departureSecrets: {
    departureId: idDi("departures").describe("Partenza"),
    profileId: idDi("profiles").describe("Proprietario"),
    address: z.string().describe("Indirizzo (privato)"),
    lng: z.number().describe("Longitudine (privata)"),
    lat: z.number().describe("Latitudine (privata)"),
    geocodedAt: ms("Geocodifica (ms)"),
  },
  geocodeDrafts: {
    profileId: idDi("profiles").describe("Proprietario"),
    departureId: idDi("departures").describe("Partenza"),
    candidates: z
      .array(z.object({ label: z.string().describe("Etichetta"), lng: z.number().describe("Longitudine"), lat: z.number().describe("Latitudine") }))
      .describe("Candidati della geocodifica (privati)"),
    expiresAt: ms("Scadenza (ms)"),
  },
  kmPairs: {
    profileId: idDi("profiles").describe("Proprietario"),
    departureId: idDi("departures").describe("Partenza"),
    venueId: idDi("venues").describe("Venue"),
    km: z.number().describe("Km estratti una volta sola"),
    source: z.enum(["legacy", "calcolato"]).describe("legacy = dal seed; calcolato = dalla ricetta"),
    drawnAt: ms("Estrazione (ms)"),
  },
  venues: {
    name: nomeVenue,
    city: nomeCitta,
    nameKey: z.string().describe("Nome normalizzato"),
    cityKey: z.string().describe("Città normalizzata"),
    lng: z.number().optional().describe("Longitudine (immutabile; assente finché una venue «utente» non ha la posizione)"),
    lat: z.number().optional().describe("Latitudine (immutabile; assente finché una venue «utente» non ha la posizione)"),
    osm: z.string().optional().describe("Id OpenStreetMap"),
    source: z.enum(["seed", "osm", "citta", "utente"]).describe("Origine: utente = nome e città scritti dal proprietario, posizione cercata dal server"),
    posizione: z.enum(["attesa", "poi", "citta", "non_trovata"]).optional().describe("Solo venue «utente»: la ricerca della posizione"),
    createdBy: idDi("profiles").optional().describe("Chi l'ha aggiunta"),
  },
  cities: {
    name: nomeCitta,
    key: z.string().describe("Città normalizzata"),
    lng: z.number().describe("Longitudine"),
    lat: z.number().describe("Latitudine"),
  },
  venueSearchCache: {
    keyHash: z.string().describe("SHA-256 della ricerca normalizzata"),
    results: z
      .array(
        z.object({
          osm: z.string().optional().describe("Id OpenStreetMap"),
          name: z.string().describe("Nome"),
          city: z.string().describe("Città"),
          lng: z.number().describe("Longitudine"),
          lat: z.number().describe("Latitudine"),
          featureType: z.enum(["poi", "city"]).describe("Tipo"),
          label: z.string().describe("Etichetta"),
        }),
      )
      .describe("Solo risultati POI (o città)"),
    fetchedAt: ms("Richiesta (ms)"),
  },
  entries: entryDbFields,
  activity: {
    profileId: idDi("profiles").describe("Proprietario"),
    at: ms("Quando (ms)"),
    actor: z
      .object({ via: z.enum(ATTORI).describe("Da dove"), label: z.string().describe("Autore leggibile") })
      .describe("Chi ha scritto"),
    op: z.string().describe("Operazione"),
    table: z.string().describe("Tabella toccata"),
    docId: z.string().describe("Documento toccato"),
    batchId: z.string().optional().describe("Lotto (unioni, import, ricalcoli)"),
    summary: z.string().describe("Riassunto leggibile"),
    before: z.any().optional().describe("Istantanea prima (solo tabelle pubbliche)"),
    after: z.any().optional().describe("Istantanea dopo (solo tabelle pubbliche)"),
    undoneBy: idDi("activity").optional().describe("Attività che l'ha annullata"),
    undoOf: idDi("activity").optional().describe("Attività annullata da questa"),
  },
  chatThreads: {
    profileId: idDi("profiles").describe("Pagina"),
    threadId: z.string().describe("Id del thread"),
    visibility: z.enum(["pubblica", "proprietario"]).describe("Chi può leggerlo"),
    title: z.string().describe("Titolo"),
    author: z.string().optional().describe("Autore dichiarato"),
    writeKeyHash: z.string().optional().describe("SHA-256 della chiave di scrittura (mai pubblico)"),
    ipHmac: z.string().optional().describe("HMAC dell'IP (mai pubblico)"),
    messages: z.array(z.any()).describe("Messaggi"),
    updatedAt: ms("Ultimo messaggio (ms)"),
    expiresAt: ms("Scadenza (ms)"),
  },
  devOtpOutbox: {
    email: z.string().describe("Email"),
    otp: z.string().describe("Codice"),
    type: z.string().describe("Tipo"),
    createdAt: ms("Creazione (ms)"),
  },
} as const;

export type TableShapes = typeof tables;
