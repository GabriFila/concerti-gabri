/* ──────────────────────────────────────────────────────────────
   Better Auth su Convex (PIANO traguardo 3, §1.1, §1.28–1.29).

   - Componente installato in locale (convex/betterAuth/): i plugin che
     cambiano lo schema (mcp, apiKey) sono SEMPRE inclusi, perché la CLI
     dello schema e il componente valutano queste opzioni senza env.
   - `baseURL` è SITE_URL, esplicito: mai ricavato dagli header.
   - Google solo se le credenziali sono sul deployment, con
     `prompt: "select_account"`. Email OTP solo se un sender è attivo
     (convex/authFlags.ts): 6 cifre, 10 minuti, 5 tentativi, hashato.
     oAuthProxy solo con OAUTH_PROXY_SECRET (allo switch, §1.43).
   - I limiti per IP di Better Auth sono spenti (§1.29: nelle httpAction
     l'IP non è affidabile). Contano i limiti Convex: `otpSendEmail` e
     `otpSendGlobal` prima di ogni invio di codice (vedi limitaInvioOtp).
   - SIGNUP_ALLOWLIST (email separate da virgola): se c'è, solo quelle
     email creano un account. Assente = registrazione aperta. Il rifiuto
     è il codice NON_INVITATO (shared/accesso.ts), lo stesso per OTP e
     Google. A un'email fuori elenco e senza account non parte nemmeno il
     codice (invioOtpDaSaltare): risposta identica a un invio vero, niente
     enumerazione, nessun limite consumato. Altrimenti chiunque farebbe
     spedire codici a indirizzi qualsiasi col mittente di concerti.gabrifila.me
     ed esaurirebbe otpSendGlobal agli invitati.
   - Il primo login crea l'utente e, nella stessa transazione (trigger),
     il profilo in `onboarding` (convex/profiles.ts lo completa).
   - MCP: `mcp({ ...opzioniMcp })` seguito da `irrobustimentoMcp(ctx)`,
     da convex/authMcp.ts (corsia 7); finché MCP_ATTIVO è false tutti i
     suoi percorsi sono in disabledPaths, e `/mcp/get-session` lo resta
     sempre (PERCORSI_MCP_DISATTIVATI: restituirebbe il refresh token).
   - `deleteUser` è abilitato ma `/delete-user` via HTTP no: l'account si
     elimina solo con `account.delete` (corsia 5, §5.9), che fa la cascata
     e poi chiama `auth.api.deleteUser` lato server (disabledPaths ferma
     solo il router HTTP). Una POST diretta lascerebbe orfani profilo,
     pagina pubblica e partenze.
   - Il JWT di Convex porta solo `sub`, `sessionId` e le date: niente
     email né nome (finisce nel browser; convex/lib/owner.ts legge solo
     `subject` e `sessionId`).
   ────────────────────────────────────────────────────────────── */

import { apiKey } from "@better-auth/api-key";
import { createClient, type AuthFunctions, type GenericCtx, type Triggers } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { mcp } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins/email-otp";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { v } from "convex/values";
import { MESSAGGIO_INVITO, NON_INVITATO } from "../shared/accesso.ts";
import { LAYOUT_VUOTO, TEMA_PREDEFINITO } from "../shared/schema/profile.ts";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import authConfig from "./auth.config";
import { googleAttivo, senderOtp } from "./authFlags.ts";
import { irrobustimentoMcp, MCP_ATTIVO, opzioniMcp, PERCORSI_MCP_DISATTIVATI } from "./authMcp.ts";
import authSchema from "./betterAuth/schema";
import { inviaOtpResend, OTP_MINUTI } from "./email.ts";
import { internalMutation } from "./lib/builders.ts";
import { rateLimiter } from "./rateLimits.ts";

type Env = Record<string, string | undefined>;

/* ── profilo al primo login ────────────────────────────────────── */

