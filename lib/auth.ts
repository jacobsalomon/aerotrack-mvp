// Auth.js (NextAuth v5) configuration for AeroVision.
// Supports Google and Microsoft Entra ID (Azure AD) OAuth login.
// Falls back to passcode-only mode when no OAuth providers are configured.
//
// After OAuth login, the user's role is synced from the Technician table
// (matched by email). If no Technician record exists, defaults to TECHNICIAN role.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// Only include providers that have credentials configured.
// This lets the app run in demo mode (passcode-only) when no OAuth env vars are set.
function getProviders() {
  const providers = [];

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      })
    );
  }

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
  adapter: PrismaAdapter(prisma),
  providers: getProviders(),
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // After sign-in, sync role from Technician table (matched by email)
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Look up the Technician record to get their role
        const technician = await prisma.technician.findUnique({
          where: { email: user.email! },
          select: { role: true, id: true },
        });
        // Use the Technician role if found, otherwise use the User model role
        session.user.role = technician?.role ?? (user as { role?: string }).role ?? "TECHNICIAN";
        session.user.technicianId = technician?.id ?? null;
      }
      return session;
    },
  },
});

// Check if any OAuth providers are configured
export function hasOAuthProviders(): boolean {
  return getProviders().length > 0;
}

// TypeScript augmentation so session.user has our custom fields
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      technicianId: string | null;
    };
  }
}
