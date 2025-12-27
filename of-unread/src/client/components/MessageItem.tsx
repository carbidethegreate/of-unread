import React, { useMemo, useState } from "react";
import type { Meta, SendResponse, UnreadItem } from "../lib/types";
import Tooltip from "./Tooltip";
import HistoryPanel from "./HistoryPanel";
import { StatusPill } from "./StatusPill";
import { api } from "../lib/api";

export type CardStatus = {
  draft: "idle" | "working" | "ok" | "err";
  listAdd: "idle" | "working" | "ok" | "warn" | "err";
  send: "idle" | "working" | "ok" | "err";
  message?: string;
};

type CardState = {
  draftText: string;
  price: string;
  selectedLists: Record<string, boolean>;
};

type Props = {
  item: UnreadItem;
  meta: Meta;
  state: CardState;
  setState: (next: CardState) => void;
  onStatusChange?: (chatId: string, s: CardStatus) => void;
};

export default function MessageItem({ item, meta, state, setState, onStatusChange }: Props) {
  const fanLabel = item.from?.name || item.from?.username || item.from?.id || "Fan";
  const [openHistory, setOpenHistory] = useState(false);
  const [status, setStatus] = useState<CardStatus>({ draft: "idle", listAdd: "idle", send: "idle" });

  const listIds = useMemo(
    () => Object.entries(state.selectedLists).filter(([, v]) => v).map(([k]) => k),
    [state.selectedLists]
  );

  function patch(s: Partial<CardStatus>) {
    const next = { ...status, ...s };
    setStatus(next);
    onStatusChange?.(item.chatId, next);
  }

  const canSend = state.draftText.trim().length > 0;

  async function onDraft() {
    patch({ draft: "working", message: "" });
    try {
      const resp = await api.draft({
        chatId: item.chatId,
        fanName: fanLabel,
        history: item.latest24Messages,
        latestMessageText: item.text
      });
      setState({ ...state, draftText: resp.draftText });
      patch({ draft: "ok" });
    } catch (e: any) {
      patch({ draft: "err", message: e?.message || "Draft failed" });
    }
  }

  async function onSend() {
    if (!canSend) return;
    patch({ send: "working", listAdd: listIds.length ? "working" : "idle", message: "" });
    try {
      const priceNum = state.price.trim() ? Number(state.price) : undefined;
      const resp: SendResponse = await api.send({
        chatId: item.chatId,
        text: state.draftText.trim(),
        price: priceNum,
        listIds,
        fanUserId: item.fanUserId
      });

      if (resp.listAddResults) {
        const vals = Object.values(resp.listAddResults);
        if (vals.includes("failed")) patch({ listAdd: "warn" });
        else if (vals.includes("added")) patch({ listAdd: "ok" });
        else patch({ listAdd: "idle" });
      } else {
        patch({ listAdd: "idle" });
      }

      if (resp.status === "sent") patch({ send: "ok" });
      else patch({ send: "err", message: resp.error || "Send failed" });
    } catch (e: any) {
      patch({ send: "err", message: e?.message || "Send failed" });
    }
  }

  return (
    <div className="card">
      <div className="card-top">
        <div>
          <div className="title">{fanLabel}</div>
          <div className="sub">
            <span>Chat:</span> <code>{item.chatId}</code>
            <span className="dot">•</span>
            <span>{item.timestamp || "timestamp unavailable"}</span>
          </div>
        </div>

        <div className="status-row">
          <Tooltip label="Draft status">
            <span>
              <StatusPill
                kind={status.draft === "ok" ? "ok" : status.draft === "err" ? "err" : status.draft === "working" ? "work" : "idle"}
                text={`Draft: ${status.draft}`}
              />
            </span>
          </Tooltip>
          <Tooltip label="User-list additions happen before sending. Failures do not block sending.">
            <span>
              <StatusPill
                kind={
                  status.listAdd === "ok" ? "ok" : status.listAdd === "warn" ? "warn" : status.listAdd === "err" ? "err" : status.listAdd === "working" ? "work" : "idle"
                }
                text={`Lists: ${status.listAdd}`}
              />
            </span>
          </Tooltip>
          <Tooltip label="Send status for this reply.">
            <span>
              <StatusPill
                kind={status.send === "ok" ? "ok" : status.send === "err" ? "err" : status.send === "working" ? "work" : "idle"}
                text={`Send: ${status.send}`}
              />
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="msg">
        <div className="msg-label">Unread message</div>
        <div className="msg-text">{item.text || <span className="muted">(empty)</span>}</div>
      </div>

      {status.message ? <div className="error">{status.message}</div> : null}

      <div className="row">
        <button className="btn secondary" onClick={() => setOpenHistory((v) => !v)}>
          {openHistory ? "Hide" : "Show"} recent history (24)
        </button>

        <Tooltip label="Sends anonymized context to OpenAI 4o to propose a reply in Parker’s voice.">
          <button className="btn" onClick={onDraft} disabled={status.draft === "working"}>
            Request Draft Reply
          </button>
        </Tooltip>

        <Tooltip label="Send this prepared reply, add to selected lists first, and apply PPV price if set.">
          <button className="btn primary" disabled={!canSend || status.send === "working"} onClick={onSend}>
            Send
          </button>
        </Tooltip>
      </div>

      {openHistory ? <HistoryPanel history={item.latest24Messages} /> : null}

      <div className="compose">
        <label className="label">Draft reply</label>
        <textarea
          className="textarea"
          value={state.draftText}
          placeholder="Click Request Draft Reply, then edit here..."
          onChange={(e) => setState({ ...state, draftText: e.target.value })}
          rows={5}
        />
        <div className="compose-bottom">
          <div className="lists">
            <div className="label-inline">
              <Tooltip label="Adds this fan to selected follow-up lists.">
                <span>User-lists</span>
              </Tooltip>
            </div>
            <div className="checkboxes">
              {meta.listOptions.map((opt) => (
                <label key={opt.id} className="chk">
                  <input
                    type="checkbox"
                    checked={!!state.selectedLists[opt.id]}
                    onChange={(e) => setState({ ...state, selectedLists: { ...state.selectedLists, [opt.id]: e.target.checked } })}
                  />
                  <span>{opt.label}</span>
                  <span className="muted small">({opt.id})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="ppv">
            <Tooltip label="Charge to unlock this message on OnlyFans. Leave blank for free. Note: media may be required by OF for paid messages.">
              <label className="label-inline">PPV Price (USD)</label>
            </Tooltip>
            <input
              className="input"
              inputMode="decimal"
              placeholder="blank = free"
              value={state.price}
              onChange={(e) => setState({ ...state, price: e.target.value })}
            />
            <div className="muted small">If paid messages require media on your account, sending will be blocked.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { CardState };
