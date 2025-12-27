import axios from "axios";
import { Env } from "./env.js";

export async function createDraft(env: Env, prompt: { fanName?: string; historyText: string; latestMessageText: string }): Promise<string> {
  const system =
    "You are helping Parker, a Pro Classic Bodybuilder, former USMC Marine, semi pro football player, and college wrestler who continued wrestling while serving, and who is famous on social media, respond to his adult fans’ chat messages. Respond in a natural, concise, masculine, and confident tone while staying in character.";
  const user = `Here is the message history: ${prompt.historyText}

Respond to this message from ${prompt.fanName || "the fan"}:
${prompt.latestMessageText}`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 30_000
    }
  );

  const content = res.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned an empty draft.");
  }
  return content.trim();
}