/** Il profilo `onboarding` di un utente nuovo; mai un secondo profilo. */
export async function creaProfiloOnboarding(ctx: MutationCtx, authUserId: string) {
  const esiste = await ctx.db.query("profiles").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).first();
  if (esiste) return esiste._id;
  return await ctx.db.insert("profiles", {
    authUserId,
    status: "onboarding",
    onboardingStep: "partenze",
    theme: { ...TEMA_PREDEFINITO },
    layout: { ordine: [...LAYOUT_VUOTO.ordine], nascoste: [...LAYOUT_VUOTO.nascoste], titoli: {} },
    extra: {},
    createdAt: Date.now(),
  });
}

const triggers: Triggers<DataModel, typeof authSchema> = {
  user: {
    onCreate: async (ctx, user) => {
      await creaProfiloOnboarding(ctx, user._id);
    },
  },
};

/** Il trigger che il componente chiama (con un function handle) quando crea un documento. */
export const onCreate = internalMutation({
  args: { doc: v.any(), model: v.string() },
  returns: v.null(),
  handler: async (ctx, { doc, model }) => {
    if (model === "user") await triggers.user?.onCreate?.(ctx, doc);
    return null;
  },
});

const authFunctions: AuthFunctions = { onCreate: internal.auth.onCreate };

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema },
  authFunctions,
  triggers,
});

/* ── regole ────────────────────────────────────────────────────── */

/** Le email ammesse alla registrazione: tutte se SIGNUP_ALLOWLIST manca. */
export function emailAmmessa(email: string, env: Env = process.env): boolean {
  const elenco = (env.SIGNUP_ALLOWLIST ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !elenco.length || elenco.includes(email.trim().toLowerCase());
}

export { MESSAGGIO_INVITO, NON_INVITATO };
export const MESSAGGIO_TROPPI_CODICI = "Troppi codici richiesti: riprova tra qualche minuto.";

/** I percorsi di MCP (plugin mcp di Better Auth 1.6). */
export const PERCORSI_MCP = [
  "/mcp/authorize", "/mcp/token", "/mcp/register", "/mcp/get-session", "/oauth2/consent",
  "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource",
];

/** I percorsi di emailOTP che non usiamo (password, cambio email, verifiche separate). */
export const PERCORSI_OTP_SPENTI = [
  "/email-otp/check-verification-otp", "/email-otp/verify-email", "/email-otp/request-password-reset",
  "/forget-password/email-otp", "/email-otp/reset-password", "/email-otp/request-email-change", "/email-otp/change-email",
];

/** Eliminare l'account via HTTP: solo `account.delete` lo fa, dopo la cascata (§5.9). */
export const PERCORSI_ACCOUNT_SPENTI = ["/delete-user", "/delete-user/callback"];

export function percorsiSpenti(mcpAttivo = MCP_ATTIVO): string[] {
  return [...(mcpAttivo ? PERCORSI_MCP_DISATTIVATI : PERCORSI_MCP), ...PERCORSI_OTP_SPENTI, ...PERCORSI_ACCOUNT_SPENTI];
}

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, "0")).join("");
}

/** La chiave di `otpSendEmail` per un'email: lo SHA-256 dell'email normalizzata (mai l'email in chiaro). */
export const chiaveOtpEmail = (email: string) => sha256(email.trim().toLowerCase());

/**
 * I limiti d'invio dei codici (§5.8): 3 ogni 10 minuti per email (chiave:
 * SHA-256 dell'email) e 50 all'ora in tutto. Si controllano PRIMA che
 * Better Auth generi il codice: la callback di invio gira dopo che il
 * codice è già stato salvato, e Better Auth ne inghiotte gli errori,
 * quindi lì un rifiuto invaliderebbe il codice di prima senza dirlo.
 */
