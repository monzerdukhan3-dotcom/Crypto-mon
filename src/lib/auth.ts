import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { findUserByEmail, verifyPassword } from "./users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await verifyPassword(email, password);
        if (!user) return null;

        return { id: String(user.id), email: user.email, isAdmin: user.isAdmin, accessUntil: user.accessUntil };
      },
    }),
  ],
  callbacks: {
    // Re-reads isAdmin/accessUntil from the DB on every call (not just the
    // initial sign-in) — cheap (one indexed lookup) and means an admin
    // extending someone's access from /admin after a Telegram payment takes
    // effect on that visitor's very next request, not only after they log
    // out and back in.
    async jwt({ token, user }) {
      const email = user?.email ?? (token.email as string | undefined);
      if (!email) return token;

      const dbUser = await findUserByEmail(email);
      if (dbUser) {
        token.email = dbUser.email;
        token.isAdmin = dbUser.isAdmin;
        token.accessUntil = dbUser.accessUntil;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.isAdmin = Boolean(token.isAdmin);
        session.user.accessUntil = (token.accessUntil as string | null | undefined) ?? null;
      }
      return session;
    },
  },
});
