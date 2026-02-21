"""
LLM-as-a-Judge evaluation agent.

Uses a lightweight model (Gemini 2.5 Flash) to score model outputs against
a bank of yes/no evaluation questions for the email triage task.
"""

import asyncio
import json
import logging
import time
from typing import Any

import weave

from app.openrouter_client import chat_completion

logger = logging.getLogger(__name__)

JUDGE_MODEL = "google/gemini-2.5-flash"

EVAL_QUESTIONS: list[dict[str, str]] = [
    # --- Correctness: Did it pick the right emails? (10 questions) ---
    {"id": "c1", "category": "correctness", "question": "Does the response identify exactly 3 emails as the most important?"},
    {"id": "c2", "category": "correctness", "question": "Is the Q4 Revenue Review email from Sarah Chen included?"},
    {"id": "c3", "category": "correctness", "question": "Is the Production Database Latency alert included?"},
    {"id": "c4", "category": "correctness", "question": "Is the Acme Corp Onboarding email from Michael Torres included?"},
    {"id": "c5", "category": "correctness", "question": "Is the Q4 Revenue Review ranked as the highest priority?"},
    {"id": "c6", "category": "correctness", "question": "Is the Production Latency alert ranked higher than the Acme Corp onboarding?"},
    {"id": "c7", "category": "correctness", "question": "Does the response correctly identify Sarah Chen as VP of Sales (or equivalent executive title)?"},
    {"id": "c8", "category": "correctness", "question": "Does the response mention the end-of-day deadline for the Q4 review?"},
    {"id": "c9", "category": "correctness", "question": "Does the response mention the P1 severity of the production alert?"},
    {"id": "c10", "category": "correctness", "question": "Does the response mention the $2.4M ARR value of the Acme Corp deal?"},

    # --- Quality: Is the output well-structured? (10 questions) ---
    {"id": "q1", "category": "quality", "question": "Does the response use clear headings or numbered sections to separate each email?"},
    {"id": "q2", "category": "quality", "question": "Does each email summary include the sender's name?"},
    {"id": "q3", "category": "quality", "question": "Does each email summary include specific action items?"},
    {"id": "q4", "category": "quality", "question": "Are the action items presented as bullet points or a clear list format?"},
    {"id": "q5", "category": "quality", "question": "Does each email include a priority level (e.g., Critical, High, Medium)?"},
    {"id": "q6", "category": "quality", "question": "Is the response concise (no unnecessary filler or verbose explanations)?"},
    {"id": "q7", "category": "quality", "question": "Is the formatting consistent across all 3 email summaries?"},
    {"id": "q8", "category": "quality", "question": "Does the response include a brief explanation of WHY each email is important?"},
    {"id": "q9", "category": "quality", "question": "Are specific deadlines or timeframes mentioned where applicable?"},
    {"id": "q10", "category": "quality", "question": "Would a busy executive be able to scan this in under 60 seconds and understand the priorities?"},

    # --- Reasoning: Is the prioritization logic sound? (10 questions) ---
    {"id": "r1", "category": "reasoning", "question": "Does the response consider sender authority as a factor in prioritization?"},
    {"id": "r2", "category": "reasoning", "question": "Does the response consider time sensitivity or deadlines as a factor?"},
    {"id": "r3", "category": "reasoning", "question": "Does the response consider business impact (revenue, customers) as a factor?"},
    {"id": "r4", "category": "reasoning", "question": "Does the response consider whether action is required vs. informational?"},
    {"id": "r5", "category": "reasoning", "question": "Is the prioritization order logically consistent with the stated criteria?"},
    {"id": "r6", "category": "reasoning", "question": "Does the response distinguish between urgency and importance?"},
    {"id": "r7", "category": "reasoning", "question": "Are the suggested action items actually relevant to each email's content?"},
    {"id": "r8", "category": "reasoning", "question": "Does the response avoid hallucinating details not present in the original emails?"},
    {"id": "r9", "category": "reasoning", "question": "Does the response avoid including low-priority emails (newsletters, FYIs) in the top 3?"},
    {"id": "r10", "category": "reasoning", "question": "Would a human email assistant arrive at a similar prioritization?"},

    # --- Completeness & Usability (5 questions) ---
    {"id": "u1", "category": "usability", "question": "Does the response include enough context that the reader doesn't need to open the original emails?"},
    {"id": "u2", "category": "usability", "question": "Are next steps clear enough to act on immediately?"},
    {"id": "u3", "category": "usability", "question": "Does the response mention any relevant meeting times or scheduled events?"},
    {"id": "u4", "category": "usability", "question": "Does the response provide a sense of what can be safely ignored or deferred?"},
    {"id": "u5", "category": "usability", "question": "Is the overall tone professional and appropriate for a work context?"},
]

