/* Id dei thread dell'Oracolo (ex src/chat/chatlog.ts): stessi vincoli di sempre,
   così i vecchi link `/?chat=<id>` restano validi (PIANO §1.26). */

export const THREAD_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

const RESERVED_THREAD_IDS = new Set(["titles", "authors", "preview"]);

export const isValidThreadId = (id: string): boolean => THREAD_ID_RE.test(id) && !RESERVED_THREAD_IDS.has(id);
