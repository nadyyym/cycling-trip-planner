import NextAuth from "next-auth";

import { authConfig } from "~/server/auth/config";
import { env } from "~/env";

const handler = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  trustHost: true,
});

export { handler as GET, handler as POST };
