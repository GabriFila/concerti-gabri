import { describe, expect, it } from "vitest";
import { nextSicuro } from "./auth-next.ts";

describe("nextSicuro", () => {
  it("tiene i percorsi della nostra origine, con la query", () => {
    expect(nextSicuro("/benvenuto")).toBe("/benvenuto");
    expect(nextSicuro("/api/auth/mcp/authorize?client_id=x&state=y")).toBe("/api/auth/mcp/authorize?client_id=x&state=y");
  });

  it("rifiuta altri siti e forme ambigue", () => {
    for (const cattivo of ["https://evil.example", "//evil.example", "/\\evil.example", "/ok\\..\\x", "evil", "", "/a\nb", "javascript:alert(1)"]) {
      expect(nextSicuro(cattivo), cattivo).toBe("/benvenuto");
    }
    expect(nextSicuro(undefined, "/")).toBe("/");
    expect(nextSicuro(["/x"])).toBe("/benvenuto");
  });
});
