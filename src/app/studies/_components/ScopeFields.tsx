import type { Scope } from "@/lib/studies/types";
import { Field } from "./ui";

export default function ScopeFields({ scope }: { scope: Scope }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="الهدف من الدراسة" name="objective" multiline required defaultValue={scope.objective} />
      </div>
      <Field label="الفئة المستهدفة" name="targetAudience" multiline required defaultValue={scope.targetAudience} />
      <Field label="المناطق" name="regions" multiline required defaultValue={scope.regions} />
      <Field
        label="الجدول الزمني"
        name="timeline"
        required
        defaultValue={scope.timeline}
        placeholder="مثال: 6 أسابيع تبدأ من 1 أكتوبر"
      />
      <Field label="الميزانية المتوقعة" name="budget" required defaultValue={scope.budget} placeholder="مثال: 40,000 ريال" />
    </div>
  );
}
