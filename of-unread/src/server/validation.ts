import { z } from "zod";

export const DraftSchema = z.object({
  chatId: z.string().min(1),
  fanName: z.string().optional(),
  history: z.array(
    z.object({
      text: z.string().default(""),
      sender: z.enum(["fan", "creator"]),
      timestamp: z.string().default("")
    })
  ),
  latestMessageText: z.string().min(1)
});

export const SendSchema = z.object({
  chatId: z.string().min(1),
  text: z.string().min(1),
  price: z.number().optional(),
  listIds: z.array(z.union([z.string(), z.number()])).optional(),
  fanUserId: z.string().optional()
});

export const UnreadQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(10)
});
