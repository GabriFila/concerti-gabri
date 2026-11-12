import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isFestival, type Entry, type FotoEvento } from "../../shared/model/concert.ts";
import { sortKey } from "../../shared/lib/dates.ts";
import { eventTitle } from "../../shared/lib/predicates.ts";
import { useData } from "../filters/FilterContext.tsx";
import { usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ShowAllBtn } from "../ui/ShowAllBtn.tsx";
import { useTitoloSezione } from "./sezioni.tsx";

/* "Le mie foto" — the evenings' photos, newest event first. Per EVENT, like the
   comment: a festival's photos cover its whole weekend. Each event shows up to
   STRIP photos (the last tile says "+N" and opens the rest in the viewer);
   the card starts on EVENTS_PAGE events and grows a page at a time. The whole
   section is hidden when no event in the current filters has a photo (see
   FullDashboard). Photos are JPEGs without metadata (convex/foto.ts). */

const EVENTS_PAGE = 3;
const STRIP = 4;
const ENT_SERATA = { one: "un'altra", noun1: "serata", other: "altre", noun: "serate" };

export const hasFoto = (e: Entry): boolean => (e.foto?.length ?? 0) > 0;

const altFoto = (ev: Entry, i: number, n: number) => `Foto ${i + 1} di ${n}: ${eventTitle(ev)}, ${ev.date}`;

export function FotoCard() {
  const DATA = useData();
  const isPlanned = usePlanned();
  const [limit, setLimit] = useState(EVENTS_PAGE);
  const [aperta, setAperta] = useState<{ ev: Entry; i: number } | null>(null);
  const titolo = useTitoloSezione("Le mie foto");
  const conFoto = useMemo(() => DATA.filter(hasFoto).sort((a, b) => sortKey(b) - sortKey(a)), [DATA]);
  const chiudi = useCallback(() => setAperta(null), []);
  if (!conFoto.length) return null;
  const shown = conFoto.slice(0, limit);
  const rest = conFoto.length - shown.length;
  const allShown = rest === 0;
  const totale = conFoto.reduce((n, e) => n + (e.foto?.length ?? 0), 0);
  return (
    <section className="panel">
      <h2><Icon name="camera" size={22} className="h2ic" />{titolo}</h2>
      <p className="desc">
        {totale === 1 ? "Una foto" : `${totale} foto`} da {conFoto.length === 1 ? "una serata" : `${conFoto.length} serate`}, dalla più recente.
      </p>
      <div className="fotolist">
        {shown.map(ev => {
          const foto = ev.foto!;
          const extra = foto.length - STRIP;
          return (
            <div className="fotoitem" key={ev.date + eventTitle(ev)}>
              <div className="notehead">
                <span className="n-art">{eventTitle(ev)}</span>
                <span className={"n-date " + (isPlanned(ev) ? "d-planned" : "d-past")}>{ev.date}</span>
                <span className="n-meta">{ev.venue} · {ev.city}</span>
              </div>
              <div className="fotostrip">
                {foto.slice(0, STRIP).map((f, i) => {
                  const altre = i === STRIP - 1 && extra > 0 ? extra : 0;
                  return (
                    <button
                      type="button"
                      className="fototile"
                      key={f.miniatura}
                      onClick={() => setAperta({ ev, i })}
                      aria-label={altre ? `Apri le foto di ${eventTitle(ev)}: altre ${altre + 1}` : `Apri la foto ${i + 1} di ${foto.length}: ${eventTitle(ev)}, ${ev.date}`}
                    >
                      <img src={f.miniatura} alt="" loading="lazy" decoding="async" width={f.larghezza} height={f.altezza} />
                      {altre > 0 && <span className="fotopiu" aria-hidden="true">+{altre}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {conFoto.length > EVENTS_PAGE && (
        <ShowAllBtn expanded={allShown} count={Math.min(EVENTS_PAGE, rest)} entity={ENT_SERATA}
          onClick={() => setLimit(l => (allShown ? EVENTS_PAGE : l + EVENTS_PAGE))} />
      )}
      {aperta && <Visore ev={aperta.ev} iniziale={aperta.i} onClose={chiudi} />}
    </section>
  );
}

/* The viewer: one photo at a time over a dark backdrop, the event's photos in
   order. Arrows (buttons, ←/→, a horizontal swipe) move within the event;
   Esc, the × or a tap on the backdrop closes it. The neighbours are preloaded. */
export function Visore({ ev, iniziale, onClose }: { ev: Entry; iniziale: number; onClose: () => void }) {
  const foto = ev.foto ?? [];
  const [i, setI] = useState(Math.min(iniziale, foto.length - 1));
  const n = foto.length;
  const vai = useCallback((d: number) => setI(x => (x + d + n) % n), [n]);
  const chiudiRef = useRef<HTMLButtonElement>(null);
  const tocco = useRef<number | null>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") vai(1);
      else if (e.key === "ArrowLeft") vai(-1);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prima = document.activeElement as HTMLElement | null;
    chiudiRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prima?.focus?.();
    };
  }, [onClose, vai]);
  const f: FotoEvento | undefined = foto[i];
  if (!f) return null;
  const titolo = eventTitle(ev);
  // in un portale su <body>: dentro la sezione un antenato con transform o
  // filter farebbe da contenitore al position:fixed (il visore resterebbe nel riquadro)
  return createPortal(
    <div
      className="fotovisore"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto di ${titolo}`}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={e => { tocco.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={e => {
        const x0 = tocco.current;
        tocco.current = null;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 !== null && x1 !== undefined && Math.abs(x1 - x0) > 50 && n > 1) vai(x1 < x0 ? 1 : -1);
      }}
    >
      <button ref={chiudiRef} type="button" className="fv-chiudi" onClick={onClose} aria-label="Chiudi le foto">
        <Icon name="close" size={22} />
      </button>
      <figure className="fv-figura" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <img key={f.url} src={f.url} alt={altFoto(ev, i, n)} width={f.larghezza} height={f.altezza} decoding="async" />
        <figcaption className="fv-dida">
          <span className="fv-titolo">{titolo}</span>
          <span className="fv-meta">{ev.date} · {ev.venue} · {ev.city}{isFestival(ev) ? " · festival" : ""}</span>
          {n > 1 && <span className="fv-conta" aria-live="polite">{i + 1} / {n}</span>}
        </figcaption>
      </figure>
      {n > 1 && (
        <>
          <button type="button" className="fv-freccia fv-prima" onClick={() => vai(-1)} aria-label="Foto precedente">
            <Icon name="chevron" size={26} />
          </button>
          <button type="button" className="fv-freccia fv-dopo" onClick={() => vai(1)} aria-label="Foto successiva">
            <Icon name="chevron" size={26} />
          </button>
          {/* the neighbours, already in the cache when the arrow is tapped */}
          <link rel="preload" as="image" href={foto[(i + 1) % n].url} />
          <link rel="preload" as="image" href={foto[(i - 1 + n) % n].url} />
        </>
      )}
    </div>,
    document.body,
  );
}
