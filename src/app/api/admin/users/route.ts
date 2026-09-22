import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countUsers, createUser, deleteUser, findUserByEmail, listUsers } from "@/lib/users";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Middleware already gates every route behind a signed-in session, but this
// endpoint creates/deletes login credentials, so it re-checks here too —
// defense in depth is cheap and this is the one place a mistake would matter.
async function requireSession() {
  const session = await auth();
  if (!session) return null;
  return session;
}

export async function GET() {
  if (!(await requireSession())) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  if (!(await requireSession())) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

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

  const user = await createUser(email, password);
  return NextResponse.json({ user });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireSession())) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  // Never let the site end up with zero accounts — that locks everyone out
  // with no way back in short of touching the database directly.
  if ((await countUsers()) <= 1) {
    return NextResponse.json({ error: "لا يمكن حذف آخر حساب متبقٍ" }, { status: 400 });
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
