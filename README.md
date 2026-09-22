This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## منصة الدراسات (`/studies`)

النسخة الأولى (MVP) من منصة إدارة وتنفيذ الدراسات — الرحلة الأساسية كاملة من طلب العميل حتى تأكيد استلام التقرير.

- **العميل**: يطلب الدراسة من `/studies/request` (أو يحفظها مسودة) ويحصل على رابط خاص بدراسته `/studies/c/<token>`.
- **مدير الدراسة**: `/studies/m/<token>` — الخطة، الفريق والمهام، جودة البيانات، اعتماد التقرير وتسليمه.
- **الباحث / المحلل**: `/studies/r/<token>` — مهامه فقط، ودراسات التحليل المسندة إليه.
- لا توجد حسابات: الوصول بالروابط الفريدة فقط. المديرون والباحثون يُضافون يدويًا في `.data/studies/db.json` (يُنشأ تلقائيًا مع بيانات أولية عند أول تشغيل).
- `/studies/demo` يعرض كل روابط الوصول للتجربة (معطّل في الإنتاج إلا مع `STUDIES_DEMO_LINKS=1`).
- التخزين ملف JSON وملفات مرفوعة في `STUDIES_DATA_DIR` (الافتراضي `.data/studies`). على الاستضافات عديمة الحالة (مثل Vercel) يجب ربطه بمجلد دائم أو استبدال `src/lib/studies/store.ts` بقاعدة بيانات.
