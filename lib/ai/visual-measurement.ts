// Extract measurement readings from video frames using Gemini
// Analyzes video chunks for gauge readings, instrument displays,
// torque wrench positions, part numbers, and other visual measurements.
//
// Layer 3: Accepts optional InspectionTemplate context so the AI can match
// visible gauge readings to specific CMM inspection items.

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
  // Layer 3: Semantic identifiers for matching to InspectionTemplate items
  calloutNumber?: string;
  sectionName?: string;
  matchConfidence?: number;
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

// Layer 3: Additional prompt when InspectionTemplate context is provided
const INSPECTION_TEMPLATE_SUFFIX = `

CMM INSPECTION TEMPLATE MATCHING: The template items listed below show what measurements
this inspection expects. For each measurement you extract from the video, also return:
- calloutNumber: the template callout number if you can match the reading to a specific item
- sectionName: the section name from the template
- matchConfidence: 0-1 how confident you are in the template match
Do NOT return database IDs — only human-readable identifiers from the template.
When the match is ambiguous, set calloutNumber and sectionName to null.`;

// Extract measurements from a video chunk using Gemini's native video understanding.
// Layer 3: Pass optional templateContext (from getExtractionContext) to improve matching.
export async function extractMeasurementsFromVideo(
  videoUrl: string,
  templateContext?: string
): Promise<VisualMeasurement[]> {
  // Build the prompt, optionally appending template context
  let prompt = MEASUREMENT_PROMPT;
  if (templateContext) {
    prompt += INSPECTION_TEMPLATE_SUFFIX + "\n\n" + templateContext;
  }

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
              { text: prompt },
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
