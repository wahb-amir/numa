"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baselineQueue = exports.uploadQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
exports.uploadQueue = new bullmq_1.Queue('uploadQueue', { connection: redis_1.redisConnection });
exports.baselineQueue = new bullmq_1.Queue('baselineQueue', { connection: redis_1.redisConnection });
