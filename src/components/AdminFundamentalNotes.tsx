"use client";

import { Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SUPPORTED_SYMBOLS, type SymbolInfo } from "@/lib/constants";
import {
  deleteFundamentalNote,
  getFundamentalNote,
  loadFundamentalNotes,
  saveFundamentalNote,
  type FundamentalNote,
} from "@/lib/fundamentalNotes";

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminFundamentalNotes() {
  const [availableSymbols, setAvailableSymbols] = useState<SymbolInfo[]>(SUPPORTED_SYMBOLS);
  const [symbol, setSymbol] = useState<string>("BTC");
  const [text, setText] = useState("");
  const [savedNote, setSavedNote] = useState<FundamentalNote | null>(null);
  const [allNotes, setAllNotes] = useState<Record<string, FundamentalNote>>({});
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    fetch("/api/symbols")
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json.symbols) && json.symbols.length > 0) setAvailableSymbols(json.symbols);
      })
      .catch(() => {
        // Keep the pinned defaults.
      });
  }, []);

  useEffect(() => {
    function load() {
      setAllNotes(loadFundamentalNotes());
    }
    load();
  }, []);

  useEffect(() => {
    function load() {
      const note = getFundamentalNote(symbol);
      setSavedNote(note);
      setText(note?.text ?? "");
      setJustSaved(false);
    }
    load();
  }, [symbol]);

  const otherNotes = useMemo(
    () => Object.values(allNotes).filter((n) => n.symbol !== symbol),
    [allNotes, symbol]
  );

  function handleSave() {
    const note = saveFundamentalNote(symbol, text);
    setSavedNote(note);
    setAllNotes(loadFundamentalNotes());
    setJustSaved(true);
  }

  function handleDelete() {
    deleteFundamentalNote(symbol);
    setSavedNote(null);
    setText("");
    setAllNotes(loadFundamentalNotes());
    setJustSaved(false);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="rounded-xl border border-warning-soft bg-warning-soft p-4 text-sm leading-relaxed text-warning">
        هذا النموذج يحفظ الملاحظات محليًا في متصفحك الحالي فقط (localStorage) — التعديل هنا لن يظهر لزوار آخرين
        يفتحون الموقع من متصفح أو جهاز مختلف. للنشر على مستوى الموقع لجميع الزوار يحتاج قاعدة بيانات حقيقية.
      </div>

      <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
        <label className="flex flex-col gap-2 text-sm font-medium text-muted">
          العملة
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="rounded-lg border border-surface-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-success/40"
          >
            {availableSymbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-muted">
          نص التحليل الأساسي
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setJustSaved(false);
            }}
            rows={6}
            placeholder="اكتب هنا ملخص الأخبار أو العوامل الأساسية المؤثرة على هذه العملة..."
            className="resize-y rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-success/40"
          />
        </label>

        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{savedNote ? `آخر تحديث: ${formatDate(savedNote.updatedAt)}` : "لا توجد ملاحظة محفوظة لهذه العملة بعد."}</span>
          {justSaved && <span className="text-success">تم الحفظ ✓</span>}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Save className="h-4 w-4" strokeWidth={2.25} />
            حفظ
          </button>
          {savedNote && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              حذف
            </button>
          )}
        </div>
      </div>

      {otherNotes.length > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-foreground">ملاحظات محفوظة لعملات أخرى ({otherNotes.length})</h2>
          <ul className="flex flex-col gap-2">
            {otherNotes.map((note) => (
              <li key={note.symbol}>
                <button
                  onClick={() => setSymbol(note.symbol)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-background"
                >
                  <span className="font-medium text-foreground">{note.symbol}</span>
                  <span className="text-xs text-muted">{formatDate(note.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
