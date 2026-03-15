// Extract measurement readings from video frames using Gemini
// Analyzes video chunks for gauge readings, instrument displays,
// torque wrench positions, part numbers, and other visual measurements.

import { VIDEO_MODELS } from "./models";
import { callWithFallback, callGemini } from "./provider";

export interface VisualMeasurement {
  parameterName: string;
  measurementType: string;
  value: number;
  unit: string;
  confidence: number;
  rawExcerpt: string; // Description of what was seen
  timestampInChunk?: number; // Seconds into the video chunk
}

const MEASUREMENT_PROMPT = `Analyze this aerospace maintenance video for measurement readings.

Look for:
- Gauge readings (pressure gauges, torque indicators, dial indicators)
- Digital instrument displays (multimeters, temperature probes)
- Torque wrench click/position
- Micrometer, caliper, or other precision tool readings
- Part numbers and serial numbers on components
- Scale/weight readings
- Any other measurable values visible in the video

Return a JSON object with a "measurements" array. Each needs:
- parameterName: descriptive name (e.g., "Hydraulic pressure gauge")
- measurementType: one of: torque, dimension, pressure, temperature, clearance, runout, endplay, backlash, weight, rpm, resistance
- value: numeric reading
- unit: standardized unit (ft-lbs, in-lbs, N-m, inches, mm, mils, psi, degF, degC, ohms, rpm)
- confidence: 0-1 how certain of the reading
- rawExcerpt: brief description of what you saw (e.g., "Torque wrench showing 45 on the scale")
- timestampInChunk: approximate seconds into the video

Return {"measurements": []} if no readable measurements found.`;

// Extract measurements from a video chunk using Gemini's native video understanding
export async function extractMeasurementsFromVideo(
  videoUrl: string
): Promise<VisualMeasurement[]> {
  const result = await callWithFallback({
    models: VIDEO_MODELS,
    timeoutMs: 60000, // Video analysis can be slow
    taskName: "visual_measurement_extraction",
    execute: async (model) => {
      const response = await callGemini({
        model: model.id,
        contents: [
          {
            parts: [
              { text: MEASUREMENT_PROMPT },
              {
                fileData: {
                  mimeType: "video/mp4",
                  fileUri: videoUrl,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });

      const parsed = typeof response === "string" ? JSON.parse(response) : response;
      const measurements = Array.isArray(parsed) ? parsed : parsed.measurements || [];
      return measurements as VisualMeasurement[];
    },
  });

  return result.data;
}
