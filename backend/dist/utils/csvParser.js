"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsv = void 0;
const parseCsv = async (buffer, userId, uploadId) => {
    // Very basic stub for CSV parsing
    // In reality, this would use a library like 'csv-parse' to read the buffer and map columns
    const content = buffer.toString('utf-8');
    const lines = content.split('\n');
    const workouts = [];
    // Mock logic assuming header: start_time,duration,type,distance
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line)
            continue;
        const parts = line.split(',');
        if (parts.length >= 3) {
            const start_time = parts[0];
            const duration_seconds = parseInt(parts[1], 10);
            const activity_type = parts[2].toLowerCase() === 'running' ? 'running' : 'other';
            const distance = parts[3] ? parseFloat(parts[3]) : 0;
            workouts.push({
                user_id: userId,
                activity_type,
                source: 'csv',
                source_file_ref: uploadId,
                start_time: new Date(start_time).toISOString(),
                duration_seconds: isNaN(duration_seconds) ? 3600 : duration_seconds,
                metrics: { distance },
                fingerprint: `${start_time}_${duration_seconds}_${uploadId}`,
                status: 'valid'
            });
        }
    }
    return workouts;
};
exports.parseCsv = parseCsv;
