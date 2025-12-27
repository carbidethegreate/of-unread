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

export type ListAddResults = Record<string, "added" | "failed" | "skipped">;

export type SendResult = {
  status: "sent" | "failed";
  messageId?: string;
  listAddResults?: ListAddResults;
  error?: string;
};
