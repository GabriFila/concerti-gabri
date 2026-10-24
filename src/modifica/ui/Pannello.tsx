/* ──────────────────────────────────────────────────────────────
   Il pannello dei form di /<handle>/modifica (spec ux-modifica §5.1): un
   <dialog> nativo, in #mf-pannelli (fuori da ogni <section>).

   - ≥ 1024 px: `show()`, non modale, a destra del contenuto: l'elenco
     resta visibile e cliccabile (e l'Oracolo agganciato pure).
   - < 1024 px: `showModal()`, foglio a destra (tablet) o a tutto schermo
     (telefono): focus contenuto, sfondo inerte, sopra a tutto.
   Il modo si decide all'apertura; poi il CSS adatta solo le misure.

   Testa con titolo (h2) e ✕ «Chiudi» (l'unico pulsante col nome
   «Chiudi»: gli e2e lo cercano così), corpo che scorre da solo, piede
   fisso con le azioni e «● Modifiche non salvate».

   Ogni chiusura è una navigazione (il pannello sta nell'hash), quindi
   una sola guardia copre ✕, Esc, «Annulla», la navigazione, il gesto
   «indietro» e l'apertura di un'altra riga: useBlocker, con la conferma
   «Modifiche non salvate». Dopo un salvataggio si chiude con
   `chiudiPannello({ dopoSalvataggio: true })`, che la salta.
   ⌘/Ctrl+Invio dentro il pannello manda il suo form (mai fuori: non
   arriva alla chat dell'Oracolo), col pulsante principale del piede e
   solo se è acceso: niente doppioni mentre salva, niente scritture
   vuote quando non c'è niente da salvare, niente ripetizione del tasto
   tenuto giù. «Continua a modificare» della guardia rinuncia anche
   all'apertura che il ponte dell'editor aveva chiesto (editor.tsx).
   ────────────────────────────────────────────────────────────── */

import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBlocker } from "@tanstack/react-router";
import { Icon } from "../../ui/Icon.tsx";
import { useRinunciaEditor } from "../editor.tsx";
import { modoPannello, type ModoPannello } from "../layout.ts";
import { Conferma } from "../sezioni/comuni.tsx";
import { Menu, type VoceMenu } from "./Menu.tsx";

export interface PannelloProps {
  /** Il nome accessibile (h2). */
  titolo: string;
  sottotitolo?: ReactNode;
  /** media: 480 px; larga: 560 px (600 da 1280 px). */
  larghezza?: "media" | "larga";
  /** Il form ha modifiche da perdere: la guardia chiede prima di chiudere. */
  sporco: boolean;
  /** Di solito useVista().chiudiPannello(). */
  onChiudi: () => void;
  /** Le azioni del piede (fisso in basso); null = nessun piede. */
  piedi: ReactNode;
  /** Il menu «Altre azioni» (⋯) nella testa, accanto alla ✕. */
  azioni?: VoceMenu[];
  /** Sotto il titolo: avvisi, riepilogo degli errori. */
  testa?: ReactNode;
  /** L'id del form che ⌘/Ctrl+Invio manda (altrimenti il primo form del pannello). */
  modulo?: string;
  /** La guardia ha tenuto aperto il pannello («Continua a modificare»). */
  onResta?: () => void;
  /** Entra senza scivolare (prende il posto di un pannello già aperto, es. il form che cambia tipo). */
  subito?: boolean;
  children: ReactNode;
}

/** Il contenitore dei pannelli e delle finestre di /modifica (lo mette lo Scheletro). */
export const contenitorePannelli = () => document.getElementById("mf-pannelli") ?? document.body;

