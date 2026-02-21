"""Planner chat agent using the brainstorming SKILL for multi-turn design dialogue."""

import json
import re
from typing import Any

import weave
from app.agents.brainstorming_agent import _load_brainstorming_prompt
from app.openrouter_client import chat_completion

SWARM_PLANNER_ADDENDUM = """

## CRITICAL: Swarm Benchmark Spec Output

You are designing a complete benchmark scenario. Generate ALL three: prompt (markdown), input_data (synthetic test data), and eval_questions (structured yes/no checks). The user clicks "Start Swarm" to run it.

**TRIGGER PHRASES — When the user says any of these, output the JSON spec IMMEDIATELY. Do NOT ask another question:**
- "looks good" / "sounds good" / "yes" / "that's fine" / "nope that's fine"
- "just give me the plan" / "give me the prompt" / "just build it" / "don't ask more questions"

**RULE: If the user has confirmed ("yes", "looks good") at ANY point, your NEXT response MUST include the JSON block. Never ask "Does this look good?" again.**

**RULE: If user says "don't ask more questions" or "just build it", output the spec immediately with sensible defaults.**

**Required format:** Your message MUST end with a JSON block with these three fields:

1. **prompt** or **prompt_template** — Full markdown like prompt.md:
   - `# Prompt: [Title]`
   - `## Objective` — what the model should do
   - `## Instructions` — numbered list (1. 2. 3. ...)
   - `## Output Format` — exact structure the model must return (e.g. markdown template)

2. **input_data** — Actual synthetic test data (NOT placeholders) appropriate for the task domain.
   - For example: `{"items": [...]}`, `{"tickets": [...]}`, `{"messages": [...]}`, `{"emails": [...]}`, etc.
   - Generate realistic examples with enough variety to test prioritization/decision quality.

3. **eval_questions** — A list of yes/no evaluation questions. Each item MUST have exactly:
   - `id` (str): short id, e.g. "c1", "q2", "r3"
   - `category` (str): one of correctness, quality, reasoning, usability (or similar)
   - `question` (str): a specific yes/no question tailored to YOUR input_data

   Generate 20–35 questions across 3–4 categories. Questions must be grounded in your input_data and task requirements (no placeholders).

**Example eval_questions:**
```json
"eval_questions": [
  {"id": "c1", "category": "correctness", "question": "Does the response select exactly 3 highest-priority items?"},
  {"id": "c2", "category": "correctness", "question": "Is the most time-sensitive item included in the top selection?"},
  {"id": "q1", "category": "quality", "question": "Are the suggested next actions concrete and specific?"},
  {"id": "r1", "category": "reasoning", "question": "Does the response justify prioritization using impact and urgency?"}
]
```

**Example full structure:**
```json
{
  "prompt_template": "# Prompt: Prioritize Incoming Work Items\\n\\n...",
  "input_data": {"items": [{"id":"i1","title":"...", "owner":"...", "due":"...", "details":"..."}, {"id":"i2","title":"...", "owner":"...", "due":"...", "details":"..."}]},
  "eval_questions": [
    {"id": "c1", "category": "correctness", "question": "Does the response identify exactly 3 top-priority items?"},
    {"id": "c2", "category": "correctness", "question": "Is the item with the nearest deadline included?"}
  ]
}
```

You MUST include all three: prompt_template, input_data (with real synthetic data), and eval_questions. Without this JSON block, the user cannot start the benchmark.

**JSON rules:** Do NOT add // or /* */ comments inside the JSON block—JSON does not support them.
"""


def _strip_json_comments(raw: str) -> str:
    """Remove // line comments (invalid in JSON but models sometimes add them)."""
    return re.sub(r"\s+//[^\n]*", "", raw)


def _extract_brace_block(text: str, start: int) -> str | None:
    """Extract a balanced { } block starting at start."""
    depth = 0
    in_string = False
    escape = False
    quote = ""
    i = start
    while i < len(text):
        c = text[i]
        if escape:
            escape = False
            i += 1
            continue
        if in_string:
            if c == "\\" and quote in ('"', "'"):
                escape = True
            elif c == quote:
                in_string = False
        elif c in ('"', "'"):
            in_string = True
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
        i += 1
    return None


def _try_extract_draft_spec(text: str) -> dict | None:
    """Extract draft_spec from a ```json ... ``` block in the response."""
    # Try fenced block first
    fence = re.search(r"```(?:json)?\s*\{", text)
    if fence:
        start = fence.end() - 1
        block = _extract_brace_block(text, start)
        if block:
            cleaned = _strip_json_comments(block)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                pass
    # Fallback: find first { and extract balanced block
    idx = text.find("{")
    if idx >= 0:
        block = _extract_brace_block(text, idx)
        if block:
            cleaned = _strip_json_comments(block)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                pass
    return None


def _draft_spec_to_prompt(draft_spec: dict | None) -> str:
    """Derive draft_prompt string from draft_spec for session flow."""
    if not draft_spec:
        return ""
    return (
        draft_spec.get("prompt_template")
        or draft_spec.get("prompt")
        or json.dumps(draft_spec, indent=2)
    )


@weave.op
async def run_planner_chat(
    messages: list[dict[str, str]],
    user_message: str,
    model: str | None = None,
) -> dict[str, Any]:
    """
    Stateless planner chat following the brainstorming SKILL.
    Accepts message history (list of {role, content}) and new user message;
    returns assistant_message, draft_spec. Caller is responsible for persistence.
    """
    base_prompt = _load_brainstorming_prompt()
    # Swarm rules first so they take precedence when user confirms
    system_prompt = SWARM_PLANNER_ADDENDUM + "\n\n---\n\n" + base_prompt

    chat_messages = [
        {"role": "system", "content": system_prompt},
        *messages,
        {"role": "user", "content": user_message},
    ]

    completion = await chat_completion(model=model, messages=chat_messages)
    assistant_content = completion["choices"][0]["message"]["content"]
    draft_spec = _try_extract_draft_spec(assistant_content)

    return {
        "assistant_message": assistant_content,
        "draft_spec": draft_spec,
        "draft_prompt": _draft_spec_to_prompt(draft_spec),
    }
