export type Sender = "fan" | "creator";

export type UiMessage = {
  text: string;
  sender: Sender;
  timestamp: string;
};

export type UnreadItem = {
  chatId: string;
  messageId: string;
  fanUserId?: string;
  from: { id?: string; name?: string; username?: string };
  text: string;
  timestamp: string;
  latest24Messages: UiMessage[];
};

export type Meta = {
  accountId: string;
  listOptions: Array<{ id: string; label: string }>;
};

export type DraftResponse = { draftText: string };

export type SendResponse = {
  status: "sent" | "failed";
  messageId?: string;
  listAddResults?: Record<string, "added" | "failed" | "skipped">;
  error?: string;
};
