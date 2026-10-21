import React, { useMemo, useRef, useState } from "react";
import { voto1 } from "../../shared/lib/format.ts";
import { labelOf } from "../../shared/lib/predicates.ts";
import { computePortrait } from "../../shared/lib/portrait.ts";
import { MapBoundary, MapCard } from "../dashboard/MapCard.tsx";
import { useProfile } from "../profile/ProfileContext.tsx";
import WishlistAct from "./WishlistAct.tsx";

/* ============================================================
   RITRATTO — a curated, editorial, scroll-based portrait for the
   casual visitor. It reuses the same data helpers as the dashboard
   so its headline numbers can never diverge from "I dati". Every
   bit of motion is gated on prefers-reduced-motion.
   ============================================================ */
const prefersReducedMotion=()=>typeof matchMedia!=="undefined"&&matchMedia("(prefers-reduced-motion: reduce)").matches;

// Reveal-on-scroll. Returns [ref, seen]; seen flips true the first time the
// element enters the viewport — or immediately when motion is reduced / there
// is no IntersectionObserver, so content never gets stuck invisible.
function useReveal(threshold=0.2): [any,boolean]{
  const ref=useRef<any>(null);
  const [seen,setSeen]=useState(false);
  React.useEffect(()=>{
    if(seen) return;
    const el=ref.current; if(!el) return;
    if(prefersReducedMotion()||typeof IntersectionObserver==="undefined"){ setSeen(true); return; }
    // A block taller than the viewport can never reach a high ratio (a 3x-tall
    // act tops out at .33), so cap the threshold at what this element can
    // actually achieve — otherwise it stays stuck at opacity 0 on short screens.
    const h=el.getBoundingClientRect().height||1;
    const t=Math.max(0.01,Math.min(threshold,(window.innerHeight/h)*0.75));
    const io=new IntersectionObserver(es=>{
      es.forEach(e=>{ if(e.isIntersecting){ setSeen(true); io.disconnect(); } });
    },{threshold:t,rootMargin:"0px 0px -8% 0px"});
    io.observe(el);
    return ()=>io.disconnect();
  },[seen,threshold]);
  return [ref,seen];
}

// Count-up: eases 0 → target once `start` is true. Before that — on the server
// and in the first client render — it shows the target itself, so the SSR HTML
// already carries the real numbers and hydration matches; the act is still
// invisible (opacity 0) until revealed, and the reset to 0 happens in a layout
// effect, before the revealed act is painted. Reduced motion skips the animation.
function useCountUp(target:number,start:boolean,dur=1500){
  const [v,setV]=useState<number|null>(null); // null = show the target as is
  const raf=useRef(0);
  React.useLayoutEffect(()=>{
    if(!start) return;
    if(prefersReducedMotion()){ setV(null); return; }
    setV(0);
    let t0:number|null=null;
    const tick=(t:number)=>{
      if(t0==null)t0=t;
      const p=Math.min(1,(t-t0)/dur);
      const e=1-Math.pow(1-p,3);         // easeOutCubic
      setV(target*e);
      if(p<1) raf.current=requestAnimationFrame(tick);
      else setV(null);
    };
    raf.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf.current);
  },[target,start,dur]);
  return v??target;
}

function CountStat({value,label,hint,prefix,suffix,start,decimals}: any){
  const v=useCountUp(value,start);
  const shown=decimals!=null?v.toFixed(decimals):Math.round(v).toLocaleString("it-IT");
  return (
    <div className="rt-stat">
      <div className="rt-stat-n">{prefix}{shown}{suffix}</div>
      <div className="rt-stat-l">{label}</div>
      {hint&&<div className="rt-stat-h">{hint}</div>}
    </div>
  );
}

/* Move to an act.

   The glide is animated here, frame by frame, instead of being handed to the
   browser as behavior:"smooth". Every attempt to delegate it went wrong on
   iPhone in a different way — Safari refuses a programmatic smooth scroll
   outright while momentum from your last gesture is still settling, and when it
   does accept one it can still finish somewhere else. An ordinary instant
   scroll is the one thing every browser honours immediately, so that is all
   this uses: a sequence of them, eased, ending on the exact target. Nothing can
   decline it and there is no landing to second-guess.

   The reader always wins: a drag, wheel, key or scrollbar grab abandons the
   animation where it stands. */
