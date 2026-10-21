/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agents from "../agents.js";
import type * as authMcp from "../authMcp.js";
import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as departures from "../departures.js";
import type * as devOtp from "../devOtp.js";
import type * as devtools from "../devtools.js";
import type * as entries from "../entries.js";
import type * as geo from "../geo.js";
import type * as gifters from "../gifters.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_builders from "../lib/builders.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_handles from "../lib/handles.js";
import type * as lib_km from "../lib/km.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_refs from "../lib/refs.js";
import type * as lib_zodConvex from "../lib/zodConvex.js";
import type * as me from "../me.js";
import type * as migrations from "../migrations.js";
import type * as pages from "../pages.js";
import type * as people from "../people.js";
import type * as profiles from "../profiles.js";
import type * as rateLimits from "../rateLimits.js";
import type * as seed from "../seed.js";
import type * as venues from "../venues.js";
import type * as wishlist from "../wishlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  agents: typeof agents;
  authMcp: typeof authMcp;
  chat: typeof chat;
  crons: typeof crons;
  departures: typeof departures;
  devOtp: typeof devOtp;
  devtools: typeof devtools;
  entries: typeof entries;
  geo: typeof geo;
  gifters: typeof gifters;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/builders": typeof lib_builders;
  "lib/errors": typeof lib_errors;
  "lib/handles": typeof lib_handles;
  "lib/km": typeof lib_km;
  "lib/owner": typeof lib_owner;
  "lib/refs": typeof lib_refs;
  "lib/zodConvex": typeof lib_zodConvex;
  me: typeof me;
  migrations: typeof migrations;
  pages: typeof pages;
  people: typeof people;
  profiles: typeof profiles;
  rateLimits: typeof rateLimits;
  seed: typeof seed;
  venues: typeof venues;
  wishlist: typeof wishlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
