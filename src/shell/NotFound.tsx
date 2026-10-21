/* La pagina 404: un handle che non esiste o un indirizzo sbagliato. */
export function NotFound(){
  return (
    <main className="notfound">
      <h1 className="notfound-h">Qui non suona nessuno</h1>
      <p className="desc">Questa pagina non esiste: forse il link è sbagliato o il profilo non c'è.</p>
      <a className="notfound-link" href="/gabrifila">Vai ai concerti di Gabri</a>
    </main>
  );
}
