/* I tasti della casella delle due chat dell'Oracolo: Invio manda,
   ⇧/⌥/⌘/Ctrl+Invio vanno a capo, durante la composizione IME niente, e
   con la sola tastiera a schermo Invio va a capo. */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { tastiInvio } from "./parti.tsx";

function evento(x: { key?: string; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; isComposing?: boolean; keyCode?: number } = {}) {
  const preventDefault = vi.fn();
  const e = {
    key: x.key ?? "Enter",
    shiftKey: !!x.shiftKey,
    altKey: !!x.altKey,
    metaKey: !!x.metaKey,
    ctrlKey: !!x.ctrlKey,
    keyCode: x.keyCode ?? 13,
    nativeEvent: { isComposing: !!x.isComposing },
    currentTarget: {},
    preventDefault,
  } as unknown as KeyboardEvent<HTMLTextAreaElement>;
  return { e, preventDefault };
}

afterEach(() => vi.unstubAllGlobals());

describe("tastiInvio", () => {
  it("Invio manda (e non va a capo)", () => {
    const invia = vi.fn();
    const { e, preventDefault } = evento();
    tastiInvio(e, invia);
    expect(invia).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("⇧+Invio va a capo da sé (il browser), senza mandare", () => {
    const invia = vi.fn();
    const { e, preventDefault } = evento({ shiftKey: true });
    tastiInvio(e, invia);
    expect(invia).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("⌥, ⌘ e Ctrl+Invio vanno a capo (lo inserisce la casella), senza mandare", () => {
    const execCommand = vi.fn(() => true);
    vi.stubGlobal("document", { execCommand });
    for (const mod of [{ altKey: true }, { metaKey: true }, { ctrlKey: true }]) {
      const invia = vi.fn();
      const { e, preventDefault } = evento(mod);
      tastiInvio(e, invia);
      expect(invia).not.toHaveBeenCalled();
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    expect(execCommand).toHaveBeenCalledTimes(3);
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "\n");
  });

  it("durante la composizione IME Invio conferma la parola: niente invio", () => {
    const invia = vi.fn();
    tastiInvio(evento({ isComposing: true }).e, invia);
    tastiInvio(evento({ keyCode: 229 }).e, invia);
    expect(invia).not.toHaveBeenCalled();
  });

  it("solo tastiera a schermo: Invio va a capo, si manda col pulsante", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("pointer: coarse") }));
    const invia = vi.fn();
    const { e, preventDefault } = evento();
    tastiInvio(e, invia);
    expect(invia).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("gli altri tasti non li tocca", () => {
    const invia = vi.fn();
    const { e, preventDefault } = evento({ key: "a" });
    tastiInvio(e, invia);
    expect(invia).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
