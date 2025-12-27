import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { getPublicConfig, requireOnlyFansCreds, requireOpenAIApiKey } from "../config/env";
import { OnlyFansClient } from "../clients/onlyfans";
import { generateDraft } from "../clients/openai";
import { stripHtml } from "../utils/html";
import { asyncHandler, HttpError, isHttpError } from "../utils/http";
import { mapWithConcurrency } from "../utils/concurrency";

const allowedListIds = ["1250617614", "1250618083", "1250618262"] as const;

const SendBodySchema = z.object({
  chatId: z.string().min(1),
  text: z.string().min(1).max(5000),
  price: z.number().positive().optional(),
  listIds: z.array(z.union([z.string(), z.number()])).optional(),
  fanUserId: z.union([z.string(), z.number()]).optional(),
});

const DraftBodySchema = z.object({
  chatId: z.string().min(1),
  fanName: z.string().optional(),
  history: z
    .array(
      z.object({
        text: z.string(),
        sender: z.enum(["fan", "creator"]),
        timestamp: z.string(),
      })
    )
    .max(24),
  latestMessageText: z.string().min(1).max(5000),
});

function parseDays(input: unknown): number {
  const n = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.max(1, Math.min(30, n));
}

function toISODate(input: string | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeId(id: string | number | undefined): string {
  if (id === undefined || id === null) return "";
  return String(id);
}

function maybeNumberId(id: string | number): string | number {
  if (typeof id === "number") return id;
  const trimmed = id.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return trimmed;
}

type UnreadCard = {
  chatId: string;
  messageId: string;
  from: { id: string; name: string | undefined; username: string | undefined };
  text: string;
  timestamp: string;
  latest24Messages: { text: string; sender: "fan" | "creator"; timestamp: string }[];
};

// Small in-memory cache to reduce repeated API calls when users spam the button.
const unreadCache = new Map<string, { at: number; data: UnreadCard[] }>();
const UNREAD_CACHE_TTL_MS = 15_000;

function createRateLimitHandler(label: string, windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res, _next, options) {
      const rateLimit = (req as any).rateLimit as
        | { resetTime?: Date | undefined }
        | undefined;
      const retryMs = rateLimit?.resetTime
        ? Math.max(0, rateLimit.resetTime.getTime() - Date.now())
        : windowMs;
      const retryAfterSec = Math.max(1, Math.round(retryMs / 1000));

      res.status(options.statusCode).json({
        error: `Rate limit reached for ${label}. Please wait ${retryAfterSec}s before retrying.`,
        retryAfterSec,
      });
    },
  });
}

function preventOverlap(key: string) {
  const activeCounts = new Map<string, number>();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const current = activeCounts.get(key) ?? 0;
    if (current > 0) {
      res.status(429).json({
        error: "Another request for this action is already in progress. Please wait a moment and try again.",
        retryAfterSec: 1,
      });
      return;
    }

    activeCounts.set(key, current + 1);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      const updated = (activeCounts.get(key) ?? 1) - 1;
      if (updated <= 0) {
        activeCounts.delete(key);
      } else {
        activeCounts.set(key, updated);
      }
    };

    res.on("finish", cleanup);
    res.on("close", cleanup);

    next();
  };
}

