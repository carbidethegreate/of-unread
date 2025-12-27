import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().default(3000),

  ONLYFANS_ACCOUNT_ID: z.string().min(1),
  ONLYFANS_API_KEY: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),

  // Optional extras (present in Render environment)
  OFAPI_BASE_URL: z.string().url().default("https://app.onlyfansapi.com"),
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
  LIST_ID: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(processEnv: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(processEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
