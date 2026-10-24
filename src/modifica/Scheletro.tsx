/* ──────────────────────────────────────────────────────────────
   Lo scheletro di /<handle>/modifica (spec ux-modifica §4.2): un'app di
   gestione, una vista alla volta, invece di una pagina lunga di schede.

   - Barra in alto (BarraApp), navigazione a sinistra (barra laterale o
     binario, Navigazione) o in basso sul telefono (BarraSchede + il
     foglio «Altro»), e il contenuto in <main>.
   - La vista è l'hash (`#concerti`, `#account?elimina=1`…, vista.ts):
     tutte e 9 le <section id> di SEZIONI_MODIFICA stanno nell'HTML,
     anche in SSR, nell'ordine del contratto e nascoste finché il browser
     non sa quale mostrare. Una sezione si monta la prima volta che la si
     apre e poi resta montata anche nascosta: ricerca, filtri, scroll e
     modifiche in corso sopravvivono ai cambi di vista. #partenze (gli
     indirizzi) si monta solo se la si visita.
   - Ogni vista ricorda il suo scroll; cambiando vista il focus va al suo
     titolo (non al primo caricamento). Il titolo (h1 `#<id>-titolo`) lo
     rende la vista stessa, nella sua testata (IntestazioneVista).
   - `/` porta alla ricerca della vista (Concerti, Persone, Attività), se
     non si sta scrivendo e nessuna finestra modale è aperta.
   - Le notifiche (ui/Toast.tsx) stanno in fondo, fuori dalle sezioni; i
     segni sulla navigazione (shell/distintivi.ts) arrivano dopo
     l'idratazione.
   - Pannelli e finestre stanno in #mf-pannelli, fuori dalle sezioni;
     l'Oracolo in scrittura (oracolo/Contenitore.tsx) è un <dialog> solo,
     agganciato a destra o a tutto schermo, mai smontato.
   - Niente luci ambientali dello Shell qui: una superficie di lavoro
     calma. "Esci" (§1.39) sta in #account, dentro SezioneAccount.
   ────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { EditorProvider } from "./editor.tsx";
import { modoNav, SOGLIE } from "./layout.ts";
import { ContenitoreOracolo } from "./oracolo/Contenitore.tsx";
import { OracoloProvider, useOracoloInterno } from "./oracolo/contesto.tsx";
import { SEZIONI_MODIFICA } from "./sezioni.ts";
import { BarraApp } from "./shell/BarraApp.tsx";
import { BarraSchede, FoglioAltro } from "./shell/BarraSchede.tsx";
import { Navigazione } from "./shell/Navigazione.tsx";
import { useDistintivi } from "./shell/useDistintivi.ts";
import { RegioneToast, ToastProvider } from "./ui/Toast.tsx";
import { useMisura } from "./useMisura.ts";
import { conStato, useVista, useVoceStoria, type StatoModifica } from "./useVista.ts";
import { leggiHash, type IdVista } from "./vista.ts";

/** Le viste di impostazioni: una colonna stretta (760 px); Stile un po' più larga, per l'anteprima accanto al tema. */
const LARGHEZZA: Partial<Record<IdVista, string>> = { stile: " mf-vista-media", agenti: " mf-vista-stretta", account: " mf-vista-stretta" };
const CHIAVE_NAV = "concerti:modifica:nav";

export function Scheletro({ handle }: { handle: string }) {
  const w = useMisura();
  return (
    <ProviderModifica w={w}>
      <App handle={handle} w={w} />
    </ProviderModifica>
  );
}

/** Lo stato condiviso di /modifica: le notifiche, l'Oracolo e il ponte del form dei concerti. */
function ProviderModifica({ w, children }: { w: number | null; children: ReactNode }) {
  return (
    <ToastProvider>
      <OracoloProvider w={w}>
        <EditorProvider>{children}</EditorProvider>
      </OracoloProvider>
    </ToastProvider>
  );
}