export function apiRouter() {
  const router = express.Router();

  router.get(
    "/config",
    asyncHandler(async (req, res) => {
      res.json(getPublicConfig());
    })
  );

  // Basic API limiter for safety.
  router.use(createRateLimitHandler("global", 60_000, 180));

  router.get(
    "/unread",
    preventOverlap("unread"),
    asyncHandler(async (req, res) => {
      const days = parseDays(req.query.days);
      const cacheKey = `days:${days}`;
      const cached = unreadCache.get(cacheKey);
      if (cached && Date.now() - cached.at < UNREAD_CACHE_TTL_MS) {
        res.json(cached.data);
        return;
      }

      const { accountId, apiKey } = requireOnlyFansCreds();
      const client = new OnlyFansClient({ accountId, apiKey });

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      // Fetch chats (recent first) and stop once we hit chats with lastMessage older than cutoff.
      const limit = 50;
      let offset = 0;
      const maxPages = 10; // safety

      const candidateChats: Array<{
        chatId: string;
        fanId: string;
        fanName?: string;
        fanUsername?: string;
      }> = [];

      try {
        for (let page = 0; page < maxPages; page++) {
          const chats = await client.listChats({
            limit,
            offset,
            filter: "unread",
            order: "recent",
            skipUsers: "none",
          });

          if (chats.length === 0) break;

          let shouldStop = false;

          for (const chat of chats) {
            const unreadCountRaw = chat.unreadMessagesCount ?? (chat as any).unreadCount ?? 0;
            const unreadCount =
              typeof unreadCountRaw === "string" ? Number.parseInt(unreadCountRaw, 10) : unreadCountRaw;

            const fan = chat.fan;
            if (!fan) continue;

            const chatId = normalizeId(fan.id);
            const lastAtStr = chat.lastMessage?.createdAt;
            const lastAt = lastAtStr ? new Date(lastAtStr).getTime() : NaN;

            if (!Number.isNaN(lastAt) && lastAt < cutoff) {
              shouldStop = true;
              break;
            }

            if (unreadCount && unreadCount > 0) {
              candidateChats.push({
                chatId,
                fanId: chatId,
                fanName: fan.name,
                fanUsername: fan.username,
              });
            }
          }

          if (shouldStop) break;

          offset += limit;
          if (chats.length < limit) break;

          // Avoid unbounded growth.
          if (candidateChats.length > 75) break;
        }
      } catch (err: any) {
        if (isHttpError(err)) throw err;
        throw new HttpError(502, "OnlyFans API request failed", true);
      }

      // Fetch message histories for each candidate chat.
      const results: Array<UnreadCard | null> = await mapWithConcurrency(candidateChats, 3, async (chat) => {
        try {
          const messages = await client.listChatMessages({
            chatId: chat.chatId,
            limit: 24,
            order: "desc",
            skipUsers: "all",
          });

          // Convert to oldest -> newest.
          const chronological = [...messages]
            .filter((m) => m && m.createdAt)
            .sort((a, b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return ta - tb;
            });

          const history = chronological.map((m) => {
            const fromId = m.fromUser?.id;
            const sender: "fan" | "creator" = normalizeId(fromId) === chat.fanId ? "fan" : "creator";
            return {
              text: stripHtml(m.text),
              sender,
              timestamp: toISODate(m.createdAt) ?? "",
            };
          });

          // Find unread messages from the fan within the window.
          const unreadFanMessages = messages
            .filter((m) => {
              const fromId = normalizeId(m.fromUser?.id);
              const createdAt = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
              const isUnread = m.isOpened === false || m.isNew === true;
              return fromId === chat.fanId && isUnread && !Number.isNaN(createdAt) && createdAt >= cutoff;
            })
            .sort((a, b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return ta - tb;
            });

          const target = unreadFanMessages.at(-1);
          if (!target) return null;

          const timestamp = toISODate(target.createdAt) ?? new Date().toISOString();

          return {
            chatId: chat.chatId,
            messageId: normalizeId(target.id) || "",
            from: {
              id: chat.fanId,
              name: chat.fanName,
              username: chat.fanUsername,
            },
            text: stripHtml(target.text),
            timestamp,
            latest24Messages: history,
          } satisfies UnreadCard;
        } catch {
          return null;
        }
      });

      const data = results.filter((x): x is UnreadCard => x !== null);

      // Sort newest first.
      data.sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        return tb - ta;
      });

      unreadCache.set(cacheKey, { at: Date.now(), data });
      res.json(data);
    })
  );

  router.post(
    "/draft",
    preventOverlap("draft"),
    createRateLimitHandler("draft", 60_000, 30),
    asyncHandler(async (req, res) => {
      const parsed = DraftBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }

      const { apiKey } = requireOpenAIApiKey();

      try {
        const draftText = await generateDraft({
          apiKey,
          fanName: parsed.data.fanName,
          history: parsed.data.history,
          latestMessageText: parsed.data.latestMessageText,
        });

        res.json({ draftText });
      } catch (err: any) {
        throw new HttpError(502, "OpenAI request failed", true);
      }
    })
  );

  router.post(
    "/send",
    preventOverlap("send"),
    createRateLimitHandler("send", 60_000, 60),
    asyncHandler(async (req, res) => {
      const parsed = SendBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ status: "failed", error: "Invalid request" });
        return;
      }

      // PPV validation: this MVP does not implement media uploads. OnlyFansAPI docs indicate
      // mediaFiles are required when price is not 0.
      if (parsed.data.price !== undefined && parsed.data.price > 0) {
        res.status(400).json({
          status: "failed",
          error:
            "Paid messages require media attachments via mediaFiles. This MVP does not support media uploads yet. Leave PPV Price blank for free messages.",
        });
        return;
      }

      const { accountId, apiKey } = requireOnlyFansCreds();
      const client = new OnlyFansClient({ accountId, apiKey });

      const listAddResults: Record<string, "added" | "failed" | "skipped"> = {};

      const listIdsRaw = parsed.data.listIds ?? [];
      const listIds = listIdsRaw.map((id) => String(id)).filter((id) => allowedListIds.includes(id as any));

      const fanUserId = parsed.data.fanUserId;
      if (listIds.length > 0 && fanUserId !== undefined) {
        for (const listId of listIds) {
          try {
            await client.addUsersToUserList({ userListId: listId, ids: [maybeNumberId(fanUserId)] });
            listAddResults[listId] = "added";
          } catch {
            listAddResults[listId] = "failed";
          }
        }
      } else if (listIds.length > 0) {
        for (const listId of listIds) listAddResults[listId] = "skipped";
      }

      await client.startTyping(parsed.data.chatId);

      try {
        const out = await client.sendMessage({ chatId: parsed.data.chatId, text: parsed.data.text });
        res.json({
          status: "sent",
          messageId: out.messageId,
          listAddResults,
        });
      } catch {
        res.status(502).json({
          status: "failed",
          error: "Failed to send message",
          listAddResults,
        });
      }
    })
  );

  return router;
}
