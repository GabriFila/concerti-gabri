import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { datiErrore, messaggioErrore } from "./errori.ts";

describe("messaggioErrore", () => {
  it("rende leggibile il messaggio di un ConvexError", () => {
    const e = new ConvexError({ code: "conflitto", messaggio: "esiste già una partenza con questo nome", campo: "name" });
    expect(messaggioErrore(e)).toBe("Esiste già una partenza con questo nome.");
    expect(datiErrore(e)?.campo).toBe("name");
    expect(messaggioErrore(new ConvexError({ code: "x", messaggio: "riprova!" }))).toBe("Riprova!");
  });

  it("per tutto il resto un messaggio generico (mai il testo dell'errore)", () => {
    expect(messaggioErrore(new Error("Via dei Canarini 7"))).toBe("Qualcosa non ha funzionato: riprova tra poco.");
    expect(messaggioErrore(new ConvexError("testo"))).toMatch(/riprova/);
    expect(datiErrore(null)).toBeNull();
  });
});