HARDCODED_RESPONSES: dict[str, str] = {
    "gpt-codex": """## Email Triage Report

After analyzing 47 emails in your inbox, I've identified the top 3 most important ones:

### 1. Critical: Q4 Revenue Review - Action Required
**From**: Sarah Chen (VP of Sales)
**Subject**: Q4 Revenue Review Meeting - Prep Materials Needed by EOD

**Why important**: Direct request from VP requiring immediate action with end-of-day deadline.

**Action items**:
- Prepare Q4 revenue summary slides
- Include YoY comparison data
- Send to Sarah by 5:00 PM EST

### 2. High: Production Incident - Database Latency
**From**: DevOps Alert System
**Subject**: [P1] Production database latency spike detected

**Why important**: Production system issue affecting customer-facing services.

**Action items**:
- Review latency metrics dashboard
- Coordinate with backend team
- Prepare incident response if needed

### 3. Medium: New Client Onboarding
**From**: Michael Torres (Account Manager)
**Subject**: Acme Corp onboarding kickoff - Your input needed

**Why important**: New enterprise client worth $2.4M ARR.

**Action items**:
- Review technical requirements doc
- Provide feasibility assessment
- Join kickoff call Thursday 2PM""",

    "claude-opus": """I've carefully reviewed all 47 emails in your inbox. Here are the 3 that demand your attention most urgently:

**1. Q4 Revenue Review - Prep Materials (CRITICAL)**

Sarah Chen, your VP of Sales, needs revenue summary slides by end of day. This is a direct ask from leadership with a hard deadline — I'd prioritize this first.

Key actions:
• Pull Q4 revenue numbers and create comparison slides
• Include year-over-year trends
• Email to Sarah before 5 PM EST

**2. Production Database Alert (HIGH)**

Your monitoring system flagged a P1 latency spike in production. While this might resolve on its own, the customer impact makes it worth investigating now.

Key actions:
• Check the latency dashboard immediately
• Loop in the backend team if numbers are still elevated
• Document any findings for the incident log

**3. Acme Corp Onboarding (MEDIUM)**

Michael Torres needs your technical input for a new $2.4M enterprise client. Not urgent today, but responding within 24 hours shows the account team you're engaged.

Key actions:
• Skim the technical requirements (10 min read)
• Flag any blockers or concerns
• Confirm your attendance at Thursday's kickoff

Everything else in your inbox is either FYI-only or can wait until next week.""",

    "gemini-3-pro": """# Email Priority Analysis

## Summary
Scanned 47 emails. Identified 3 requiring immediate attention.

## Priority Emails

### [P0] Q4 Revenue Review
- **Sender**: Sarah Chen, VP Sales
- **Deadline**: Today EOD
- **Type**: Action Required
- **Impact**: High — executive visibility
- **Tasks**: Prepare revenue slides with YoY data, submit by 5 PM

### [P1] Production Latency Alert
- **Sender**: DevOps Monitoring
- **Severity**: P1
- **Type**: Incident
- **Impact**: High — customer-facing degradation
- **Tasks**: Check metrics, coordinate response, escalate if needed

### [P2] Enterprise Client Onboarding
- **Sender**: Michael Torres, Account Mgmt
- **Type**: Collaboration Request
- **Impact**: Medium — $2.4M ARR opportunity
- **Tasks**: Review requirements, provide technical assessment, RSVP for Thursday

## Classification Stats
- Critical: 1 | High: 1 | Medium: 1
- Remaining: 12 informational, 8 newsletters, 22 low-priority""",

    "kimi-25": """Here are your top 3 important emails:

**1. Q4 Revenue Review (URGENT)**
From: Sarah Chen (VP Sales)
→ She needs revenue slides by end of day
→ Include Q4 numbers + year-over-year comparison
→ Priority: CRITICAL

**2. Production Alert - DB Latency**
From: DevOps System
→ P1 latency spike in production database
→ May affect customer experience
→ Check dashboard and coordinate with team
→ Priority: HIGH

**3. Acme Corp Onboarding**
From: Michael Torres (Account Manager)
→ New $2.4M client needs technical review
→ Kickoff meeting Thursday at 2 PM
→ Priority: MEDIUM

Summary: 3 actionable / 44 can wait""",
}

