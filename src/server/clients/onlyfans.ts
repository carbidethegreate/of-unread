import { z } from "zod";
import { fetchJson } from "../utils/fetch";

const OnlyFansApiBase = "https://app.onlyfansapi.com";

const ChatSchema = z
  .object({
    unreadMessagesCount: z.union([z.number(), z.string()]).optional(),
    unreadCount: z.union([z.number(), z.string()]).optional(),
    lastMessage: z
      .object({
        id: z.union([z.number(), z.string()]).optional(),
        text: z.string().optional(),
        createdAt: z.string().optional(),
      })
      .optional(),
    fan: z
      .object({
        id: z.union([z.number(), z.string()]),
        name: z.string().optional(),
        username: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export type OnlyFansChat = z.infer<typeof ChatSchema>;

const ChatsResponseSchema = z.object({ data: z.array(ChatSchema) }).passthrough();

const MessageSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    text: z.string().optional(),
    createdAt: z.string().optional(),
    isOpened: z.boolean().optional(),
    isNew: z.boolean().optional(),
    fromUser: z
      .object({
        id: z.union([z.number(), z.string()]),
      })
      .optional(),
  })
  .passthrough();

export type OnlyFansMessage = z.infer<typeof MessageSchema>;

const MessagesResponseSchema = z
  .object({
    data: z.object({ list: z.array(MessageSchema) }).or(z.array(MessageSchema)),
  })
  .passthrough();

export class OnlyFansClient {
  private accountId: string;
  private apiKey: string;

  constructor(args: { accountId: string; apiKey: string }) {
    this.accountId = args.accountId;
    this.apiKey = args.apiKey;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async listChats(args: {
    limit: number;
    offset: number;
    filter?: "unread" | "pinned" | "priority" | "with_tips" | "unread_with_tips";
    order?: "recent" | "old";
    skipUsers?: "all" | "none";
    query?: string;
  }): Promise<OnlyFansChat[]> {
    const params = new URLSearchParams();
    params.set("limit", String(args.limit));
    params.set("offset", String(args.offset));
    if (args.filter) params.set("filter", args.filter);
    if (args.order) params.set("order", args.order);
    if (args.skipUsers) params.set("skip_users", args.skipUsers);
    if (args.query) params.set("query", args.query);

    const url = `${OnlyFansApiBase}/api/${encodeURIComponent(this.accountId)}/chats?${params.toString()}`;
    const raw = await fetchJson<unknown>(url, { headers: this.headers(), timeoutMs: 20000 });

    const parsed = ChatsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return [];
    }
    return parsed.data.data;
  }

  async listChatMessages(args: {
    chatId: string;
    limit: number;
    order?: "asc" | "desc";
    skipUsers?: "all" | "none";
  }): Promise<OnlyFansMessage[]> {
    const params = new URLSearchParams();
    params.set("limit", String(args.limit));
    if (args.order) params.set("order", args.order);
    if (args.skipUsers) params.set("skip_users", args.skipUsers);

    const url = `${OnlyFansApiBase}/api/${encodeURIComponent(this.accountId)}/chats/${encodeURIComponent(args.chatId)}/messages?${params.toString()}`;
    const raw = await fetchJson<unknown>(url, { headers: this.headers(), timeoutMs: 20000 });

    const parsed = MessagesResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return [];
    }

    // The docs show `data.list`, but some responses may return `data: []`.
    const data: any = (parsed.data as any).data;
    const list: unknown = Array.isArray(data) ? data : data?.list;
    const listParsed = z.array(MessageSchema).safeParse(list);
    return listParsed.success ? listParsed.data : [];
  }

  async startTyping(chatId: string): Promise<void> {
    const url = `${OnlyFansApiBase}/api/${encodeURIComponent(this.accountId)}/chats/${encodeURIComponent(chatId)}/typing`;
    await fetchJson<unknown>(url, { method: "POST", headers: this.headers(), timeoutMs: 15000, body: {} }).catch(
      () => undefined
    );
  }

  async sendMessage(args: { chatId: string; text: string }): Promise<{ messageId?: string }>
  {
    const url = `${OnlyFansApiBase}/api/${encodeURIComponent(this.accountId)}/chats/${encodeURIComponent(args.chatId)}/messages`;
    const raw = await fetchJson<any>(url, {
      method: "POST",
      headers: this.headers(),
      body: { text: args.text },
      timeoutMs: 25000,
    });

    const messageId = raw?.data?.id ?? raw?.id;
    return {
      messageId: messageId !== undefined ? String(messageId) : undefined,
    };
  }

  async addUsersToUserList(args: { userListId: string; ids: Array<string | number> }): Promise<void> {
    const url = `${OnlyFansApiBase}/api/${encodeURIComponent(this.accountId)}/user-lists/${encodeURIComponent(
      args.userListId
    )}/users`;

    // Docs specify `ids` array.
    await fetchJson<unknown>(url, {
      method: "POST",
      headers: this.headers(),
      body: { ids: args.ids },
      timeoutMs: 20000,
    });
  }
}
