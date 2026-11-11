import { useMemo, useState } from "react";
import { flatConcerts } from "../../shared/model/concert.ts";
import { touriVisti } from "../../shared/lib/tour.ts";
import { useData } from "../filters/FilterContext.tsx";
import { usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ENT_TOUR, ShowAllBtn } from "../ui/ShowAllBtn.tsx";
import { useTitoloSezione } from "./sezioni.tsx";

/* "I tour visti" — the tours the owner caught at least one date of, newest
   first (by the latest date seen). A tour is an artist + tour name; seeing
   more than one date of the same tour is rare, so the card is just the list,
   and a tour seen twice stays one item with both dates. Per CONCERT: a
   festival set can belong to its artist's tour too. Starts on TOUR_PAGE items
   and grows a page at a time; the whole section is hidden when no concert in
   the current filters names a tour (see FullDashboard). */
const TOUR_PAGE = 6;
export function TourCard() {
  const DATA = useData();
  const isPlanned = usePlanned();
  const [limit, setLimit] = useState(TOUR_PAGE);
  const titolo = useTitoloSezione("I tour visti");
  const tours = useMemo(() => touriVisti(flatConcerts(DATA)), [DATA]);
  if (!tours.length) return null;
  const shown = tours.slice(0, limit);
  const rest = tours.length - shown.length;
  const allShown = rest === 0;
  return (
    <section className="panel">
      <h2><Icon name="route" size={22} className="h2ic" />{titolo}</h2>
      <ul className="tourlist">
        {shown.map(t => (
          <li className="touritem" key={t.artist + "\u0000" + t.tour}>
            <div className="notehead">
              <span className="n-art">{t.tour}</span>
              <span className="t-artist">{t.artist}</span>
            </div>
            {t.date.map(d => (
              <div className="notehead t-data" key={d.date + d.venue}>
                <span className={"n-date " + (isPlanned(d) ? "d-planned" : "d-past")}>{d.date}</span>
                <span className="n-meta">{d.venue} · {d.city}{d.festival && <> · al {d.festival}</>}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      {tours.length > TOUR_PAGE && (
        <ShowAllBtn expanded={allShown} count={Math.min(TOUR_PAGE, rest)} entity={ENT_TOUR}
          onClick={() => setLimit(l => (allShown ? TOUR_PAGE : l + TOUR_PAGE))} />
      )}
    </section>
  );
}