export async function limitaInvioOtp(ctx: GenericCtx<DataModel>, email: unknown) {
  // un'email malformata la rifiuta Better Auth subito dopo, senza inviare: non consuma i limiti
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
  const rctx = requireRunMutationCtx(ctx);
  const perEmail = await rateLimiter.limit(rctx, "otpSendEmail", { key: await chiaveOtpEmail(e) });
  const globale = perEmail.ok ? await rateLimiter.limit(rctx, "otpSendGlobal") : perEmail;
  if (!globale.ok) throw new APIError("TOO_MANY_REQUESTS", { message: MESSAGGIO_TROPPI_CODICI });
}

/**
 * true se un codice per `email` non va né generato né inviato: c'è
 * SIGNUP_ALLOWLIST, l'email non è nell'elenco e non ha già un account (chi
 * l'ha, magari da prima dell'elenco, entra come sempre). Un'email malformata
 * la rifiuta Better Auth subito dopo.
 */
export async function invioOtpDaSaltare(email: unknown, trovaUtente: (email: string) => Promise<unknown>, env: Env = process.env): Promise<boolean> {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!e || emailAmmessa(e, env)) return false;
  return !(await trovaUtente(e));
}

/* ── opzioni ───────────────────────────────────────────────────── */

const origini = (s: string | undefined) => (s ?? "").split(",").map(x => x.trim()).filter(Boolean);

/** API key (§1.29): con `enableSessionForAPIKeys` una chiave varrebbe come sessione "dashboard"; il limite interno (10 al giorno) lo sostituisce `agentWrites`. */
export const OPZIONI_API_KEY = { defaultPrefix: "cgk_", enableSessionForAPIKeys: false, rateLimit: { enabled: false } } as const;

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const env = process.env;
  const sender = senderOtp(env);
  return {
    baseURL: env.SITE_URL,
    trustedOrigins: origini(env.BETTER_AUTH_TRUSTED_ORIGINS),
    database: authComponent.adapter(ctx),
    rateLimit: { enabled: false },
    user: { deleteUser: { enabled: true } },
    disabledPaths: percorsiSpenti(),
    ...(googleAttivo(env)
      ? { socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" as const } } }
      : {}),
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            // il messaggio è un codice: con Google diventa il `?error=` di /accedi
            if (!emailAmmessa(user.email)) throw new APIError("FORBIDDEN", { message: NON_INVITATO, code: NON_INVITATO.toUpperCase() });
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async c => {
        if (c.path !== "/email-otp/send-verification-otp") return;
        const email = (c.body as { email?: unknown } | undefined)?.email;
        // fuori elenco e senza account: la stessa risposta di un invio vero, ma nessun codice
        if (await invioOtpDaSaltare(email, e => c.context.internalAdapter.findUserByEmail(e))) return c.json({ success: true });
        await limitaInvioOtp(ctx, email);
      }),
    },
    plugins: [
      // niente email né nome nel JWT (il default li mette): bastano sub e sessionId, aggiunti dal plugin
      convex({ authConfig, jwt: { definePayload: () => ({}) } }),
      mcp({ ...opzioniMcp }),
      // subito dopo mcp(): consenso sempre, solo gli scope ammessi, dcrGlobal sulla registrazione (corsia 7)
      irrobustimentoMcp(ctx),
      apiKey({ ...OPZIONI_API_KEY, rateLimit: { ...OPZIONI_API_KEY.rateLimit } }),
      ...(sender
        ? [
            emailOTP({
              otpLength: 6,
              expiresIn: OTP_MINUTI * 60,
              allowedAttempts: 5,
              storeOTP: "hashed",
              sendVerificationOTP: async ({ email, otp, type }) => {
                if (sender === "sviluppo") await requireRunMutationCtx(ctx).runMutation(internal.devOtp.record, { email, otp, type });
                else await inviaOtpResend({ email, otp });
              },
            }),
          ]
        : []),
      ...(env.OAUTH_PROXY_SECRET
        ? [oAuthProxy({ currentURL: env.SITE_URL, productionURL: env.OAUTH_PROXY_PRODUCTION_URL, secret: env.OAUTH_PROXY_SECRET })]
        : []),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
