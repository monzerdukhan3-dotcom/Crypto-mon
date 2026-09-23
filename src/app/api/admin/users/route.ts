import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createUser, deleteUser, extendUserAccess, findUserByEmail, listUsers, setUserAccessUntil } from "@/lib/users";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The proxy already restricts /api/admin/* to admin accounts, but this
// endpoint creates/deletes login credentials, so it re-checks here too —
// defense in depth is cheap and this is the one place a mistake would matter.
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const isAdmin = body?.isAdmin === true;

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, { status: 400 });
  }
  if (await findUserByEmail(email)) {
    return NextResponse.json({ error: "هذا البريد الإلكتروني مسجّل بالفعل" }, { status: 409 });
  }

  const user = await createUser(email, password, isAdmin);
  return NextResponse.json({ user });
}

// Manages a user's subscription access after the owner confirms a payment
// over Telegram (billing is manual — there's no Stripe/webhook writing this).
// { unlimited: true } grants permanent access; { revoke: true } cuts access
// off immediately; { days: N } extends by N days from whichever is later,
// now or their current access_until (see extendUserAccess).
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  if (body?.unlimited === true) {
    const user = await setUserAccessUntil(id, null);
    return NextResponse.json({ user });
  }

  if (body?.revoke === true) {
    const user = await setUserAccessUntil(id, new Date().toISOString());
    return NextResponse.json({ user });
  }

  const days = Number(body?.days);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "قيمة أيام غير صالحة" }, { status: 400 });
  }
  const user = await extendUserAccess(id, days);
  return NextResponse.json({ user });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  // Never let the site end up with zero accounts, or zero admins — either
  // one locks everyone (including the owner) out with no way back short of
  // touching the database directly.
  const users = await listUsers();
  if (users.length <= 1) {
    return NextResponse.json({ error: "لا يمكن حذف آخر حساب متبقٍ" }, { status: 400 });
  }
  const target = users.find((u) => u.id === id);
  if (target?.isAdmin && users.filter((u) => u.isAdmin).length <= 1) {
    return NextResponse.json({ error: "لا يمكن حذف آخر حساب مدير متبقٍ" }, { status: 400 });
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
