import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import StravaProvider from "next-auth/providers/strava";
import { type JWT } from "next-auth/jwt";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "~/server/db/schema";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      stravaId?: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }

  interface User {
    stravaId?: string;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    stravaId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    stravaId?: string;
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  secret: env.AUTH_SECRET,
  trustHost: true,
  providers: [
    StravaProvider({
      clientId: env.STRAVA_CLIENT_ID,
      clientSecret: env.STRAVA_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "read,activity:read_all",
          approval_prompt: "auto",
        },
      },
    }),
  ],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  debug: env.NODE_ENV === "development",
  logger: {
    error: (error) => {
      console.error("[AUTH_ERROR_DETAILED]", {
        message: error.message,
        name: error.name,
        stack: error.stack,
        cause: error.cause,
        timestamp: new Date().toISOString(),
      });
    },
    warn: (code) => {
      console.warn(`[AUTH_WARN] ${code}`);
    },
    debug: (code, metadata) => {
      if (env.NODE_ENV === "development") {
        console.log(`[AUTH_DEBUG] ${code}:`, metadata);
      }
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log("[AUTH_SIGNIN_START]", {
        userId: user.id,
        provider: account?.provider,
        profilePresent: !!profile,
        timestamp: new Date().toISOString(),
      });

      try {
        // Test database connection
        console.log("[AUTH_DB_TEST] Testing database connection...");
        await db.query.users.findFirst();
        console.log("[AUTH_DB_TEST] Database connection successful");

        return true;
      } catch (error) {
        console.error("[AUTH_DB_ERROR] Database connection failed:", {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });
        return false;
      }
    },
    async jwt({ token, account, user }): Promise<JWT> {
      // Store access token and refresh token in JWT
      if (account) {
        console.log("[AUTH_JWT_CALLBACK]", {
          provider: account.provider,
          accessToken: account.access_token ? "present" : "missing",
          refreshToken: account.refresh_token ? "present" : "missing",
          expiresAt: account.expires_at,
          timestamp: new Date().toISOString(),
        });

        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.stravaId = user?.stravaId;
      }
      return token;
    },
    session: ({ session, user, token }) => {
      console.log("[AUTH_SESSION_CALLBACK]", {
        userId: user?.id,
        tokenPresent: !!token,
        timestamp: new Date().toISOString(),
      });

      return {
        ...session,
        user: {
          ...session.user,
          id: user?.id ?? token?.sub ?? "",
          stravaId: user?.stravaId ?? token?.stravaId,
        },
        accessToken: token?.accessToken,
        refreshToken: token?.refreshToken,
        expiresAt: token?.expiresAt,
      };
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      console.log("[AUTH_SIGNIN_SUCCESS]", {
        userId: user.id,
        name: user.name,
        provider: account?.provider,
        profilePresent: !!profile,
        timestamp: new Date().toISOString(),
      });
    },
    async createUser({ user }) {
      console.log("[AUTH_CREATE_USER]", {
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
      });
    },
  },
} satisfies NextAuthConfig;