function App({ handle, w }: { handle: string; w: number | null }) {
  const { pronta, vista, parametri } = useVista();
  const router = useRouter();
  const hash = useLocation({ select: l => l.hash });
  const oracolo = useOracoloInterno();
  const [binario, alternaBinario] = useSceltaBinario();
  const altro = useVoceStoria("mfFoglio");

  const ancoratoAperto = oracolo.aperto && oracolo.modo === "ancorato";
  // un pannello non modale aperto (concerto, persona, "regalato da"): accanto all'Oracolo agganciato la barra laterale lascia il posto all'elenco
  const pannelloAperto = (vista === "concerti" || vista === "persone" || vista === "regali") && !!(parametri.apri || parametri.nuovo);
  const nav = w === null ? undefined : modoNav(w, ancoratoAperto, binario, pannelloAperto);
  // «Comprimi il menu» solo quando la barra è una scelta (non quando l'Oracolo o un pannello la riducono da soli)
  const comprimi = w !== null && w >= SOGLIE.ampio && modoNav(w, ancoratoAperto, false, pannelloAperto) === "barra" ? { compresso: binario, alterna: alternaBinario } : null;

  // le sezioni visitate restano montate
  const [visitate, setVisitate] = useState<ReadonlySet<IdVista>>(() => new Set());
  if (vista && !visitate.has(vista)) setVisitate(new Set(visitate).add(vista));

  // un hash che non è una vista (#sec-kpis, #boh): Concerti, e l'hash sparisce
  useEffect(() => {
    if (!pronta || hash.replace(/^#/, "") === "" || leggiHash(hash).vista !== null) return;
    void router.navigate({ to: "/$handle/modifica", params: { handle }, hash: "", replace: true, resetScroll: false, hashScrollIntoView: false });
  }, [pronta, hash, router, handle]);

  // dopo un ricaricamento i fogli partono chiusi: la voce che li segnava aperti non vale più
  useEffect(() => {
    if (!pronta) return;
    const s = router.latestLocation.state as StatoModifica;
    if (!s.mfOracolo && !s.mfFoglio) return;
    void router.navigate({
      to: "/$handle/modifica",
      params: { handle },
      hash: true,
      replace: true,
      state: conStato({ mfOracolo: undefined, mfFoglio: undefined }),
      resetScroll: false,
      hashScrollIntoView: false,
    });
  }, [pronta, router, handle]);

  useScrollPerVista(vista);
  useScorciatoiaCerca();
  const distintivi = useDistintivi(vista);

  return (
    <>
      <a
        className="mf-salta"
        href="#contenuto"
        onClick={e => {
          e.preventDefault();
          document.getElementById("contenuto")?.focus();
        }}
      >
        Vai al contenuto
      </a>
      <div
        className="mf-app"
        data-nav={nav}
        data-oracolo={w === null ? undefined : oracolo.aperto ? "aperto" : "chiuso"}
        data-oracolo-modo={w === null ? undefined : oracolo.modo}
      >
        <BarraApp handle={handle} />
        <Navigazione comprimi={comprimi} distintivi={distintivi} />
        <main id="contenuto" className="mf-main" tabIndex={-1}>
          {!pronta && <p className="mod-attesa" aria-busy="true">Carico…</p>}
          {SEZIONI_MODIFICA.map(({ id, Componente }) => (
            <section
              key={id}
              id={id}
              className={`modifica-sezione mf-vista${LARGHEZZA[id] ?? ""}`}
              aria-labelledby={`${id}-titolo`}
              hidden={vista !== id}
            >
              {visitate.has(id) && <Componente handle={handle} />}
            </section>
          ))}
        </main>
        <div id="mf-pannelli" />
        <ContenitoreOracolo handle={handle} />
        <BarraSchede altroAperto={altro.aperto} onAltro={() => altro.apri()} distintivi={distintivi} />
        {altro.aperto && <FoglioAltro handle={handle} onChiudi={altro.chiudi} distintivi={distintivi} />}
        <RegioneToast />
      </div>
    </>
  );
}

/** La barra laterale ridotta a binario: una scelta del proprietario, ricordata nel browser. */
function useSceltaBinario(): [boolean, () => void] {
  const [binario, setBinario] = useState(false);
  useEffect(() => {
    try {
      setBinario(localStorage.getItem(CHIAVE_NAV) === "binario");
    } catch {
      // niente localStorage: la barra resta larga
    }
  }, []);
  const alterna = useCallback(() => {
    setBinario(b => {
      try {
        localStorage.setItem(CHIAVE_NAV, b ? "barra" : "binario");
      } catch {
        // resta per questa visita
      }
      return !b;
    });
  }, []);
  return [binario, alterna];
}

/**
 * Ogni vista ricorda dove era arrivato lo scroll della finestra; tornandoci
 * si riparte da lì (da cima la prima volta), e il focus va al titolo. Le
 * posizioni si segnano mentre si scorre: quando la vista cambia, nascondere
 * la sezione vecchia ha già accorciato la pagina.
 */
function useScrollPerVista(vista: IdVista | null) {
  const posizioni = useRef(new Map<IdVista, number>());
  const corrente = useRef<IdVista | null>(null);
  useEffect(() => {
    const onScroll = () => {
      if (corrente.current) posizioni.current.set(corrente.current, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    if (!vista) return;
    const prima = corrente.current;
    corrente.current = vista;
    if (prima === null || prima === vista) return;
    window.scrollTo({ top: posizioni.current.get(vista) ?? 0, behavior: "instant" });
    document.getElementById(`${vista}-titolo`)?.focus({ preventScroll: true });
  }, [vista]);
}

/**
 * `/` porta alla ricerca della vista aperta (il campo con
 * aria-keyshortcuts="/", BarraStrumenti). Non mentre si scrive, con altri
 * tasti premuti insieme (Maiusc a parte: su molte tastiere `/` è Maiusc+7),
 * dentro un pannello o l'Oracolo, o con una finestra modale aperta.
 */
function useScorciatoiaCerca() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog')) return;
      if (document.querySelector("dialog:modal")) return;
      const cerca = document.querySelector<HTMLInputElement>('section.mf-vista:not([hidden]) [aria-keyshortcuts="/"]');
      if (!cerca) return;
      e.preventDefault();
      cerca.focus();
      cerca.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