JUDGE_SYSTEM_PROMPT = """You are an expert evaluation judge. You will be given a model's response to an email triage task, along with a list of yes/no evaluation questions.

For EACH question, answer strictly "yes" or "no" based on the model's response.

You MUST respond with valid JSON only — no explanation, no markdown fences, no extra text.

The JSON format must be:
{"answers": {"c1": "yes", "c2": "no", ...}}

Use the exact question IDs provided. Answer every question."""


@weave.op
async def judge_single_response(
    model_id: str,
    response_text: str,
) -> dict[str, Any]:
    """Run the LLM judge on a single model response. Returns per-question answers and category scores."""

    questions_block = "\n".join(
        f"- [{q['id']}] ({q['category']}): {q['question']}"
        for q in EVAL_QUESTIONS
    )

    user_prompt = f"""## Model Response to Evaluate

{response_text}

---

## Evaluation Questions

{questions_block}

Respond with JSON only: {{"answers": {{"c1": "yes", ...}}}}"""

    start = time.monotonic()
    raw = await chat_completion(
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        model=JUDGE_MODEL,
    )
    latency_ms = int((time.monotonic() - start) * 1000)

    content: str = raw["choices"][0]["message"]["content"]

    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    answers: dict[str, str] = json.loads(content)["answers"]

    category_scores: dict[str, float] = {}
    for cat in ("correctness", "quality", "reasoning", "usability"):
        qs = [q for q in EVAL_QUESTIONS if q["category"] == cat]
        yes_count = sum(1 for q in qs if answers.get(q["id"], "").lower().startswith("y"))
        category_scores[cat] = round(yes_count / len(qs), 3) if qs else 0.0

    total_yes = sum(1 for v in answers.values() if v.lower().startswith("y"))
    overall = round(total_yes / len(EVAL_QUESTIONS), 3)

    usage = raw.get("usage", {})

    return {
        "model_id": model_id,
        "answers": answers,
        "scores": {
            **category_scores,
            "overall": overall,
        },
        "latency_ms": latency_ms,
        "tokens_in": usage.get("prompt_tokens", 0),
        "tokens_out": usage.get("completion_tokens", 0),
        "judge_model": JUDGE_MODEL,
    }


@weave.op
async def run_judge_sweep() -> dict[str, Any]:
    """Run the LLM judge across all hardcoded model responses in parallel."""

    tasks = [
        judge_single_response(model_id, response_text)
        for model_id, response_text in HARDCODED_RESPONSES.items()
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    model_results: dict[str, Any] = {}
    for r in results:
        if isinstance(r, Exception):
            logger.error("Judge call failed: %s", r)
            continue
        model_results[r["model_id"]] = r

    ranked = sorted(
        model_results.values(),
        key=lambda x: x["scores"]["overall"],
        reverse=True,
    )

    return {
        "models": model_results,
        "ranking": [r["model_id"] for r in ranked],
        "best_model": ranked[0]["model_id"] if ranked else None,
    }
