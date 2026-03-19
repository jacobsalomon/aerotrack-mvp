// Transcript Highlighting Utility
// Takes plain transcript text and returns React nodes with
// measurements, part numbers, and serial numbers highlighted as colored pills.

import React from "react";

// Measurements: number + unit (e.g. "45 ft-lbs", "0.003 in", "2500 psi")
const MEASUREMENT_RE =
  /\b\d+(?:\.\d+)?\s*(?:ft-lbs|in-lbs|N-m|inches|inch|in|mm|mils?|psi|degF|degC|°F|°C|ohms?|rpm|lbs?|kg|cm|m\b)\b/gi;

// Part numbers: digit-dash-digit patterns, optionally preceded by P/N
const PART_NUMBER_RE =
  /(?:P\/N\s*)?(\d{3,}-\d{2,}(?:-\d+)?)\b/g;

// Serial numbers: S/N followed by alphanumeric-dash identifier
const SERIAL_NUMBER_RE =
  /S\/N\s*[A-Z0-9][\w-]*/gi;

// Blue pill for measurements, amber pill for part/serial numbers
const STYLES = {
  measurement:
    "inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200",
  id:
    "inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200",
};

interface Match {
  start: number;
  end: number;
  text: string;
  style: string;
}

function findMatches(text: string): Match[] {
  const matches: Match[] = [];

  function collect(re: RegExp, style: string) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], style });
    }
  }

  collect(SERIAL_NUMBER_RE, STYLES.id);
  collect(PART_NUMBER_RE, STYLES.id);
  collect(MEASUREMENT_RE, STYLES.measurement);

  // Sort by position, longest first at same position
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Remove overlaps — keep the first match at each position
  const filtered: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  return filtered;
}

/**
 * Takes plain transcript text and returns React nodes with highlighted entity spans.
 */
export function highlightTranscript(text: string): React.ReactNode[] {
  const matches = findMatches(text);
  if (matches.length === 0) return [text];

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) nodes.push(text.slice(cursor, match.start));
    nodes.push(
      <span key={`hl-${match.start}`} className={match.style}>
        {match.text}
      </span>
    );
    cursor = match.end;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
