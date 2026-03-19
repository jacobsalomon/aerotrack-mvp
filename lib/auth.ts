// Auth.js (NextAuth v5) full configuration for AeroVision.
// Extends the edge-compatible base config (auth.config.ts) with:
// - PrismaAdapter for user/account persistence
// - Credentials provider for email/password login
// - Google and Microsoft OAuth providers (optional)
//
// This file uses Node.js APIs (Prisma, bcrypt) so it can only run server-side,
// NOT in middleware. Middleware uses auth.config.ts instead.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { authConfig } from "@/lib/auth.config";

// Only include OAuth providers that have credentials configured.
function getProviders() {
  const providers = [];

  // Email/password login — always available
  providers.push(
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        // Look up user by email
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        // No user found, or user has no password (OAuth-only account)
        if (!user?.passwordHash) return null;

        // Verify password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        // Return user object — this gets stored in the JWT
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          badgeNumber: user.badgeNumber,
          firstName: user.firstName,
          lastName: user.lastName,
        };
      },
    })
  );

  // Google OAuth (optional — only if env vars are set)
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      })
    );
  }

  // Microsoft Entra ID OAuth (optional — only if env vars are set)
  if (
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
  ) {
    providers.push(
      MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      })
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: getProviders(),
  callbacks: {
    ...authConfig.callbacks,

    // Override jwt to support refresh after joining an org.
    // When client calls update(), we re-fetch the user's organizationId from the DB
    // so the JWT reflects the new org assignment without requiring re-login.
    async jwt({ token, user, trigger }) {
      // Initial login — store all user fields in the token
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
        token.organizationId = (user as { organizationId?: string | null }).organizationId ?? null;
        token.badgeNumber = (user as { badgeNumber?: string | null }).badgeNumber ?? null;
        token.firstName = (user as { firstName?: string | null }).firstName ?? null;
        token.lastName = (user as { lastName?: string | null }).lastName ?? null;
      }

      // Session refresh — re-read org assignment from DB (e.g., after joining an org)
      if (trigger === "update" && token.id) {
        const freshUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { organizationId: true, role: true, badgeNumber: true, firstName: true, lastName: true },
        });
        if (freshUser) {
          token.organizationId = freshUser.organizationId;
          token.role = freshUser.role;
          token.badgeNumber = freshUser.badgeNumber;
          token.firstName = freshUser.firstName;
          token.lastName = freshUser.lastName;
        }
      }

      return token;
    },
  },
});

// TypeScript augmentation so session.user has our custom fields
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      organizationId: string | null;
      badgeNumber: string | null;
      firstName: string | null;
      lastName: string | null;
    };
  }
}
