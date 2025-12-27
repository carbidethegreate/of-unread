import type { DraftResponse, Meta, SendResponse, UnreadItem } from "./types";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: () => json<Meta>("/api/meta"),
  unread: (days = 10) => json<UnreadItem[]>(`/api/unread?days=${encodeURIComponent(days)}`),
  draft: (body: { chatId: string; fanName?: string; history: any[]; latestMessageText: string }) =>
    json<DraftResponse>("/api/draft", { method: "POST", body: JSON.stringify(body) }),
  send: (body: { chatId: string; text: string; price?: number; listIds?: (string | number)[]; fanUserId?: string }) =>
    json<SendResponse>("/api/send", { method: "POST", body: JSON.stringify(body) })
};
