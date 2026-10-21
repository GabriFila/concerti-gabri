import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NESSUN_LOGIN, ROOT, buildEnv, checkArgs, checkWorktreeEnv, convexSubcommandIndex, parseDotenv } from "./wt.mjs";

// valori finti: contano solo i nomi
const PARENT = {
  PATH: "/usr/bin",
  HOME: "/home/x",
  TERM: "xterm",
  LANG: "it_IT.UTF-8",
  LC_ALL: "it_IT.UTF-8",
  TZ: "Europe/Rome",
  CONVEX_TMPDIR: "/tmp/c",
  PORT: "4100",
  E2E: "1",
  CONVEX_DEPLOYMENT: "dev:shared-1",
  VITE_CONVEX_URL: "https://shared.convex.cloud",
  VITE_CONVEX_SITE_URL: "https://shared.convex.site",
  VITE_SITE_URL: "https://tailnet",
  CONVEX_DEPLOY_KEY: "k",
  CONVEX_DEPLOY_KEY_PREVIEW: "kp",
  CONVEX_DEPLOY_KEY_PROD: "kprod",
  BETTER_AUTH_SECRET_PROD: "s",
  BETTER_AUTH_SECRET_DEV: "sd",
  VERCEL_AUTOMATION_BYPASS_SECRET: "b",
  UPSTASH_REDIS_REST_TOKEN_RW: "u",
  GOOGLE_CLIENT_SECRET: "g",
  GH_TOKEN: "t",
  GEMINI_API_KEY: "gem-parent",
  VITE_MAPBOX_TOKEN: "pk",
  CONVEX_OVERRIDE_ACCESS_TOKEN: "un-token-vero",
};

const WT = {
  CONVEX_DEPLOYMENT: "anonymous:anonymous-concerti",
  VITE_CONVEX_URL: "http://127.0.0.1:3210",
  VITE_CONVEX_SITE_URL: "http://127.0.0.1:3211",
  CHAT_SERVER_SECRET: "c",
};

describe("buildEnv", () => {
  it("dal genitore passano solo i nomi ammessi, mai Convex o segreti", () => {
    const env = buildEnv({ parent: PARENT });
    expect(Object.keys(env).sort()).toEqual(
      ["CONVEX_OVERRIDE_ACCESS_TOKEN", "CONVEX_TMPDIR", "E2E", "GEMINI_API_KEY", "HOME", "LANG", "LC_ALL", "PATH", "PORT", "TERM", "TZ", "VITE_MAPBOX_TOKEN", "WT_ENV"],
    );
  });

  it("la CLI Convex non vede il login globale: il token è sempre quello finto, mai quello del genitore", () => {
    expect(buildEnv({ parent: PARENT }).CONVEX_OVERRIDE_ACCESS_TOKEN).toBe(NESSUN_LOGIN);
    expect(buildEnv({ parent: PARENT, envWorktree: WT }).CONVEX_OVERRIDE_ACCESS_TOKEN).toBe(NESSUN_LOGIN);
  });

  it("il deployment arriva solo da .env.worktree", () => {
    const env = buildEnv({ parent: PARENT, envLocal: { VITE_CONVEX_URL: "https://x", CONVEX_DEPLOYMENT: "dev:x", GEMINI_API_KEY: "gem-local" }, envWorktree: WT });
    expect(env.CONVEX_DEPLOYMENT).toBe(WT.CONVEX_DEPLOYMENT);
    expect(env.VITE_CONVEX_URL).toBe(WT.VITE_CONVEX_URL);
    expect(env.CHAT_SERVER_SECRET).toBe("c");
    expect(env.GEMINI_API_KEY).toBe("gem-local"); // .env.local vince sul genitore
    expect(env.WT_ENV).toBe("1");
    for (const n of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOY_KEY_PROD", "CONVEX_DEPLOY_KEY_PREVIEW", "BETTER_AUTH_SECRET_PROD", "VERCEL_AUTOMATION_BYPASS_SECRET", "UPSTASH_REDIS_REST_TOKEN_RW", "GOOGLE_CLIENT_SECRET", "GH_TOKEN", "VITE_SITE_URL"]) {
      expect(env[n], n).toBeUndefined();
    }
  });

  it("senza .env.worktree nessuna variabile Convex", () => {
    const env = buildEnv({ parent: PARENT, envLocal: { CONVEX_DEPLOYMENT: "dev:x", VITE_CONVEX_URL: "https://x" } });
    expect(Object.keys(env).filter(n => /CONVEX/.test(n) && n !== "CONVEX_TMPDIR" && n !== "CONVEX_OVERRIDE_ACCESS_TOKEN")).toEqual([]);
  });

  it("i nomi vietati non passano nemmeno da .env.worktree", () => {
    const env = buildEnv({ parent: {}, envWorktree: { ...WT, CONVEX_DEPLOY_KEY: "x", FOO_PROD: "y", BETTER_AUTH_SECRET: "z" } });
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined();
    expect(env.FOO_PROD).toBeUndefined();
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
  });
});

