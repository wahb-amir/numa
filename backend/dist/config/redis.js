"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = void 0;
const ioredis_1 = require("ioredis");
const env_1 = require("./env");
exports.redisConnection = new ioredis_1.Redis({
    host: env_1.env.REDIS_HOST,
    port: Number(env_1.env.REDIS_PORT),
    family: 4,
    username: "app",
    password: env_1.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    tls: {
        rejectUnauthorized: false,
        servername: env_1.env.REDIS_HOST,
    },
});
