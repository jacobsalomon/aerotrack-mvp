// Edge-compatible auth configuration — used by middleware.
// This file must NOT import anything that uses Node.js APIs (no Prisma, no bcrypt, no crypto).
// The full auth.ts file extends this config with the Prisma adapter and Credentials provider.

import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  // JWT strategy — required for Credentials provider
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  // Providers are added in auth.ts — this is just the base config.
  // An empty array is fine here; the full config in auth.ts overrides it.
  providers: [],

  callbacks: {
    // The authorized callback runs in middleware to check if the user can access the route.
    // Returning false redirects to the signIn page.
    authorized({ auth }) {
      return !!auth?.user;
    },

    // Store user info in the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
        token.organizationId = (user as { organizationId?: string | null }).organizationId ?? null;
        token.badgeNumber = (user as { badgeNumber?: string | null }).badgeNumber ?? null;
        token.firstName = (user as { firstName?: string | null }).firstName ?? null;
        token.lastName = (user as { lastName?: string | null }).lastName ?? null;
      }
      return token;
    },

    // Build the session object from the JWT token
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "USER";
        session.user.organizationId = (token.organizationId as string) ?? null;
        session.user.badgeNumber = (token.badgeNumber as string) ?? null;
        session.user.firstName = (token.firstName as string) ?? null;
        session.user.lastName = (token.lastName as string) ?? null;
      }
      return session;
    },
  },
};
