/* L'app Convex e i suoi componenti: il rate limiter e Better Auth,
   installato in locale (convex/betterAuth/, PIANO §1.1). */
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp();
app.use(rateLimiter);
app.use(betterAuth);

export default app;
