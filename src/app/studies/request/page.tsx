import { createRequest } from "../actions";
import RequestFields from "../_components/RequestFields";
import SubmitButton from "../_components/SubmitButton";
import { Card, Flash, PageShell } from "../_components/ui";

export default function RequestPage({ searchParams }: PageProps<"/studies/request">) {
  return (
    <PageShell title="طلب دراسة جديدة" subtitle="اكتب بيانات شركتك ونوع الدراسة. يمكنك حفظ الطلب كمسودة وإكماله لاحقًا.">
      <Flash searchParams={searchParams} />
      <Card>
        <form action={createRequest} className="flex flex-col gap-5">
          <RequestFields />
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="intent" value="submit">
              إرسال الطلب
            </SubmitButton>
            <SubmitButton name="intent" value="draft" variant="ghost">
              حفظ كمسودة
            </SubmitButton>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
