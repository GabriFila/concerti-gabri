import React from "react";

/* ── Live-music glyphs: thin line icons, inherit currentColor ── */
const PATHS: Record<string, React.ReactNode> = {
  // KPI stats
  ticket:<><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z"/><path d="M14 7v10" strokeDasharray="1.5 2"/></>,
  mic:<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></>,
  repeat:<><path d="M4 8a4 4 0 0 1 4-4h9M17 4l-3-3M17 4l-3 3"/><path d="M20 16a4 4 0 0 1-4 4H7M7 20l3 3M7 20l3-3"/></>,
  pin:<><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></>,
  star:<><path d="M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.2L6.2 19.4l1.3-6-4.5-4 6-.7L12 3Z"/></>,
  users:<><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M16.5 14.2A5.5 5.5 0 0 1 20.5 19.5"/></>,
  user:<><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
  // card titles
  calendar:<><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>,
  trophy:<><path d="M7 4h10v4a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 16h6M12 13v3M9 20h6"/></>,
  map:<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></>,
  chart:<><path d="M4 4v16h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/></>,
  list:<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
  target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></>,
  note:<><circle cx="6.5" cy="17.5" r="2.8"/><circle cx="17" cy="15.5" r="2.8"/><path d="M9.3 17.5V6.2l10.5-2.1v11.4M9.3 9.7l10.5-2.1"/></>,
  eyeclosed:<><path d="M3 10c2.6 3 5.7 4.5 9 4.5s6.4-1.5 9-4.5"/><path d="M12 14.5v3.2M6.1 13.3l-2 2.6M17.9 13.3l2 2.6M8.9 14.2l-1.1 3M15.1 14.2l1.1 3"/></>,
  euro:<><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5a4 4 0 1 0 0 7M7 11h6M7 13.5h5"/></>,
  gift:<><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8S10.5 4 8 4a2 2 0 0 0 0 4h4ZM12 8s1.5-4 4-4a2 2 0 0 1 0 4h-4Z"/></>,
  handshake:<><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></>,
  coins:<><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></>,
  wallet:<><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z"/><circle cx="17" cy="14" r="1"/></>,
  chevron:<><path d="M6 9l6 6 6-6"/></>,
  pen:<><path d="M4 20h4L19.6 8.4a2.55 2.55 0 0 0-3.6-3.6L4 16.4V20Z"/><path d="m14.6 6.2 3.2 3.2"/></>,
  // /<handle>/modifica: navigazione e azioni
  heart:<><path d="M12 20s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20Z"/></>,
  palette:<><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/></>,
  plug:<><path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z"/><path d="M12 17v4"/></>,
  history:<><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  search:<><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></>,
  more:<><circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/></>,
  close:<><path d="M18 6 6 18M6 6l12 12"/></>,
  external:<><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>,
  spark:<><path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z"/><path d="M19 15c.2 1.5.8 2.1 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.2 2.1-.8 2.3-2.3Z"/></>,
  check:<><path d="m5 12.5 4.5 4.5L19 7.5"/></>,
  alert:<><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z"/><path d="M12 10v4.5M12 17.2h.01"/></>,
  arrowUp:<><path d="M12 19V5M6 11l6-6 6 6"/></>,
  arrowDown:<><path d="M12 5v14M6 13l6 6 6-6"/></>,
  sidebar:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
  menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
  copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  trash:<><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/></>,
  lock:<><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></>,
};

/** I nomi dei glifi disponibili (src/modifica/sezioni.test.ts li controlla). */
export const NOMI_ICONE: readonly string[] = Object.keys(PATHS);

export function Icon({name,size=16,stroke=1.5,className,style}: any){
  return <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>;
}
