import { NextRequest, NextResponse } from "next/server";
import { createTrialUser, findUserByEmail } from "@/lib/users";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public self-service signup — the only way an account gets created without
 * an admin doing it from /admin. Always starts a short free trial
 * (createTrialUser); there's no way to sign up directly into unlimited
 * access from here.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, { status: 400 });
  }
  if (await findUserByEmail(email)) {
    return NextResponse.json({ error: "هذا البريد الإلكتروني مسجّل بالفعل" }, { status: 409 });
  }

  await createTrialUser(email, password);
  return NextResponse.json({ ok: true });
}