let stopGlide:(()=>void)|null=null;
function goToAct(el:Element){
  stopGlide?.();                                  // a second press supersedes the first
  const targetY=()=>{
    const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    return Math.min(max,Math.max(0,Math.round(el.getBoundingClientRect().top+window.scrollY)));
  };
  const to=targetY(), from=window.scrollY, dist=to-from;
  if(prefersReducedMotion()||Math.abs(dist)<2){ window.scrollTo(0,to); return; }

  // ~1.6ms per pixel, held between a brisk 300ms and a calm 620ms
  const dur=Math.min(620,Math.max(300,Math.abs(dist)*1.6));
  const ease=(p:number)=>1-Math.pow(1-p,3);
  const t0=(typeof performance!=="undefined"?performance.now():Date.now());
  let raf=0;
  // mousedown catches a scrollbar drag, and is safe to listen for because it
  // precedes the click — the press that got us here cannot have fired it
  const events=["touchmove","wheel","keydown","mousedown"];
  const stop=()=>{ cancelAnimationFrame(raf); events.forEach(t=>window.removeEventListener(t,stop)); stopGlide=null; };
  events.forEach(t=>window.addEventListener(t,stop,{passive:true}));
  stopGlide=stop;

  const step=()=>{
    const now=(typeof performance!=="undefined"?performance.now():Date.now());
    const p=Math.min(1,(now-t0)/dur);
    window.scrollTo(0,Math.round(from+dist*ease(p)));
    if(p<1){ raf=requestAnimationFrame(step); return; }
    window.scrollTo(0,targetY());                 // re-measured, so it lands exact
    stop();
  };
  raf=requestAnimationFrame(step);
}

// A single "act": a near-full-viewport block that fades/rises in on scroll.
// children may be a node or a render function receiving `seen` (for count-ups).
// The body is wrapped so the reveal transform lands on a child and not on the
// snap target itself: transforming a snap area moves its snap position, which
// makes the scroller twitch while an act fades in.
export function Act({className,threshold,cue,children}: any){
  const [ref,seen]=useReveal(threshold);
  return (
    <section ref={ref} className={"rt-act "+(className||"")+(seen?" in":"")}>
      <div className="rt-actbody">{typeof children==="function"?children(seen):children}</div>
      {cue}
    </section>
  );
}

// Loop earplugs nudge in "E adesso?" — hearing-protection CTA (Gabri's referral).
const LOOP_LINK="https://rwrd.io/ref_E19KPYV";

