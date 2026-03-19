// Wraps the app in NextAuth's SessionProvider so useSession() works in client components.
// Wrapped in Suspense because next-auth/react may use useSearchParams internally.

"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { Suspense } from "react";

function SessionProviderInner({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider basePath={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth`}>
      {children}
    </NextAuthSessionProvider>
  );
}

export default function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <SessionProviderInner>{children}</SessionProviderInner>
    </Suspense>
  );
}
