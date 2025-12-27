import React, { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import type { Meta, UnreadItem } from "./lib/types";
import MessageItem, { CardStatus, CardState } from "./components/MessageItem";
import Tooltip from "./components/Tooltip";

const ACCOUNT_LABEL = "Parker Martin";
const ACCOUNT_ID = "acct_6c513bcfe14346399f6bf0f5a0bffafb";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultCardState(meta: Meta | null): CardState {
  const selectedLists: Record<string, boolean> = {};
  (meta?.listOptions || []).forEach((o) => (selectedLists[o.id] = false));
  return { draftText: "", price: "", selectedLists };
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [days, setDays] = useState(10);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UnreadItem[]>([]);
  const [error, setError] = useState<string>("");

  const [cardState, setCardState] = useState<Record<string, CardState>>({});
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({});
  const [bulkStatus, setBulkStatus] = useState<"idle" | "working" | "done">("idle");

  useEffect(() => {
    api.meta()
      .then(setMeta)
      .catch(() => {
        setMeta({
          accountId: ACCOUNT_ID,
          listOptions: [
            { id: "1250617614", label: "PPV Request" },
            { id: "1250618083", label: "Custom Request" },
            { id: "1250618262", label: "Live Chat" }
          ]
        });
      });
  }, []);

  const prepared = useMemo(() => {
    return items.filter((it) => cardState[it.chatId]?.draftText?.trim()).length;
  }, [items, cardState]);

  async function loadUnread() {
    setError("");
    setLoading(true);
    try {
      const data = await api.unread(days);
      setItems(data);

      // Ensure state exists per chatId
      setCardState((prev) => {
        const next = { ...prev };
        for (const it of data) {
          if (!next[it.chatId]) next[it.chatId] = defaultCardState(meta);
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load unread messages.");
    } finally {
      setLoading(false);
    }
  }

  async function sendToAll() {
    setError("");
    setBulkStatus("working");

    // Gentle throttle 2 to 3 requests per second.
    // We send only cards that have a non-empty draftText.
    for (const it of items) {
      const st = cardState[it.chatId];
      if (!st?.draftText?.trim()) continue;

      setCardStatus((prev) => ({
        ...prev,
        [it.chatId]: { ...(prev[it.chatId] || { draft: "idle", listAdd: "idle", send: "idle" }), send: "working", listAdd: "working" }
      }));

      try {
        const listIds = Object.entries(st.selectedLists).filter(([, v]) => v).map(([k]) => k);
        const priceNum = st.price.trim() ? Number(st.price) : undefined;

        const resp = await api.send({
          chatId: it.chatId,
          text: st.draftText.trim(),
          price: priceNum,
          listIds,
          fanUserId: it.fanUserId
        });

        setCardStatus((prev) => {
          const prevCard = prev[it.chatId] || { draft: "idle", listAdd: "idle", send: "idle" };

          let listAdd: CardStatus["listAdd"] = "idle";
          if (resp.listAddResults) {
            const vals = Object.values(resp.listAddResults);
            if (vals.includes("failed")) listAdd = "warn";
            else if (vals.includes("added")) listAdd = "ok";
          }

          return {
            ...prev,
            [it.chatId]: {
              ...prevCard,
              listAdd,
              send: resp.status === "sent" ? "ok" : "err",
              message: resp.status === "sent" ? "" : resp.error || "Send failed"
            }
          };
        });
      } catch (e: any) {
        setCardStatus((prev) => ({
          ...prev,
          [it.chatId]: { ...(prev[it.chatId] || { draft: "idle", listAdd: "idle", send: "idle" }), send: "err", message: e?.message || "Send failed" }
        }));
      }

      await sleep(350);
    }

    setBulkStatus("done");
    await sleep(800);
    setBulkStatus("idle");
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>OnlyFans Unread Messages for {ACCOUNT_LABEL}</h1>
          <div className="muted">
            Account ID: <code>{ACCOUNT_ID}</code>
          </div>
        </div>
        <div className="header-actions">
          <div className="days">
            <label className="muted small">Days</label>
            <input className="input" value={days} onChange={(e) => setDays(Number(e.target.value || 10))} type="number" min={1} max={30} />
          </div>
          <Tooltip label="Fetches last 10 days of unread and loads 24 recent messages for context.">
            <button className="btn primary" onClick={loadUnread} disabled={loading}>
              {loading ? "Loading..." : "Get Unread Messages"}
            </button>
          </Tooltip>
          <Tooltip label="Sends all prepared replies, adds to selected lists first, and applies PPV prices if set.">
            <button className="btn" onClick={sendToAll} disabled={bulkStatus === "working" || prepared === 0}>
              {bulkStatus === "working" ? "Sending..." : `Send to All (${prepared})`}
            </button>
          </Tooltip>
        </div>
      </header>

      <main className="main">
        {error ? <div className="error">{error}</div> : null}
        {items.length === 0 && !loading ? (
          <div className="empty">
            <div className="empty-title">No unread messages loaded.</div>
            <div className="muted">Click "Get Unread Messages" to fetch unread chats from the last {days} days.</div>
          </div>
        ) : null}

        <div className="grid">
          {items.map((it) => (
            <MessageItem
              key={it.messageId}
              item={it}
              meta={meta ?? { accountId: ACCOUNT_ID, listOptions: [] }}
              state={cardState[it.chatId] ?? defaultCardState(meta)}
              setState={(next) => setCardState((prev) => ({ ...prev, [it.chatId]: next }))}
              onStatusChange={(chatId, s) => setCardStatus((prev) => ({ ...prev, [chatId]: s }))}
            />
          ))}
        </div>

        {items.length ? <div className="footer-note muted small">Bulk send is client-side throttled to respect rate limits.</div> : null}
      </main>
    </div>
  );
}
