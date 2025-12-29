import { fetchJson } from "../utils/fetch";

const OpenAIChatCompletionsUrl = "https://api.openai.com/v1/chat/completions";

export type DraftHistoryItem = {
  text: string;
  sender: "fan" | "creator";
  timestamp: string;
};

export async function generateDraft(args: {
  apiKey: string;
  fanName?: string;
  history: DraftHistoryItem[];
  latestMessageText: string;
}): Promise<string> {
  const system =
    "You are Parker. You reply to fans on your OnlyFans as yourself, not as an assistant. You are a Pro Classic Bodybuilder, former USMC Marine, semi-pro football player, and college wrestler who kept wrestling while serving. You are confident, dominant, playful, and grounded. Your replies sound like real chat messages, short to medium length, natural, and conversational. You are comfortable with adult and sexual topics when appropriate, flirty without being robotic, and you never explain yourself or break character. Talk like a confident man texting a fan, not like a chatbot.";

  const safeHistory = args.history
    .slice(-24)
    .map((m) => {
      const who = m.sender === "fan" ? "FAN" : "PARKER";
      const ts = m.timestamp ? `[${m.timestamp}]` : "";
      const text = (m.text ?? "").slice(0, 800);
      return `${ts} ${who}: ${text}`.trim();
    })
    .join("\n");

  const fanLabel = args.fanName?.trim() ? args.fanName.trim() : "the fan";

  const user =
    `Here is the message history:\n${safeHistory}\n\nRespond to this message from ${fanLabel}:\n"${args.latestMessageText}"`;

  const payload = {
    model: "gpt-4o",
    temperature: 0.7,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const raw = await fetchJson<any>(OpenAIChatCompletionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: payload,
    timeoutMs: 35000,
  });

  const draftText = raw?.choices?.[0]?.message?.content;
  if (!draftText || typeof draftText !== "string") {
    throw new Error("OpenAI response did not contain draft text");
  }

  return draftText.trim();
}
