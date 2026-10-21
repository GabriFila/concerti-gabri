/* L'app Convex e i suoi componenti. Il componente Better Auth (installato in
   locale, convex/betterAuth/) lo aggiunge il traguardo 3. */
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();
app.use(rateLimiter);

export default app;
