/* "Entra con email" solo dove il codice arriva a una persona (flags.ts):
   con Resend sempre, col sender di sviluppo solo nei build e2e. Anche nel
   pannello vero, reso come nell'SSR. */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emailVisibile, type FlagsAccesso } from "./flags.ts";
import { PannelloAccesso } from "./PannelloAccesso.tsx";

const SVILUPPO: FlagsAccesso = { emailLogin: true, emailReale: false, googleLogin: false };
const RESEND: FlagsAccesso = { emailLogin: true, emailReale: true, googleLogin: false };
const SPENTA: FlagsAccesso = { emailLogin: false, emailReale: false, googleLogin: false };

const pannello = (flags: FlagsAccesso) => renderToStaticMarkup(createElement(PannelloAccesso, { next: "/benvenuto", flags }));

describe("emailVisibile", () => {
  it("fuori dagli e2e, senza Resend, l'email non si offre (il codice di sviluppo non lo legge nessuno)", () => {
    expect(emailVisibile(SVILUPPO, false)).toBe(false);
    expect(emailVisibile({ ...SVILUPPO, googleLogin: true }, false)).toBe(false);
    expect(emailVisibile(SPENTA, false)).toBe(false);
  });

  it("con Resend sì, anche fuori dagli e2e", () => {
    expect(emailVisibile(RESEND, false)).toBe(true);
    expect(emailVisibile({ ...RESEND, googleLogin: true }, false)).toBe(true);
  });

  it("nei build e2e anche col sender di sviluppo, mai col plugin spento", () => {
    expect(emailVisibile(SVILUPPO, true)).toBe(true);
    expect(emailVisibile(SPENTA, true)).toBe(false);
  });

  it("i test unitari non sono un build e2e", () => {
    expect(import.meta.env.VITE_E2E).not.toBe("1");
    expect(emailVisibile(SVILUPPO)).toBe(false);
  });
});

describe("PannelloAccesso", () => {
  it("Google e sender di sviluppo fuori dagli e2e: solo Google, niente bottone né campo email", () => {
    const html = pannello({ ...SVILUPPO, googleLogin: true });
    expect(html).toContain("Continua con Google");
    expect(html).not.toContain("Entra con email");
    expect(html).not.toContain('type="email"');
  });

  it("solo il sender di sviluppo fuori dagli e2e: nessun modo di entrare, e lo dice", () => {
    const html = pannello(SVILUPPO);
    expect(html).not.toContain('type="email"');
    expect(html).toContain("L&#x27;accesso non è disponibile");
  });

  it("con Resend: Google e, come seconda scelta, Entra con email; senza Google il campo subito", () => {
    expect(pannello({ ...RESEND, googleLogin: true })).toContain("Entra con email");
    expect(pannello(RESEND)).toContain('type="email"');
  });
});
