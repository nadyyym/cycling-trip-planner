import { postRouter } from "~/server/api/routers/post";
import { stravaRouter } from "~/server/api/routers/strava";
import { segmentRouter } from "~/server/api/routers/segment";
import { routePlannerRouter } from "~/server/api/routers/routePlanner";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  strava: stravaRouter,
  segment: segmentRouter,
  routePlanner: routePlannerRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