describe("checkWorktreeEnv", () => {
  it("accetta un deployment locale o anonimo su 127.0.0.1", () => {
    expect(checkWorktreeEnv(WT)).toEqual([]);
    expect(checkWorktreeEnv({ ...WT, CONVEX_DEPLOYMENT: "local:local-team-concerti_gabri" })).toEqual([]);
  });

  it("rifiuta deployment cloud, URL non locali e nomi vietati, senza ripetere i valori", () => {
    const p = checkWorktreeEnv({ CONVEX_DEPLOYMENT: "dev:agile-leopard-908", VITE_CONVEX_URL: "https://segreto.convex.cloud", CONVEX_DEPLOY_KEY: "valore-segreto" });
    expect(p.length).toBeGreaterThanOrEqual(3);
    const all = p.join("\n");
    expect(all).not.toContain("valore-segreto");
    expect(all).not.toContain("segreto.convex.cloud");
    expect(checkWorktreeEnv({ ...WT, CONVEX_DEPLOYMENT: "prod:x" }).length).toBe(1);
    expect(checkWorktreeEnv({ ...WT, VITE_CONVEX_SITE_URL: "https://x.convex.site" }).length).toBe(1);
  });
});

describe("checkArgs", () => {
  const ok = (argv: string[]) => expect(checkArgs(argv), argv.join(" ")).toBeNull();
  const no = (argv: string[]) => expect(checkArgs(argv), argv.join(" ")).toBeTypeOf("string");

  it("lascia passare i comandi del worktree", () => {
    ok(["pnpm", "build:lock"]);
    ok(["pnpm", "exec", "vitest", "run", "--project", "convex"]);
    ok(["pnpm", "exec", "convex", "dev", "--once", "--env-file", ".env.worktree"]);
    ok(["npx", "convex", "run", "--env-file=.env.worktree", "seed:ensure"]);
    ok(["pnpm", "exec", "convex", "--help"]);
    ok(["pnpm", "exec", "vite", "preview"]);
  });

  it("rifiuta deploy, produzione, preview e i deployment condivisi", () => {
    no(["npx", "convex", "deploy"]);
    no(["pnpm", "exec", "convex", "run", "--env-file", ".env.worktree", "--prod", "seed:ensure"]);
    no(["pnpm", "exec", "convex", "run", "--env-file", ".env.worktree", "--deployment", "prod", "x"]);
    no(["sh", "-c", "npx convex deploy --cmd 'pnpm build'"]);
    no(["npx", "convex", "logs", "--env-file", ".env.worktree", "--deployment", "preview/multiutente"]);
    no(["npx", "convex", "env", "list", "--env-file", ".env.worktree", "--admin-key", "x"]);
    no(["vercel", "--prod"]);
    no(["node", "x.mjs", "brave-chickadee-534"]);
    no(["node", "x.mjs", "agile-leopard-908"]);
    no(["npx", "convex", "dev", "--env-file", ".env.worktree", "--preview-run", "seed:ensure"]);
  });

  it("vuole --env-file .env.worktree sulla CLI Convex", () => {
    no(["pnpm", "exec", "convex", "dev", "--once"]);
    no(["pnpm", "exec", "convex", "run", "--env-file", ".env.local", "seed:ensure"]);
    no(["pnpm", "exec", "convex", "env", "list", "--env-file", ".env.worktree", "--url", "https://x"]);
    expect(checkArgs(["pnpm", "exec", "convex", "dev", "--env-file", ".env.worktree"], { hasWorktreeEnv: false })).toMatch(/convex-locale/);
  });

  it("rifiuta login, logout, init e la creazione di deployment", () => {
    no(["npx", "convex", "login"]);
    no(["npx", "convex", "logout"]);
    no(["npx", "convex", "deployment", "create", "local"]);
    no(["npx", "convex", "init"]);
  });

  it("--env-file deve essere il .env.worktree di QUESTO worktree", () => {
    ok(["pnpm", "exec", "convex", "run", "--env-file", "./.env.worktree", "seed:ensure"]);
    ok(["pnpm", "exec", "convex", "run", "--env-file", join(ROOT, ".env.worktree"), "seed:ensure"]);
    no(["pnpm", "exec", "convex", "run", "--env-file", "/tmp/altro/.env.worktree", "seed:ensure"]);
    no(["pnpm", "exec", "convex", "run", "--env-file=../x/.env.worktree", "seed:ensure"]);
    no(["pnpm", "exec", "convex", "run", "--env-file", ".env.worktree", "--env-file", "/tmp/x/.env.worktree", "seed:ensure"]);
  });

  it("rifiuta assegnazioni di nomi Convex o vietati (env NOME=valore …)", () => {
    no(["env", "CONVEX_DEPLOY_KEY=preview:team:proj|x", "pnpm", "exec", "convex", "run", "--env-file", ".env.worktree", "x:y"]);
    no(["env", "CONVEX_DEPLOYMENT=dev:x", "pnpm", "exec", "vite"]);
    no(["env", "VITE_CONVEX_URL=https://x", "pnpm", "exec", "vite"]);
    no(["env", "FOO_PROD=x", "node", "x.mjs"]);
    no(["env", "CONVEX_OVERRIDE_ACCESS_TOKEN=x", "pnpm", "exec", "convex", "run", "--env-file", ".env.worktree", "x:y"]);
    ok(["env", "E2E=1", "pnpm", "exec", "vite"]);
  });

  it("rifiuta la CLI Convex dentro una stringa o lanciata dal suo main.js senza --env-file", () => {
    no(["sh", "-c", "pnpm exec convex env list"]);
    no(["bash", "-lc", "cd x && npx convex@1.47.0 run seed:ensure"]);
    no(["node", "-e", "require('child_process').execSync('npx convex   data')"]);
    no(["node", "node_modules/convex/bin/main.js", "env", "list"]);
    no(["pnpm", "exec", "convex", "--verbose", "env", "list"]);
    ok(["node", "node_modules/convex/bin/main.js", "run", "--env-file", ".env.worktree", "seed:ensure"]);
    ok(["node", "-e", "console.log(Object.keys(process.env).filter(k => /CONVEX_DEPLOYMENT/.test(k)))"]);
  });

  it("riconosce la CLI Convex anche come percorso, ma non `--project convex`", () => {
    expect(convexSubcommandIndex(["node_modules/.bin/convex", "dev"])).toBe(1);
    expect(convexSubcommandIndex(["vitest", "run", "--project", "convex"])).toBe(-1);
    expect(convexSubcommandIndex(["vitest", "convex/geo.test.ts"])).toBe(-1);
  });
});

describe("parseDotenv", () => {
  it("legge KEY=VALUE, export, virgolette e commenti", () => {
    expect(parseDotenv('A=1\nexport B="due tre"\n# c\nC=x # commento\nD=\'q\'\n')).toEqual({ A: "1", B: "due tre", C: "x", D: "q" });
  });
});

describe("convex-locale run: solo funzione e oggetto JSON", () => {
  // si ferma prima di toccare qualunque deployment (validazione degli argomenti)
  const run = (...a: string[]) => spawnSync(process.execPath, [join(ROOT, "scripts/convex-locale.mjs"), "run", ...a], { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH } });
  it.each([
    [["seed:ensure", "--deployment=dev-condiviso"]],
    [["seed:ensure", "--url=https://x.convex.cloud"]],
    [["seed:ensure", "{}", "--prod"]],
    [["seed:ensure", "[1]"]],
    [["seed:ensure", "{non json"]],
    [["--deployment=x", "{}"]],
  ])("rifiuta %j", argv => {
    const r = run(...argv);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/uso: run|oggetto JSON/);
  });
});
