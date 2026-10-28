/* ──────────────────────────────────────────────────────────────
   TUTTI i limiti d'uso (PIANO §5.8), definiti qui una volta sola: le
   corsie li usano e non ne aggiungono (PIANO §4.5).
   ────────────────────────────────────────────────────────────── */

import { DAY, HOUR, MINUTE, RateLimiter, SECOND } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Oracolo (chiave: HMAC dell'IP, pagina o globale)
  chatIpMinute: { kind: "token bucket", rate: 8, period: MINUTE },
  chatIpDay: { kind: "fixed window", rate: 40, period: DAY },
  chatGlobalDay: { kind: "fixed window", rate: 200, period: DAY },
  chatPageDay: { kind: "fixed window", rate: 60, period: DAY }, // gabrifila: CHAT_PAGE_DAY_GABRIFILA
  chatOtherPagesDay: { kind: "fixed window", rate: 120, period: DAY }, // tutte le pagine tranne gabrifila
  // scritture degli agenti (profilo; un import conta 1 per lotto)
  agentWrites: { kind: "token bucket", rate: 200, period: HOUR },
  // geocoding (profilo / attore) e la coda globale di Nominatim (1 al secondo)
  geocodeProfile: { kind: "fixed window", rate: 30, period: HOUR },
  geocodeActor: { kind: "fixed window", rate: 30, period: HOUR },
  nominatimGlobal: { kind: "token bucket", rate: 1, period: SECOND, capacity: 1, maxReserved: 30 },
  // venue nuove scritte per nome (profilo): il catalogo è condiviso, un import di tutta la storia ci sta
  venueNuove: { kind: "fixed window", rate: 150, period: HOUR },
  // correzione dell'indirizzo (partenza)
  addressCorrection: { kind: "fixed window", rate: 1, period: DAY },
  // OTP via email (email / globale)
  otpSendEmail: { kind: "fixed window", rate: 3, period: 10 * MINUTE },
  otpSendGlobal: { kind: "fixed window", rate: 50, period: HOUR },
  // registrazione dinamica dei client OAuth (globale)
  dcrGlobal: { kind: "fixed window", rate: 20, period: HOUR },
  // tema da descrizione (profilo / globale)
  themeFromDescription: { kind: "fixed window", rate: 10, period: DAY },
  themeGlobalDay: { kind: "fixed window", rate: 50, period: DAY },
  // caricamento dei loghi (profilo)
  logoUpload: { kind: "fixed window", rate: 20, period: DAY },
});

/** Limite giornaliero di chatPageDay per gabrifila (PIANO §5.8). */
export const CHAT_PAGE_DAY_GABRIFILA = 120;

export const NOMI_LIMITI = [
  "chatIpMinute", "chatIpDay", "chatGlobalDay", "chatPageDay", "chatOtherPagesDay",
  "agentWrites", "geocodeProfile", "geocodeActor", "nominatimGlobal", "venueNuove", "addressCorrection",
  "otpSendEmail", "otpSendGlobal", "dcrGlobal", "themeFromDescription", "themeGlobalDay", "logoUpload",
] as const;
