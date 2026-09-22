import { CheckCircle2, AlertTriangle, Info, Siren } from "lucide-react";
import { CLIENT_STAGES, formatDateTime } from "@/lib/studies/labels";
import type { Alert } from "@/lib/studies/queries";
import type { StudyStatus, StudyUpdate } from "@/lib/studies/types";

export function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </main>
  );
}

export function Card({
  title,
  step,
  children,
  tone,
}: {
  title?: string;
  step?: number;
  children: React.ReactNode;
  tone?: "muted";
}) {
  return (
    <section
      className={`rounded-2xl border border-surface-border p-5 shadow-sm ${tone === "muted" ? "bg-background" : "bg-surface"}`}
    >
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          {step !== undefined && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-info-soft text-xs text-info">
              {step}
            </span>
          )}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export async function Flash({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const ok = typeof params.ok === "string" ? params.ok : null;
  const error = typeof params.error === "string" ? params.error : null;
  if (!ok && !error) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
        error ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
      }`}
    >
      {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      {error ?? ok}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-info focus:ring-2 focus:ring-info-soft";

export function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  multiline,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {multiline ? (
        <textarea name={name} defaultValue={defaultValue} rows={3} placeholder={placeholder} className={inputClass} />
      ) : (
        <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className={inputClass} />
      )}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Hidden(props: Record<string, string>) {
  return (
    <>
      {Object.entries(props).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

const BADGE_TONES = {
  neutral: "bg-background text-muted border border-surface-border",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StageStepper({ status }: { status: StudyStatus }) {
  const current = CLIENT_STAGES.findIndex((s) => (s.statuses as readonly StudyStatus[]).includes(status));
  return (
    <ol className="grid grid-cols-4 gap-2">
      {CLIENT_STAGES.map((stage, i) => {
        const done = i < current || status === "completed";
        const active = i === current && status !== "completed";
        return (
          <li key={stage.key} className="flex flex-col items-center gap-1.5 text-center">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                done ? "bg-success text-white" : active ? "bg-info text-white ring-4 ring-info-soft" : "bg-background text-muted border border-surface-border"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={`text-xs font-semibold ${active ? "text-info" : done ? "text-success" : "text-muted"}`}>
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const UPDATE_TONES: Record<StudyUpdate["kind"], string> = {
  update: "border-info",
  delay: "border-warning",
  scope: "border-surface-border",
  system: "border-success",
};

export function UpdatesFeed({ updates }: { updates: StudyUpdate[] }) {
  if (updates.length === 0) return <p className="text-sm text-muted">لا توجد تحديثات بعد.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {[...updates].reverse().map((u, i) => (
        <li key={i} className={`border-s-4 ps-3 ${UPDATE_TONES[u.kind]}`}>
          <p className="text-sm">{u.text}</p>
          <p className="mt-0.5 text-xs text-muted">{formatDateTime(u.at)}</p>
        </li>
      ))}
    </ul>
  );
}

const ALERT_STYLES = {
  urgent: { className: "bg-danger-soft text-danger", Icon: Siren },
  warning: { className: "bg-warning-soft text-warning", Icon: AlertTriangle },
  info: { className: "bg-info-soft text-info", Icon: Info },
};

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  const order = { urgent: 0, warning: 1, info: 2 };
  return (
    <ul className="flex flex-col gap-2">
      {[...alerts].sort((a, b) => order[a.level] - order[b.level]).map((a, i) => {
        const { className, Icon } = ALERT_STYLES[a.level];
        return (
          <li key={i} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium ${className}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            {a.text}
          </li>
        );
      })}
    </ul>
  );
}

export function KeyValue({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold text-muted">{k}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-surface-border bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-info">{summary}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
