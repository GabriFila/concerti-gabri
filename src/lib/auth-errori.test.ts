import { describe, expect, it } from "vitest";
import { messaggioErroreAuth, messaggioErroreGoogle } from "./auth-errori.ts";

describe("errori del login", () => {
  it("Google: annullato o non riuscito", () => {
    expect(messaggioErroreGoogle("access_denied")).toBe("Accesso con Google annullato.");
    expect(messaggioErroreGoogle("unable_to_create_user")).toBe("L'accesso con Google non è riuscito: riprova.");
  });

  it("OTP: un 403 qualunque dà il messaggio generico", () => {
    expect(messaggioErroreAuth({ status: 403, message: "qualcos'altro" })).toBe("Qualcosa non ha funzionato: riprova tra poco.");
  });

  it("codici di Better Auth e 429", () => {
    expect(messaggioErroreAuth({ code: "INVALID_OTP" })).toMatch(/Codice sbagliato/);
    expect(messaggioErroreAuth({ status: 429, message: "Troppi codici richiesti: riprova tra qualche minuto." })).toMatch(/Troppi codici/);
    expect(messaggioErroreAuth({ status: 429 })).toMatch(/Troppe richieste/);
    expect(messaggioErroreAuth(null)).toMatch(/riprova tra poco/);
  });
});
