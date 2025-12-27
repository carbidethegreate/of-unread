import { Router } from "express";
import { OnlyFansClient } from "./onlyfans.js";
import { createDraft } from "./openai.js";
import { DraftSchema, SendSchema, UnreadQuerySchema } from "./validation.js";
import { toIsoDaysAgo, safeNumber, sleep } from "./utils.js";
import type { UnreadItem, UiMessage, ListAddResults, SendResult } from "./types.js";

const LIST_OPTIONS = [
  { id: "1250617614", label: "PPV Request" },
  { id: "1250618083", label: "Custom Request" },
  { id: "1250618262", label: "Live Chat" }
];

export function buildRoutes(of: OnlyFansClient, env: any) {
  const r = Router();

  r.get("/meta", (_req, res) => {
    res.json({
      accountId: env.ONLYFANS_ACCOUNT_ID,
      listOptions: LIST_OPTIONS
    });
  });

  r.get("/unread", async (req, res, next) => {
    try {
      const q = UnreadQuerySchema.parse(req.query);
      const since = toIsoDaysAgo(q.days);

      // List chats with unread=true. Some accounts may require paging; we keep it conservative.
      const chats = await of.listChats({ unread: true, limit: 50 });

      const items: UnreadItem[] = [];

      for (const chat of chats) {
        const chatId = chat.id;
        if (!chatId) continue;

        const users = chat.users ?? [];
        const fan = users[0];
        const fanUserId = fan?.id;

        const msgs = await of.listChatMessages(chatId, { limit: 24, direction: "desc" });

        // Normalize and sort oldest -> newest for UI
        const normalized: UiMessage[] = msgs
          .map((m) => ({
            text: m.text ?? "",
            sender: m.fromUserId && fanUserId && m.fromUserId === fanUserId ? "fan" : "creator",
            timestamp: (m.createdAt ?? m.created_at ?? "") as string
          }))
          .filter((m) => m.text || m.timestamp)
          .reverse();

        // Identify the latest unread fan message within the window if possible.
        // Not all API responses include isRead/createdAt. We do best-effort.
        const latestUnread = msgs.find((m) => {
          const ts = (m.createdAt ?? m.created_at) as string | undefined;
          const isUnread = m.isRead === false;
          const fromFan = fanUserId ? m.fromUserId === fanUserId : true;
          const inWindow = ts ? ts >= since : true;
          return fromFan && inWindow && isUnread;
        }) ?? msgs.find((m) => {
          const ts = (m.createdAt ?? m.created_at) as string | undefined;
          const fromFan = fanUserId ? m.fromUserId === fanUserId : true;
          const inWindow = ts ? ts >= since : true;
          return fromFan && inWindow;
        });

        if (!latestUnread) continue;

        items.push({
          chatId,
          messageId: latestUnread.id,
          fanUserId,
          from: { id: fanUserId, name: fan?.name, username: fan?.username },
          text: latestUnread.text ?? "",
          timestamp: (latestUnread.createdAt ?? latestUnread.created_at ?? "") as string,
          latest24Messages: normalized
        });
      }

      res.json(items);
    } catch (err) {
      next(err);
    }
  });

  r.post("/draft", async (req, res, next) => {
    try {
      const body = DraftSchema.parse(req.body);
      const historyText = body.history
        .slice(-24)
        .map((m) => `[${m.sender}] ${m.text}`)
        .join("\n");

      const draftText = await createDraft(env, {
        fanName: body.fanName,
        historyText,
        latestMessageText: body.latestMessageText
      });

      res.json({ draftText });
    } catch (err) {
      next(err);
    }
  });

  r.post("/send", async (req, res, next) => {
    try {
      const body = SendSchema.parse(req.body);

      const listAddResults: ListAddResults = {};
      const listIds = body.listIds ?? [];
      const fanUserId = body.fanUserId;

      // Add to lists first (best-effort)
      if (listIds.length && fanUserId) {
        for (const listIdRaw of listIds) {
          const listId = String(listIdRaw);
          try {
            await of.addUsersToList(listId, [fanUserId]);
            listAddResults[listId] = "added";
          } catch {
            listAddResults[listId] = "failed";
          }
        }
      } else if (listIds.length && !fanUserId) {
        for (const listIdRaw of listIds) listAddResults[String(listIdRaw)] = "skipped";
      }

      const price = safeNumber(body.price);

      // PPV media validation: we do not implement media upload in this build.
      // If the API requires media for paid messages, block here. (If your account supports text-only paid, remove this.)
      if (price !== undefined && price > 0) {
        return res.status(400).json({
          status: "failed",
          listAddResults,
          error: "Paid (PPV) messages may require media. Media upload is not implemented in this build. Leave PPV Price blank to send a free message."
        } satisfies SendResult);
      }

      // Nice-to-have typing indicator, ignore errors
      try { await of.startTyping(body.chatId); } catch {}

      const sent = await of.sendMessage(body.chatId, price ? { text: body.text, price } : { text: body.text });

      const messageId = typeof sent?.id === "string" ? sent.id : undefined;

      res.json({
        status: "sent",
        messageId,
        listAddResults
      } satisfies SendResult);
    } catch (err) {
      next(err);
    }
  });

  r.post("/batchSend", async (req, res, next) => {
    // Optional helper endpoint if you later want server-side throttling.
    // Not used by the UI right now.
    try {
      const payload = Array.isArray(req.body) ? req.body : [];
      const results: SendResult[] = [];
      for (const item of payload) {
        try {
          const parsed = SendSchema.parse(item);
          const r0 = await of.sendMessage(parsed.chatId, { text: parsed.text });
          results.push({ status: "sent", messageId: typeof r0?.id === "string" ? r0.id : undefined });
        } catch (e: any) {
          results.push({ status: "failed", error: e?.message || "Failed" });
        }
        await sleep(350);
      }
      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  return r;
}
