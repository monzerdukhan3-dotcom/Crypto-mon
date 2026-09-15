import AdminFundamentalNotes from "@/components/AdminFundamentalNotes";

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold text-foreground">إدارة التحليل الأساسي</h1>
          <p className="max-w-md text-center text-sm text-muted">
            حرّر يدويًا نص التحليل الأساسي المعروض لكل عملة في لوحة التحليل
          </p>
        </div>

        <AdminFundamentalNotes />
      </main>
    </div>
  );
}
