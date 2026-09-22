"use client";

import { useFormStatus } from "react-dom";

const VARIANTS = {
  primary: "bg-info text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "border border-surface-border bg-surface text-foreground hover:bg-background",
};

export default function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}
