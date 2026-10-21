/* Conteggi e classifiche. */

export const counter = <T,>(arr: T[], k: keyof T | ((x: T) => unknown)): Record<string, number> => {
  const m: Record<string, number> = {};
  arr.forEach(x => { const v = typeof k === "function" ? k(x) : x[k]; m[v as any] = (m[v as any] || 0) + 1; });
  return m;
};

// come counter, ma per campi-array (es. "with"): conta ogni elemento
export const multiCounter = <T,>(arr: T[], k: keyof T): Record<string, number> => {
  const m: Record<string, number> = {};
  arr.forEach(x => { ((x[k] as any[]) || []).forEach((v: any) => { m[v as any] = (m[v as any] || 0) + 1; }); });
  return m;
};

export const ranked = (o: Record<string, number>): [string, number][] => Object.entries(o).sort((a, b) => b[1] - a[1]);

/* Taglio "a gradini" per le card dei primi. Scorre una lista [nome, valore]
   già ordinata e allarga il gruppo visibile un gradino alla volta (un gradino
   = tutti gli elementi con lo stesso valore). Regole: continua finché sta
   sotto `soft` (un numero comodo); un gradino mostrato si mostra TUTTO; ma non
   si supera mai `hard` (il tetto d'altezza): un gradino che lo sfonderebbe si
   scarta intero, non si spezza. */
export const rankCutoff = <T extends readonly [any, number]>(rows: T[], soft = 8, hard = 8): T[] => {
  const out: T[] = [];
  for (let i = 0; i < rows.length;) {
    const v = rows[i][1]; let j = i; while (j < rows.length && rows[j][1] === v) j++; // [i,j) = questo gradino
    if (out.length > 0 && j > hard) break;     // il gradino intero sfonda il tetto → stop
    for (let k = i; k < j; k++) out.push(rows[k]); // il gradino si mostra tutto
    i = j;
    if (out.length >= soft) break;             // raggiunto il numero comodo → stop
  }
  return out;
};

export const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0);
