import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  WORKER_NAME: z.string().default("perpl-echo-worker"),
  PERPL_API_BASE_URL: z.string().url().default("https://app.perpl.xyz"),
  PERPL_API_URL: z.string().url().optional(),
  PERPL_WS_URL: z.string().url().default("wss://app.perpl.xyz"),
  PERPL_CHAIN_ID: z.coerce.number().default(143),
  PERPL_FUNDING_INTERVAL_HOURS: z.coerce.number().positive().default(8),
  COLLECTOR_INTERVAL_MS: z.coerce.number().positive().default(300000),
  SNAPSHOT_COLLECTOR_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  MONAD_RPC_URL: z.string().default(""),
  PERPL_CONTRACT_ADDRESSES: z.string().default(""),
  ONCHAIN_INDEXER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ONCHAIN_START_BLOCK: z
    .string()
    .default("")
    .transform((value) => (value ? BigInt(value) : null)),
  ONCHAIN_POLL_INTERVAL_MS: z.coerce.number().positive().default(5000),
  BACKFILL_ON_START: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  BACKFILL_FORCE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  BACKFILL_DAYS: z.coerce.number().positive().default(30),
  BACKFILL_MIN_SNAPSHOTS: z.coerce.number().positive().default(100),
  RETENTION_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  RAW_SNAPSHOT_RETENTION_DAYS: z.coerce.number().positive().default(30),
  RAW_ONCHAIN_EVENT_RETENTION_DAYS: z.coerce.number().positive().default(7)
}).transform((value) => ({
  ...value,
  PERPL_API_URL: value.PERPL_API_URL ?? `${value.PERPL_API_BASE_URL.replace(/\/$/, "")}/api`
}));

export const env = envSchema.parse(process.env);