const MODALE = "dialog:modal";
/** Dove Esc è del campo (svuotare una ricerca, chiudere un menu nativo), non del pannello. */
const MODIFICABILE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export function Pannello({ titolo, sottotitolo, larghezza = "larga", sporco, onChiudi, piedi, azioni, testa, modulo, onResta, subito, children }: PannelloProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitolo = useId();
  const [modo] = useState<ModoPannello>(() => modoPannello(window.innerWidth));
  const sporcoRef = useRef(sporco);
  sporcoRef.current = sporco;
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;

  const blocca = useCallback(() => sporcoRef.current, []);
  const blocco = useBlocker({ shouldBlockFn: blocca, enableBeforeUnload: blocca, withResolver: true });
  const rinuncia = useRinunciaEditor();

  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    const apritore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let nostro = false;
    if (modo === "laterale") d.show();
    else d.showModal();
    // il primo campo con un errore, poi quello marcato, poi il titolo
    const primo = d.querySelector<HTMLElement>('[aria-invalid="true"]') ?? d.querySelector<HTMLElement>("[data-autofocus]") ?? d.querySelector<HTMLElement>("h2");
    primo?.focus({ preventScroll: true });

    const onCancel = (e: Event) => {
      e.preventDefault();
      chiudi.current();
    };
    // chiuso dal browser senza `cancel` (Chrome, Esc ripetuto): con modifiche si riapre e decide la guardia
    const onClose = () => {
      if (nostro) return;
      if (sporcoRef.current && modo !== "laterale") d.showModal();
      chiudi.current();
    };
    // non modale: Esc da qualunque punto della pagina, salvo l'Oracolo, le finestre modali sopra e i campi fuori dal pannello (la ricerca dell'elenco)
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("#oracolo") || document.querySelector(MODALE)) return;
      if (t && !d.contains(t) && t.closest(MODIFICABILE)) return;
      e.preventDefault();
      chiudi.current();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onClose);
    if (modo === "laterale") document.addEventListener("keydown", onKey);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onClose);
      document.removeEventListener("keydown", onKey);
      nostro = true;
      if (d.open) d.close();
      // il focus torna a chi l'ha aperto, o al titolo della vista
      const att = document.activeElement;
      if (!att || att === document.body || d.contains(att)) {
        const dove = apritore?.isConnected ? apritore : document.querySelector<HTMLElement>("section.mf-vista:not([hidden]) h1");
        dove?.focus({ preventScroll: true });
      }
    };
  }, [modo]);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing) return;
    const d = ref.current;
    const form = d && (modulo ? (document.getElementById(modulo) as HTMLFormElement | null) : d.querySelector("form"));
    if (!d || !form) return;
    e.preventDefault();
    if (e.repeat) return;
    // il pulsante principale del piede, se è acceso (in coda è «Salva e vai al prossimo»): spento vuol dire che salva già o che non c'è niente da salvare
    const invio = [...d.querySelectorAll<HTMLButtonElement>(".mf-pannello-piedi button[type=submit].mod-primario")].find(b => !b.disabled && b.form === form);
    if (invio) form.requestSubmit(invio);
  };

  return (
    <>
      {createPortal(
        <dialog
          ref={ref}
          className="mf-pannello mod-pop"
          data-modo={modo}
          data-larghezza={larghezza}
          data-subito={subito ? "" : undefined}
          aria-labelledby={idTitolo}
          onKeyDown={onKeyDown}
        >
          <header className="mf-pannello-testa">
            <div className="mf-pannello-titoli">
              <h2 id={idTitolo} tabIndex={-1}>{titolo}</h2>
              {sottotitolo && <p className="mf-pannello-sottotitolo">{sottotitolo}</p>}
            </div>
            <div className="mf-pannello-comandi">
              {azioni && azioni.length > 0 && <Menu etichetta="Altre azioni" voci={azioni} />}
              <button type="button" className="mf-icona" onClick={() => chiudi.current()} aria-label="Chiudi" title="Chiudi">
                <Icon name="close" size={18} stroke={2} />
              </button>
            </div>
          </header>
          {testa && <div className="mf-pannello-avvisi">{testa}</div>}
          <div className="mf-pannello-corpo">{children}</div>
          {piedi && (
            <footer className="mf-pannello-piedi">
              {sporco && <span className="mf-sporco">Modifiche non salvate</span>}
              <div className="mf-pannello-azioni">{piedi}</div>
            </footer>
          )}
        </dialog>,
        contenitorePannelli(),
      )}
      {blocco.status === "blocked" && (
        <Conferma
          titolo="Modifiche non salvate"
          etichetta="Esci senza salvare"
          annulla="Continua a modificare"
          onConferma={() => blocco.proceed()}
          onChiudi={() => {
            blocco.reset();
            rinuncia();
            onResta?.();
          }}
        >
          <p>Se esci adesso perdi le modifiche.</p>
        </Conferma>
      )}
    </>
  );
}
