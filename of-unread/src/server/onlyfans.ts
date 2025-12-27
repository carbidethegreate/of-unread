import axios, { AxiosInstance } from "axios";
import { Env } from "./env.js";

type OfApiListResponse<T> = { data?: T; [k: string]: unknown };

export type OfChat = {
  id: string;
  unreadCount?: number;
  users?: Array<{ id: string; username?: string; name?: string }>;
  lastMessage?: { id: string; text?: string; createdAt?: string; created_at?: string };
};

export type OfMessage = {
  id: string;
  chatId?: string;
  fromUserId?: string;
  toUserId?: string;
  text?: string;
  price?: number;
  isRead?: boolean;
  createdAt?: string;
  created_at?: string;
};

export class OnlyFansClient {
  private http: AxiosInstance;

  constructor(private env: Env) {
    this.http = axios.create({
      baseURL: `${env.OFAPI_BASE_URL.replace(/\/$/, "")}/api`,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${env.ONLYFANS_API_KEY}`,
        "Content-Type": "application/json"
      }
    });
  }

  async listChats(params: Record<string, string | number | boolean | undefined>) {
    const res = await this.http.get<OfApiListResponse<OfChat[]>>(`/${this.env.ONLYFANS_ACCOUNT_ID}/chats`, { params });
    return res.data?.data ?? [];
  }

  async listChatMessages(chatId: string, params: Record<string, string | number | boolean | undefined>) {
    const res = await this.http.get<OfApiListResponse<OfMessage[]>>(`/${this.env.ONLYFANS_ACCOUNT_ID}/chats/${chatId}/messages`, { params });
    return res.data?.data ?? [];
  }

  async sendMessage(chatId: string, body: { text: string; price?: number }) {
    const res = await this.http.post(`/${this.env.ONLYFANS_ACCOUNT_ID}/chats/${chatId}/messages`, body);
    return res.data as any;
  }

  async listUserLists() {
    const res = await this.http.get(`/${this.env.ONLYFANS_ACCOUNT_ID}/user-lists`);
    return res.data as any;
  }

  async addUsersToList(listId: string | number, userIds: string[]) {
    const res = await this.http.post(`/${this.env.ONLYFANS_ACCOUNT_ID}/user-lists/${listId}/users`, { userIds });
    return res.data as any;
  }

  async startTyping(chatId: string) {
    const res = await this.http.post(`/${this.env.ONLYFANS_ACCOUNT_ID}/chats/${chatId}/typing`, {});
    return res.data as any;
  }
}
