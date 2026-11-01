import { useIsOwner } from "../lib/viewer.ts";
import { useProfile } from "../profile/ProfileContext.tsx";

/* Il proprietario sulla sua pagina ancora senza concerti: un invito ad
   aggiungere il primo, che apre il modulo del concerto nuovo in Modifica
   (#concerti?nuovo=concerto). Chi visita non lo vede mai. */
export function PrimoConcerto({ className = "" }: { className?: string }) {
  const { profile, dataset } = useProfile();
  const isOwner = useIsOwner(profile.handle);
  if (!isOwner || dataset.entries.length > 0) return null;
  return (
    <div className={"primo-concerto " + className}>
      <p className="primo-concerto-testo">La tua pagina è ancora vuota: aggiungi il primo concerto e si accende.</p>
      <a className="primo-concerto-btn" href={`/${profile.handle}/modifica#concerti?nuovo=concerto`}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Aggiungi il primo concerto
      </a>
    </div>
  );
}
