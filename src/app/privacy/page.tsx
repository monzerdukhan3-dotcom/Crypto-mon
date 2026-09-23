function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">سياسة الخصوصية</h1>
          <p className="mt-1 text-xs text-muted">آخر تحديث: 2026</p>
        </div>

        <Section title="1. ما الذي نجمعه">
          <p>عند إنشاء حساب، نحفظ فقط: بريدك الإلكتروني، وكلمة مرورك (مشفّرة — لا تُحفظ أبدًا كنص صريح)، وتاريخ الاشتراك وحالته (فترة تجريبية / نشط / منتهي).</p>
          <p>لا نطلب ولا نخزّن أي بيانات دفع أو بطاقات بنكية على خوادمنا — الفوترة تتم يدويًا خارج الموقع (عبر تلغرام).</p>
        </Section>

        <Section title="2. كيف نستخدم بياناتك">
          <p>
            بريدك الإلكتروني وكلمة المرور تُستخدمان فقط لتسجيل الدخول والتحقق من هويتك. لا نستخدم بريدك للتسويق أو
            نشاركه مع أي طرف ثالث لأغراض إعلانية.
          </p>
        </Section>

        <Section title="3. ملفات تعريف الارتباط (Cookies)">
          <p>
            نستخدم كوكي جلسة تسجيل دخول واحدة (عبر NextAuth) للحفاظ على تسجيل دخولك بين الزيارات. هذه الكوكي وظيفية
            بحتة — ليست كوكيز تتبع أو إعلانات.
          </p>
        </Section>

        <Section title="4. مزوّدو خدمات خارجيون">
          <p>نعتمد على خدمات خارجية لتشغيل الموقع، ولا نشارك بياناتك الشخصية (بريدك أو كلمة مرورك) مع أي منها:</p>
          <ul className="list-inside list-disc">
            <li>Binance — بيانات أسعار وشموع عامة، بدون أي معرّف شخصي لك.</li>
            <li>CoinGecko — بيانات مشاريع عملات عامة، بدون أي معرّف شخصي لك.</li>
            <li>Neon (قاعدة بيانات Postgres) — تخزين بيانات حسابك (بريد، كلمة مرور مشفّرة، حالة الاشتراك).</li>
            <li>Vercel — استضافة الموقع نفسه.</li>
          </ul>
        </Section>

        <Section title="5. حذف حسابك">
          <p>يمكنك طلب حذف حسابك وكل بياناته المرتبطة به بالتواصل مع مالك الخدمة عبر نفس قناة الاشتراك (تلغرام).</p>
        </Section>

        <Section title="6. أمان البيانات">
          <p>كلمات المرور مشفّرة بخوارزمية bcrypt قبل التخزين ولا يمكن لأي شخص — بما فيهم مالك الموقع — استرجاعها بصيغتها الأصلية.</p>
        </Section>

        <Section title="7. التعديلات">
          <p>قد تُحدَّث هذه السياسة من وقت لآخر. الاستمرار في استخدام الخدمة بعد أي تحديث يُعد موافقة على السياسة المحدّثة.</p>
        </Section>
      </div>
    </div>
  );
}
