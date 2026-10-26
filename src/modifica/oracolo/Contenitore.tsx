/* ──────────────────────────────────────────────────────────────
   Il contenitore dell'Oracolo in scrittura (spec ux-modifica §7): un
   solo <dialog id="oracolo">, montato una volta dopo l'idratazione e mai
   smontato su /modifica. La chat dentro (ChatScrittura, corsia
   ux-agente) resta viva quando si chiude: useChat di @tanstack/ai-react
   fermerebbe il flusso e scarterebbe le approvazioni in sospeso se lo
   smontassimo.

   - ancorato (≥ 1024 px): `show()`, non modale, a destra del contenuto
     (che si stringe: --mf-oracolo-w su .mf-app); si scrive nei form
     mentre si chatta.
   - laterale-modale (768–1023) e foglio (< 768): `showModal()`.
   - Cambio di modo a finestra aperta (resize): si chiude e si riapre lo
     stesso elemento nel modo nuovo, senza toccare lo stato.
   - Esc: nei modi modali il `cancel` del dialog; agganciato solo se il
     focus è dentro e la chat non l'ha già usato (preventDefault).
   - Il contenitore non lega mai Invio: Invio manda e ⌘/⌥/⇧+Invio va a
     capo, ed è affare della chat.
   - Uscire da /modifica (Sul palco, I dati, il gesto indietro, la
     scheda del browser) con una scheda dell'Oracolo modificata a mano e
     non salvata chiede prima, come un pannello con modifiche
     (`GuardiaSchede`, useBlocker): la chat non sopravvive all'uscita.
     Cambiare vista dentro /modifica non chiede (la chat resta viva).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useBlocker, useHydrated } from "@tanstack/react-router";
import { Icon } from "../../ui/Icon.tsx";
import { ChatScrittura } from "../ChatScrittura.tsx";
import { haModificate, titoliModificate } from "../scheda/store.ts";
import { Conferma } from "../sezioni/comuni.tsx";
import { useOracoloInterno } from "./contesto.tsx";

export function ContenitoreOracolo({ handle }: { handle: string }) {
  return useHydrated() ? <Dialogo handle={handle} /> : null;
}

function Dialogo({ handle }: { handle: string }) {
  const o = useOracoloInterno();
  const ref = useRef<HTMLDialogElement>(null);
  // chiusure fatte da noi (comprese quelle per cambiare modo): il `close` che segue non è dell'utente
  const daNoi = useRef(0);
  const eraAperto = useRef(false);
  const chiudi = useRef(o.chiudi);
  chiudi.current = o.chiudi;

  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    const modale = o.modo !== "ancorato";
    if (!o.aperto) {
      if (d.open) {
        daNoi.current++;
        d.close();
      }
    } else {
      if (d.open && d.matches(":modal") !== modale) {
        daNoi.current++;
        d.close();
      }
      if (!d.open) {
        if (modale) d.showModal();
        else d.show();
      }
    }
    if (o.aperto && !eraAperto.current) {
      // aperto da una persona: il focus nella casella della chat
      if (o.daUtente.current) d.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
      o.daUtente.current = false;
    } else if (!o.aperto && eraAperto.current) {
      // chiuso: il focus torna al pulsante che l'aveva aperto, se si era perso
      const a = o.apritore.current;
      const att = document.activeElement;
      if (a?.isConnected && (!att || att === document.body || d.contains(att))) a.focus({ preventScroll: true });
    }
    eraAperto.current = o.aperto;
  }, [o.aperto, o.modo, o.daUtente, o.apritore]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // modi modali: Esc chiude con la nostra logica (cronologia compresa)
    const onCancel = (e: Event) => {
      e.preventDefault();
      chiudi.current();
    };
    // chiuso dal browser senza `cancel` (Chrome, Esc ripetuto): lo stato segue
    const onClose = () => {
      if (daNoi.current > 0) {
        daNoi.current--;
        return;
      }
      chiudi.current();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onClose);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onClose);
    };
  }, []);

  // agganciato: Esc chiude solo col focus dentro, e solo se la chat non l'ha già usato
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Escape" || e.defaultPrevented || e.nativeEvent.isComposing || o.modo !== "ancorato") return;
    if (!ref.current?.contains(e.target as Node) || document.querySelector("dialog:modal")) return;
    e.preventDefault();
    o.chiudi();
  };

  // tablet: un clic sullo sfondo, fuori dal foglio, lo chiude
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    const d = ref.current;
    if (!d || e.target !== d || o.modo !== "laterale-modale") return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) o.chiudi();
  };

  return (
    <dialog id="oracolo" ref={ref} className="mf-oracolo" aria-label="Il Tour manager" data-modo={o.modo} onKeyDown={onKeyDown} onClick={onClick}>
      <ChatScrittura handle={handle} />
      <GuardiaSchede />
    </dialog>
  );
}

const elenco = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

/**
 * La guardia delle schede modificate a mano e non salvate: solo uscendo da
 * /modifica (o chiudendo la scheda del browser), come le impostazioni. La
 * conferma è un portale (Modale), sopra anche al foglio dell'Oracolo.
 */