export function Ritratto({openChat,onExplore}: {openChat:(q?:string)=>void;onExplore:()=>void}){
  // Portrait stats — computed once, unfiltered, straight from the same helpers
  // the KPIs use (shared/lib/portrait.ts), so the two views agree by construction.
  const {dataset,now}=useProfile();
  const P=useMemo(()=>computePortrait(dataset.entries,now),[dataset,now]);
  // "Avanti" cue on every act but the last: glide to the next act below (found
  // via the DOM so it stays correct even when some acts are conditionally hidden).
  // Acts snap start-aligned, so an act's own snap position is where this lands.
  const goNext=(e:any)=>{
    const act=e.currentTarget.closest(".rt-act");
    let n=act?act.nextElementSibling:null;
    while(n && !(n.classList&&n.classList.contains("rt-act"))) n=n.nextElementSibling;
    if(!n) return;
    // "Avanti" has to mean forward from wherever the reader actually is, not
    // from where this cue's act sits: if a scroll has already carried them past
    // that neighbour, aiming at it would send them backwards. Pressing a cue
    // you can fully see can't reach that state, so this is belt-and-braces
    // rather than an observed bug — but "forward" should be literally true.
    while(n && n.getBoundingClientRect().top<=4){
      let x=n.nextElementSibling;
      while(x && !(x.classList&&x.classList.contains("rt-act"))) x=x.nextElementSibling;
      if(!x) break;
      n=x;
    }
    goToAct(n);
  };
  // The cue rides in its own row at the end of the act (never absolutely
  // positioned) so it can't sit on top of the content on a short screen.
  const nextCue=()=>(
    <div className="rt-cuerow">
      <button type="button" className="rt-scrollcue" onClick={goNext} aria-label="Vai avanti">
        <span className="rt-scrollcue-l">Avanti</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
      </button>
    </div>
  );

  return (
    <div className="rt">
      {/* ── Act I — the showstopper: lights up on a dark stage ── */}
      <section className="rt-act rt-hero stage in">
        <div className="beams">
          <span className="beam b1"></span>
          <span className="beam b2"></span>
          <span className="beam b3"></span>
          <span className="beam b4"></span>
          <span className="beam b5"></span>
          <span className="beam b6"></span>
          <span className="fixture f1"></span>
          <span className="fixture f2"></span>
          <span className="fixture f3"></span>
          <span className="fixture f4"></span>
          <span className="fixture f5"></span>
          <span className="fixture f6"></span>
        </div>
        <span className="spot"></span>
        <div className="rt-actbody">
          <div className="rt-hero-inner">
            <h1 className="rt-h1">Gabri<span className="rt-h1-2">ai concerti</span></h1>
            <p className="rt-lede">Una vita contata in luci, viaggi e concerti sotto un palco.</p>
          </div>
        </div>
        <div className="rt-cuerow">
          <button type="button" className="rt-startbtn" onClick={goNext}>
            inizia lo show!
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
          </button>
        </div>
      </section>

      {/* ── Act II — the headline numbers, counting up ── */}
      <Act className="rt-numbers" threshold={0.4} cue={nextCue()}>{(seen:boolean)=>(<>
        <div className="rt-head"><h2 className="rt-h2">I numeri</h2></div>
        <div className="rt-grid">
          <CountStat value={P.total} label="Concerti" start={seen}/>
          <CountStat value={P.artists} label="Artisti diversi" start={seen}/>
          <CountStat value={P.km} label="Km percorsi" start={seen}/>
          <CountStat value={P.perYear} label="Concerti per anno" decimals={1} start={seen}/>
        </div>
      </>)}</Act>

      {/* ── Act III — the map ── */}
      {/* default reveal threshold on purpose: a lower one fades this act in
          while it's still only peeking under the act above it (the map card
          mounts either way, so nothing loads later for it) */}
      <Act className="rt-mapact" cue={nextCue()}>
        <div className="rt-head"><h2 className="rt-h2">Dove</h2></div>
        <div className="rt-mapframe"><MapBoundary><MapCard/></MapBoundary></div>
      </Act>

      {/* ── Act IV — the best shows ── */}
      {P.topBest.length>0&&(
      <Act className="rt-bestact" cue={nextCue()}>
        <div className="rt-head"><h2 className="rt-h2">I migliori</h2></div>
        <p className="rt-lead">I concerti che varrebbe la pena rivivere all'infinito,{P.avgVoto?<> la media di tutti i concerti è a <b>{voto1(P.avgVoto)}<span className="star">★</span></b></>:null}.</p>
        <ol className="rt-bestlist">
          {P.topBest.map((c,i)=>(
            <li className="rt-bestrow" key={i}>
              <span className="rt-best-art">{c.artist}</span>
              <span className="rt-best-meta">{c.city} · '{String(c.y).slice(2)}</span>
              <span className="rt-best-stars" aria-label={c.voto+" stelle"}>{"★".repeat(c.voto)}</span>
            </li>
          ))}
        </ol>
      </Act>
      )}

      {/* ── Act V — who they go with ── */}
      {P.mates.length>0&&(
      <Act className="rt-peopleact" cue={nextCue()}>
        <div className="rt-head"><h2 className="rt-h2">Con chi</h2></div>
        <p className="rt-lead"><b>{P.companions}</b> compagni diversi lungo la strada e <b>{P.solo}</b> concerti vissuti da solo.</p>
        <ol className="rt-peoplelist">
          {P.mates.map(([name,n]: any,i:number)=>(
            <li className="rt-personrow" key={name}>
              <span className="rt-person-rank">{i+1}</span>
              <span className="rt-person-name">{name}</span>
              <span className="rt-person-n">{n} volte</span>
            </li>
          ))}
        </ol>
      </Act>
      )}

      {/* ── Act VI — what's next ── */}
      {P.upcoming.length>0&&(
      <Act className="rt-nextact" cue={nextCue()}>
        <div className="rt-head"><h2 className="rt-h2">E adesso?</h2></div>
        <p className="rt-lead"><b>{P.plannedConcerts}</b> concerti programmati, ecco i prossimi.</p>
        <ol className="rt-nextlist">
          {P.upcoming.slice(0,3).map((ev,i)=>(
            <li className="rt-nextrow" key={i}>
              <span className="rt-next-art">{labelOf(ev)}</span>
              <span className="rt-next-meta"><span className="rt-next-date">{ev.date}</span> · {ev.venue}, {ev.city}</span>
            </li>
          ))}
        </ol>
        <div className="rt-earplugs">
          <p className="rt-earplugs-note">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 3.5-2 4.5-3.2 5.7C13.6 14.9 13 15.7 13 17a3 3 0 0 1-6 0"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>
            <span>Un consiglio: <b>proteggi l'udito</b>, io porto sempre i tappi con me.</span>
          </p>
          <a className="rt-earplugs-cta" href={LOOP_LINK} target="_blank" rel="noopener noreferrer">
            <span>Compra i tuoi Loop con il 15% di sconto</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          </a>
        </div>
      </Act>
      )}

      {/* ── Act VII — la lista dei desideri. L'atto vive in WishlistAct.tsx
          (+ wishlist.css): un file per variante, così le proposte si
          confrontano e si sostituiscono in blocco. Si nasconde da solo
          quando WISHLIST è vuota. ── */}
      <WishlistAct Act={Act} cue={nextCue()} openChat={openChat}/>

      {/* ── Final Act — L'Oracolo ── */}
      <Act className="rt-oracoloact" threshold={0.15}>
        <div className="rt-head"><h2 className="rt-h2">L'Oracolo</h2></div>
        <p className="rt-oracolo-pitch">Un'AI che conosce a memoria ogni concerto di Gabri e sa cercare sul web tutto il resto:</p>
        <div className="rt-finalctas">
          <button type="button" className="rt-oracolo-cta" onClick={()=>openChat()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>
            Chiedi all'Oracolo
          </button>
          <button type="button" className="rt-explore" onClick={onExplore}>Vuoi i dati da nerd? Clicca qui</button>
        </div>
        <p className="rt-endcredits-note">Creato con il fondamentale supporto di Cami</p>
      </Act>
    </div>
  );
}

