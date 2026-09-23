import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      isAdmin: boolean;
      /** ISO timestamp, or null for unlimited access. See src/lib/db.ts. */
      accessUntil: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    isAdmin?: boolean;
    accessUntil?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isAdmin?: boolean;
    accessUntil?: string | null;
  }
}
