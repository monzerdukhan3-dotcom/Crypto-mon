import { STUDY_TYPES } from "@/lib/studies/labels";
import type { Client, Study } from "@/lib/studies/types";
import { Field, Select } from "./ui";

export default function RequestFields({ client, study }: { client?: Client; study?: Study }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="اسم الشركة" name="companyName" required defaultValue={client?.companyName} />
      <Select
        label="نوع الدراسة المطلوبة *"
        name="studyType"
        placeholder="اختر نوع الدراسة"
        defaultValue={study?.studyType}
        options={STUDY_TYPES.map((t) => ({ value: t, label: t }))}
      />
      <div className="sm:col-span-2">
        <Field
          label="عنوان الدراسة"
          name="title"
          defaultValue={study && study.title !== study.studyType ? study.title : ""}
          placeholder="مثال: قياس رضا عملاء فروع الرياض"
          hint="اختياري — يُستخدم نوع الدراسة عنوانًا إن تُرك فارغًا."
        />
      </div>
      <Field label="الشخص المسؤول" name="contactName" required defaultValue={client?.contactName} />
      <Field label="الهاتف" name="phone" type="tel" required defaultValue={client?.phone} />
      <div className="sm:col-span-2">
        <Field label="البريد الإلكتروني" name="email" type="email" required defaultValue={client?.email} />
      </div>
    </div>
  );
}
