# CMM Extraction Eval Pipeline

## Overview

This directory contains the evaluation infrastructure for improving AI extraction quality over time. Based on Karpathy's autoresearch pattern, adapted for prompt engineering instead of model training.

## Files

- `golden-set.jsonl` — Ground truth corrections. Each line is a known extraction error with the correct output. Grows every time a human corrects an extraction in the review UI.
- `results.tsv` — (Phase 2) Experiment log tracking prompt variants and their scores.
- `program.md` — (Phase 2) Instructions for the AI agent running the prompt optimization loop.

## How It Works

### Phase 1: Data Collection (Current)
Human corrections from the review UI are saved to `InspectionItem.humanCorrection` (JSON field). This stores the original AI output alongside the human-corrected version, building a structured eval dataset automatically.

### Phase 2: Eval Script (After ~50 corrections)
`scripts/eval-cmm-prompts.ts` will re-extract test pages with different prompt variants and score against the golden set. Metrics: precision, recall, field-level accuracy.

### Phase 3: Autoresearch Loop (After ~50 corrections)
An AI agent modifies prompts, runs eval, keeps improvements, discards regressions. Each experiment takes ~2-5 min. Can run overnight.

## JSONL Format

Each line in `golden-set.jsonl`:
```json
{
  "id": "correction-001",
  "templateId": "cmn148shq...",
  "figureNumber": "826",
  "pageIndex": 72,
  "pageType": "electrical_test_form",
  "difficulty": "hard",
  "description": "Missing EAR table row",
  "correctionType": "missing_item | wrong_value | wrong_type | wrong_unit | spurious_item",
  "expectedItems": [...],
  "aiMissed": true,
  "notes": "What went wrong and why"
}
```

## Adding Corrections

Corrections are added two ways:
1. **Automatically** — when a user edits an item in the review UI, the original/corrected pair is saved to `humanCorrection`
2. **Manually** — append a line to `golden-set.jsonl` for cases found outside the UI
