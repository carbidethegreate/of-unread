import React, { useMemo } from "react";
import type { UiMessage } from "../lib/types";

export default function HistoryPanel({ history }: { history: UiMessage[] }) {
  const rows = useMemo(() => history.slice(-24), [history]);
  return (
    <div className="history">
      {rows.length === 0 ? <div className="muted">No history returned.</div> : null}
      {rows.map((m, idx) => (
        <div key={idx} className={`history-row ${m.sender === "fan" ? "fan" : "creator"}`}>
          <div className="history-meta">
            <span className="history-sender">{m.sender}</span>
            <span className="history-time">{m.timestamp || ""}</span>
          </div>
          <div className="history-text">{m.text}</div>
        </div>
      ))}
    </div>
  );
}
