# Evaluation report

> **Status (2026-11-20): evaluation tool and metrics pipeline complete; 0 of 50 records labelled.**
> The specification requires human ground truth ("do not use LLM-generated labels as ground truth"). Labels produced by an AI assistant would not satisfy that, so no accuracy figures are reported yet. A human evaluator needs to complete the 50 labels in **Admin → Evaluation** (≈30–45 minutes); the metrics below then fill in automatically and can be exported as CSV.

## Method

- **Sample.** 50 current, non-manual predictions on active jobs, drawn by a deterministic stratified sampler (seed `20261120`) that round-robins over *role × confidence-level* strata, so minority roles and LOW-confidence predictions are represented rather than the sample being dominated by Bengaluru software roles. Once a record is labelled it stays in the sample; new picks only fill unlabelled slots.
- **Labelling.** The evaluator reads the original posting (full text, source locations, source employment type, link to the live page) and records the true role, primary city (or "not stated"), experience level, employment type (or "not stated") and fresher eligibility. **The form starts empty** — it is deliberately not pre-filled with the model's answer, to avoid anchoring the evaluator towards agreement. The prediction is shown alongside for reference.
- **Scoring.** Each field is compared exactly (city case-insensitively; `null` = `null` counts as correct). Error categories WRONG_ROLE, WRONG_CITY, INCORRECT_EXPERIENCE and INCORRECT_ELIGIBILITY are derived automatically; MISSING_INFORMATION and HALLUCINATED_EXTRACTION are added by the evaluator.
- **Formula.** `Accuracy = correct predictions ÷ evaluated predictions × 100`, reported with the count (`n`) for every figure. Exact match requires all five fields correct.
- **Calibration.** Exact-match accuracy is reported separately for HIGH, MEDIUM and LOW confidence. The confidence system is only useful if HIGH is measurably more accurate than LOW; with n≈15 per level the confidence intervals are wide (±~20 percentage points), which the report states rather than hides.

## Results

| Field | Accuracy | Correct / n |
|---|---|---|
| Role | — | 0 / 0 |
| City | — | 0 / 0 |
| Experience | — | 0 / 0 |
| Employment type | — | 0 / 0 |
| Fresher eligibility | — | 0 / 0 |
| **Exact match** | — | 0 / 0 |

| Confidence | Exact-match accuracy | n |
|---|---|---|
| HIGH | — | 0 |
| MEDIUM | — | 0 |
| LOW | — | 0 |

*To be completed from `GET /api/v1/admin/evaluation/metrics` (or the CSV export) after labelling.*

## Errors found during development (from live data, fixed with regression tests)

These were found by inspecting real outputs, not from the formal sample:

| Problem | Example | Fix |
|---|---|---|
| US state codes read as India | "Lafayette, IN", "Nashville, TN" kept as Indian postings | two-letter codes only trusted next to "India"; country code IN no longer parsed from free text |
| Small cities lost | "Aligarh, Uttar Pradesh" → state-level only | explicit "City, State" components extracted |
| Intern titles shown as Full-time | "Security Engineer Intern" (ATS default commitment) | explicit intern title outranks a generic Full-time |
| LLM over-uses OTHER | "Associate Recruiter", "Account Development Representative" → OTHER | LLM OTHER cannot override a strong title rule; rule patterns extended |
| Prompt text quoted as evidence | evidence "Source employment type: Intern" | evidence grounding rejects quotes not found in the posting |
