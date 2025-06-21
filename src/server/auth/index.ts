import NextAuth from "next-auth";

import { authConfig } from "~/server/auth/config";

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
