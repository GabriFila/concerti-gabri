/* ──────────────────────────────────────────────────────────────
   Email del login (PIANO §1.28): Resend via `fetch`, con un modello in
   italiano. Si usa solo se RESEND_API_KEY ed EMAIL_FROM sono impostate sul
   deployment e il sender di sviluppo non vince (convex/authFlags.ts). Il
   mittente è EMAIL_FROM; EMAIL_FROM_PREDEFINITO è il valore previsto
   (DECISIONI), usato solo se si chiama questa funzione senza.

   Gli errori non ripetono mai l'email né il codice: finiscono nei log di
   Convex (Better Auth registra gli errori della callback di invio).
   ────────────────────────────────────────────────────────────── */

export const EMAIL_FROM_PREDEFINITO = "Concerti <notifications@concerti.gabrifila.me>";
export const RESEND_URL = "https://api.resend.com/emails";
/** Validità del codice: la stessa di `expiresIn` di emailOTP in convex/auth.ts. */
export const OTP_MINUTI = 10;

export interface Messaggio {
  subject: string;
  text: string;
  html: string;
}

/** Il modello dell'email con il codice. */
export function modelloOtp(otp: string, minuti = OTP_MINUTI): Messaggio {
  const codice = otp.replace(/[^0-9A-Za-z]/g, "");
  return {
    subject: "Il tuo codice per Concerti",
    text: [
      `Il tuo codice per entrare in Concerti è ${codice}.`,
      `Scade tra ${minuti} minuti.`,
      "",
      "Se non l'hai chiesto tu, ignora questa email: senza il codice nessuno può entrare.",
    ].join("\n"),
    html: [
      '<div style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#1b1b1f">',
      "<p>Il tuo codice per entrare in Concerti è</p>",
      `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${codice}</p>`,
      `<p>Scade tra ${minuti} minuti.</p>`,
      '<p style="color:#6b6b76;font-size:14px">Se non l\'hai chiesto tu, ignora questa email: senza il codice nessuno può entrare.</p>',
      "</div>",
    ].join(""),
  };
}

type Env = Record<string, string | undefined>;

/** Manda il codice con Resend. Lancia (senza email né codice nel messaggio) se Resend rifiuta. */
export async function inviaOtpResend(
  { email, otp }: { email: string; otp: string },
  { env = process.env, fetchFn = fetch }: { env?: Env; fetchFn?: typeof fetch } = {},
): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) throw new Error("email: RESEND_API_KEY mancante");
  const from = env.EMAIL_FROM?.trim() || EMAIL_FROM_PREDEFINITO;
  const r = await fetchFn(RESEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [email], ...modelloOtp(otp) }),
  });
  if (!r.ok) throw new Error(`email: Resend ha risposto ${r.status}`);
}
