"""Planner chat agent using the brainstorming SKILL for multi-turn design dialogue."""

import json
import re
from typing import Any

import weave
from app.agents.brainstorming_agent import _load_brainstorming_prompt
from app.openrouter_client import chat_completion

SWARM_PLANNER_ADDENDUM = """

## Your Role: Swarm Benchmark Design Assistant

You help users design benchmark scenarios for testing AI models across multiple providers. Keep responses SHORT and conversational.

### Conversation Flow

**PHASE 1 — Clarify (first 2-3 turns):** Ask ONE short clarifying question per turn. Keep responses to 2-4 sentences + 1 question. Focus on understanding:
- What the model should do (task goal)
- What the input data looks like (domain, shape, edge cases)
- What "good output" means (success criteria)

Prefer multiple-choice questions when possible. Do NOT generate the JSON spec yet.

**PHASE 2 — Summarize:** Once you understand the task, present a 3-5 bullet summary of what you'll build and ask "Does this look good?"

**PHASE 3 — Generate spec:** ONLY after the user confirms ("yes", "looks good", "sounds good", "build it", etc.), output the JSON spec.

### Rules
- NEVER output the JSON spec in your first response. Ask at least one question first.
- If the user says "just build it" or "skip questions" on their FIRST message, ask ONE quick multiple-choice question, then generate the spec next turn.
- Once the user confirms after Phase 2, output the spec IMMEDIATELY. Do not ask more questions.

### JSON Spec Format (Phase 3 only)

End your message with a fenced ```json block containing ALL THREE fields:

1. **prompt_template** — Markdown prompt: `# Prompt: [Title]`, `## Objective`, `## Instructions` (numbered), `## Output Format`
2. **input_data** — Realistic synthetic test data (never placeholders). Use domain-appropriate keys like `{"emails": [...]}` or `{"tickets": [...]}`.
3. **eval_questions** — 20-35 yes/no questions, each with `id` (str), `category` (correctness|quality|reasoning|usability), `question` (str). Grounded in your input_data.

No comments inside JSON. All three fields required.
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
    system_prompt = base_prompt + "\n\n---\n\n" + SWARM_PLANNER_ADDENDUM

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
