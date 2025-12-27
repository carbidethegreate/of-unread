import { z } from "zod";
import { HttpError } from "../utils/http";

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.string().optional(),

  ONLYFANS_ACCOUNT_ID: z.string().optional(),
  ONLYFANS_API_KEY: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),

  // Other environment variables are allowed but not required by this app.
  CF_IMAGES_ACCOUNT_HASH: z.string().optional(),
  CF_IMAGES_ACCOUNT_ID: z.string().optional(),
  CF_IMAGES_TOKEN: z.string().optional(),
  Cloudflare_Global_API_Key: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_OLD: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_PORT: z.string().optional(),
  DB_USER: z.string().optional(),
  GITHUB_API_KEY: z.string().optional(),
  LIST_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new HttpError(500, "Environment validation failed", true);
  }
  return parsed.data;
}

export function getPublicConfig() {
  const env = getEnv();
  return {
    accountName: "Parker Martin",
    accountId: env.ONLYFANS_ACCOUNT_ID ?? "acct_6c513bcfe14346399f6bf0f5a0bffafb",
    missing: {
      onlyfans: !env.ONLYFANS_ACCOUNT_ID || !env.ONLYFANS_API_KEY,
      openai: !env.OPENAI_API_KEY,
    },
  };
}

export function requireOnlyFansCreds() {
  const env = getEnv();
  if (!env.ONLYFANS_ACCOUNT_ID) {
    throw new HttpError(500, "Missing ONLYFANS_ACCOUNT_ID", true);
  }
  if (!env.ONLYFANS_API_KEY) {
    throw new HttpError(500, "Missing ONLYFANS_API_KEY", true);
  }
  return {
    accountId: env.ONLYFANS_ACCOUNT_ID,
    apiKey: env.ONLYFANS_API_KEY,
  };
}

export function requireOpenAIApiKey() {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new HttpError(500, "Missing OPENAI_API_KEY", true);
  }
  return {
    apiKey: env.OPENAI_API_KEY,
  };
}