function GuardiaSchede() {
  const blocco = useBlocker({
    shouldBlockFn: ({ current, next }) => haModificate() && current.pathname !== next.pathname,
    enableBeforeUnload: haModificate,
    withResolver: true,
  });
  if (blocco.status !== "blocked") return null;
  const titoli = titoliModificate().map(t => `«${t}»`);
  return (
    <Conferma
      titolo="Modifiche non salvate"
      etichetta="Esci senza salvare"
      annulla="Continua a modificare"
      onConferma={() => blocco.proceed()}
      onChiudi={() => blocco.reset()}
    >
      <p>
        {titoli.length > 1
          ? `Le schede di ${elenco(titoli)} nel Tour manager non sono salvate: se esci adesso le perdi.`
          : `La scheda di ${titoli[0] ?? "un concerto"} nel Tour manager non è salvata: se esci adesso la perdi.`}
      </p>
    </Conferma>
  );
}

/**
 * La testa del pannello (52 px): il titolo, le azioni della chat
 * («Nuova chat», «Le tue chat private») e la ✕. La rende la chat come
 * primo figlio, così le azioni restano sue.
 */
export function TestaOracolo({ azioni }: { azioni?: ReactNode }) {
  const o = useOracoloInterno();
  return (
    <div className="mf-oracolo-testa">
      <span className="mf-oracolo-titolo">
        <Icon name="pen" size={17} stroke={1.8} />
        Il Tour manager
      </span>
      <div className="mf-oracolo-azioni">
        {azioni}
        <button type="button" className="fp-close" onClick={o.chiudi} aria-label="Chiudi" title="Chiudi il Tour manager">
          <Icon name="close" size={18} stroke={2} />
        </button>
      </div>
    </div>
  );
}

/** Il pulsante che apre e chiude l'Oracolo: nella barra in alto (`barra`) o al centro della barra in basso (`scheda`). */
export function InterruttoreOracolo({ variante }: { variante: "barra" | "scheda" }) {
  const o = useOracoloInterno();
  // nell'HTML del server c'è già, ma l'Oracolo arriva con l'idratazione: prima non risponderebbe
  const pronto = useHydrated();
  const nome = `${o.aperto ? "Chiudi" : "Apri"} il Tour manager${o.nonLetta ? " (nuova risposta)" : ""}`;
  return (
    <button
      type="button"
      className={variante === "barra" ? "mf-oracolo-pulsante" : "mf-scheda mf-scheda-oracolo"}
      data-aperto={o.aperto ? "1" : undefined}
      aria-label={nome}
      aria-expanded={o.aperto}
      aria-controls="oracolo"
      title={o.aperto ? "Chiudi il Tour manager" : "Apri il Tour manager"}
      disabled={!pronto}
      onClick={o.alterna}
    >
      <span className="mf-oracolo-icona" aria-hidden="true">
        <Icon name="spark" size={variante === "barra" ? 17 : 22} stroke={1.7} />
        {o.nonLetta && <span className="mf-punto mf-punto-ambra" />}
      </span>
      <span className="mf-oracolo-etichetta">Tour manager</span>
    </button>
  );
}
