# CMM Extraction Validation Results

**Date:** 2026-03-20
**Sample PDF:** ~/Downloads/Inspection Sheets.pdf (73 pages, 23.9 MB)
**CMM:** Collins Aerospace IDG — P/N 739515, 745329, 755359, 766088

## Pass 1: Page Classification

**Model:** Gemini 2.5 Flash
**Result:** PASS

| Type | Count | Notes |
|------|-------|-------|
| Diagrams | 42 | Correctly identified assembly diagrams with specs |
| Text | 22 | Inspection text, repair procedures, spring specs |
| Ignored | 9 | Cover pages, blank, boilerplate |
| Parts lists | 0 | No IPL pages in this subset |

**Figures found:** 23 unique figure numbers, correctly grouped multi-sheet figures (e.g., Fig. 819 = 5 pages).

## Pass 2: Deep Extraction

**Model:** Gemini 2.5 Pro
**Result:** PARTIAL PASS — accuracy good, timeout issues on large sections

### Fig. 818 (2 pages) — Successfully extracted
- **Items:** 15
- **Section confidence:** 0.81
- **Types:** torque_spec(4), tool_requirement(3), procedural_check(5), general_note(2), replace_if_disturbed(1)
- **Example specs:** "51-56 LB-IN (5.8 to 6.3 N•m)" — correctly parsed both units

### Fig. 816, 817 (3 pages each) — Timed out at 60s
- **Fix applied:** Increased timeout to 120s

## Issues Found & Fixed

1. **Timeout too short for multi-page sections** — Increased from 60s to 120s
2. **Unicode unit variants** — "N•m" (bullet) and "N-M" (uppercase) weren't matching validation. Added unicode normalization.
3. **Empty specification on tool_requirement items** — Prompt updated to require tool IDs in specification field

## Accuracy Assessment

Based on Fig. 818 extraction:
- **Torque specs:** 4 found — matches visual count on the diagram ✓
- **Tool requirements:** 3 found with correct AGE/PES/HTS identifiers ✓
- **Procedural checks:** 5 found including shimming refs and rotation checks ✓
- **Cross-references:** SPECIAL SHIMMING FIGURE 727 correctly captured ✓

**Estimated accuracy: ~85-90%** for sections that complete successfully.

## Next Steps

1. Re-run validation with 120s timeout to confirm Fig. 816/817 complete
2. Test against additional CMM samples from SilverWings visit (April 2026)
3. Consider per-page extraction for sections > 3 pages to stay within timeout
