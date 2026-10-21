/* ──────────────────────────────────────────────────────────────
   Limiti d'uso dell'Oracolo, in memoria (per istanza della funzione, si
   azzerano a ogni avvio a freddo: un dosso, non un muro). Fino al traguardo
   6, quando passano al rate limiter di Convex, è l'unico limite.

   Valori predefiniti come su Netlify: 8 al minuto e 40 al giorno per IP,
   200 al giorno in tutto; CHAT_RPM_PER_IP / CHAT_RPD_PER_IP / CHAT_RPD_GLOBAL
   li cambiano.
   ────────────────────────────────────────────────────────────── */

export interface RateLimits { perMinuteIp: number; perDayIp: number; perDayGlobal: number }

export function rateLimitsFromEnv(env: Record<string, string | undefined>): RateLimits {
  return {
    perMinuteIp: Number(env.CHAT_RPM_PER_IP) || 8,
    perDayIp: Number(env.CHAT_RPD_PER_IP) || 40,
    perDayGlobal: Number(env.CHAT_RPD_GLOBAL) || 200,
  };
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_KEYS = 10_000; // tetto alla memoria: oltre, si buttano le chiavi ormai scadute

export class MemoryRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limits: RateLimits, private clock: () => number = Date.now) {}

  private allow(key: string, limit: number, windowMs: number): boolean {
    const now = this.clock();
    const recent = (this.hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= limit) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private prune(): void {
    if (this.hits.size <= MAX_KEYS) return;
    const now = this.clock();
    for (const [k, ts] of this.hits) if (!ts.some(t => now - t < DAY)) this.hits.delete(k);
  }

  /** Consuma un turno per `ip`; reason dice quale limite è scattato. */
  check(ip: string): { allowed: true } | { allowed: false; reason: "per-minute" | "per-day" | "global" } {
    this.prune();
    if (!this.allow(`m:${ip}`, this.limits.perMinuteIp, MINUTE)) return { allowed: false, reason: "per-minute" };
    if (!this.allow(`d:${ip}`, this.limits.perDayIp, DAY)) return { allowed: false, reason: "per-day" };
    if (!this.allow("g", this.limits.perDayGlobal, DAY)) return { allowed: false, reason: "global" };
    return { allowed: true };
  }
}

/** Il messaggio per il visitatore (friendlyError riconosce "Troppi"/"Limite"). */
export const rateLimitMessage = (reason: "per-minute" | "per-day" | "global"): string =>
  reason === "per-minute"
    ? "Troppi messaggi ravvicinati: aspetta un minuto e riprova."
    : "Limite giornaliero della chat raggiunto: riprova domani.";
