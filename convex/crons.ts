/* TUTTE le voci dei cron (PIANO §4.5, §7.0): congelate nel traguardo 2, puntano
   a funzioni dei moduli proprietari (stub finché la corsia non le riempie). */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("registro: conservazione 180 giorni", { hourUTC: 3, minuteUTC: 10 }, internal.activity.cleanupOld, {});
crons.hourly("partenze: candidati scaduti", { minuteUTC: 5 }, internal.departures.cleanupDrafts, {});
crons.daily("oracolo: thread scaduti", { hourUTC: 3, minuteUTC: 20 }, internal.chat.cleanupExpired, {});
crons.daily("regali: loghi orfani", { hourUTC: 3, minuteUTC: 30 }, internal.gifters.cleanupOrphanLogos, {});
crons.daily("agenti: client DCR senza token", { hourUTC: 3, minuteUTC: 40 }, internal.agents.cleanupDcrClients, {});
crons.daily("agenti: token scaduti", { hourUTC: 3, minuteUTC: 50 }, internal.agents.cleanupExpiredTokens, {});
crons.hourly("otp di sviluppo: codici vecchi", { minuteUTC: 15 }, internal.devOtp.cleanup, {});

export default crons;
