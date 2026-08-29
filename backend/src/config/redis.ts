import { Redis } from "ioredis";
import { env } from "./env";

export const redisConnection = new Redis({
  host: env.REDIS_HOST,
  port: Number(env.REDIS_PORT),
  family: 4,

  username: "app",
  password: env.REDIS_PASSWORD || undefined,

  maxRetriesPerRequest: null,

  tls: {
    rejectUnauthorized: false,
    servername: env.REDIS_HOST,
  },
});