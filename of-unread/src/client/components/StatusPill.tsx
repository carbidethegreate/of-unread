import React from "react";

export function StatusPill({ kind, text }: { kind: "idle" | "ok" | "warn" | "err" | "work"; text: string }) {
  return <span className={`pill pill-${kind}`}>{text}</span>;
}
