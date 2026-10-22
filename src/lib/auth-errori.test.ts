import { describe, expect, it } from "vitest";
import { MESSAGGIO_INVITO, NON_INVITATO } from "../../shared/accesso.ts";
import { messaggioErroreAuth, messaggioErroreGoogle } from "./auth-errori.ts";

describe("errori del login", () => {
  it("Google: il rifiuto di SIGNUP_ALLOWLIST arriva come ?error=non_invitato e dà il messaggio dell'invito", () => {
    // il valore che Better Auth mette nel redirect: il messaggio dell'APIError con gli spazi → "_"
    expect(NON_INVITATO.split(" ").join("_")).toBe("non_invitato");
    expect(messaggioErroreGoogle("non_invitato")).toBe(MESSAGGIO_INVITO);
    expect(messaggioErroreGoogle("access_denied")).toBe("Accesso con Google annullato.");
    // un errore qualunque nella creazione dell'utente non è un rifiuto d'invito
    expect(messaggioErroreGoogle("unable_to_create_user")).toBe("L'accesso con Google non è riuscito: riprova.");
  });

  it("OTP: il 403 con code NON_INVITATO dà lo stesso messaggio", () => {
    expect(messaggioErroreAuth({ status: 403, code: "NON_INVITATO", message: "non_invitato" })).toBe(MESSAGGIO_INVITO);
    expect(messaggioErroreAuth({ status: 403, message: "qualcos'altro" })).toBe("Qualcosa non ha funzionato: riprova tra poco.");
  });

  it("codici di Better Auth e 429", () => {
    expect(messaggioErroreAuth({ code: "INVALID_OTP" })).toMatch(/Codice sbagliato/);
    expect(messaggioErroreAuth({ status: 429, message: "Troppi codici richiesti: riprova tra qualche minuto." })).toMatch(/Troppi codici/);
    expect(messaggioErroreAuth({ status: 429 })).toMatch(/Troppe richieste/);
    expect(messaggioErroreAuth(null)).toMatch(/riprova tra poco/);
  });
});
