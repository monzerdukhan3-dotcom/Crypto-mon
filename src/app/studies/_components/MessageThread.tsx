import { formatDateTime } from "@/lib/studies/labels";
import type { Message } from "@/lib/studies/types";

export default function MessageThread({ messages, viewer }: { messages: Message[]; viewer: "client" | "manager" }) {
  if (messages.length === 0) return <p className="text-sm text-muted">لا توجد رسائل بعد.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m) => {
        const mine = m.from === viewer;
        return (
          <li key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                mine ? "bg-info-soft" : "border border-surface-border bg-background"
              }`}
            >
              <p className="text-xs font-semibold text-muted">{m.from === "client" ? "العميل" : "فريق الدراسة"}</p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[11px] text-muted">{formatDateTime(m.at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
