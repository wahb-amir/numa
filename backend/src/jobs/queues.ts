import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const uploadQueue = new Queue("uploadQueue", {
  connection: redisConnection,
});
export const baselineQueue = new Queue("baselineQueue", {
  connection: redisConnection,
});
