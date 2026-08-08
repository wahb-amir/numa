"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGpx = void 0;
const parseGpx = async (buffer, userId, uploadId) => {
    // Very basic stub for GPX parsing
    // In reality, this would use a library like 'xmldom' or 'gpxparser'
    const content = buffer.toString("utf-8");
    // Fake parsing result for now
    const workouts = [];
    if (content.includes("<gpx")) {
        workouts.push({
            user_id: userId,
            activity_type: "running", // fallback default
            source: "gpx",
            source_file_ref: uploadId,
            start_time: new Date().toISOString(),
            duration_seconds: 3600,
            metrics: { notes: "Parsed from GPX" },
            fingerprint: `gpx_${Date.now()}_${uploadId}`,
            status: "valid",
        });
    }
    return workouts;
};
exports.parseGpx = parseGpx;
