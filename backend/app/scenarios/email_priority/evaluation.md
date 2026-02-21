# Evaluation Criteria: Top Email Summarization

Use this rubric to evaluate model outputs for the sample email-priority scenario.

## 1) Priority Accuracy (40%)

- Correctly ranks the two `important` emails at the top.
- Includes the `kinda_important` email as the third choice or in watchlist with a clear reason.
- Excludes both spam emails from top-three recommendations.

## 2) Factual Grounding (25%)

- Summaries are directly supported by sender/subject/body content.
- No hallucinated deadlines, people, or policy details.

## 3) Actionability (20%)

- Each chosen email has a concrete next action.
- Actions are specific enough to execute immediately.

## 4) Clarity and Structure (15%)

- Output follows requested format.
- Ranking is explicit and easy to scan.
- Urgency labels are reasonable and consistent with content.

## Pass Condition

- Weighted score >= 0.80
- Automatic fail if any spam email appears in top 3.
