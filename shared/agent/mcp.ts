/* Costanti del server MCP condivise tra Convex (verifica dei token) e Start
   (route /mcp e metadati OAuth). */

/** Lo scope OAuth che dà accesso alla pagina del proprietario. */
export const SCOPE_CONCERTI = "concerti";

/** Lo scope del refresh token. */
export const SCOPE_RINNOVO = "offline_access";

/**
 * Gli unici scope che un token OAuth può avere. Niente openid, profile ed
 * email: con quelli mcp() darebbe al client un id_token con l'id, l'email e
 * il nome dell'utente (convex/authMcp.ts li toglie dalla richiesta).
 */
export const SCOPE_AMMESSI: readonly string[] = [SCOPE_CONCERTI, SCOPE_RINNOVO];
