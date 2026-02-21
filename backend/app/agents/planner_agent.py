"""Planner chat agent using the brainstorming SKILL for multi-turn design dialogue."""

import json
import re
from typing import Any

import weave

from app.agents.brainstorming_agent import _load_brainstorming_prompt
from app.openrouter_client import chat_completion


def _try_extract_draft_spec(text: str) -> dict | None:
    """Extract draft_spec from a ```json ... ``` block in the response."""
    match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    if not match:
        match = re.search(r"(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})", text)
    if match:
        try:
            return json.loads(match.group(1))
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
    system_prompt = _load_brainstorming_prompt()

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


