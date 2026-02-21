from pathlib import Path

import weave

from app.config import get_settings
from app.openrouter_client import chat_completion


FALLBACK_BRAINSTORMING_PROMPT = (
    "You are a brainstorming agent that helps users turn ideas into implementation-ready designs. "
    "Ask one clarifying question at a time, prefer multiple choice, propose alternatives with trade-offs, "
    "and keep outputs concrete and testable."
)


def _load_brainstorming_prompt() -> str:
    settings = get_settings()
    prompt_path = Path(settings.brainstorming_skill_path)

    if prompt_path.exists() and prompt_path.is_file():
        content = prompt_path.read_text(encoding="utf-8").strip()
        if content:
            return content

    return FALLBACK_BRAINSTORMING_PROMPT


@weave.op
async def run_brainstorming_agent(
    task: str, model: str | None = None
) -> dict[str, str]:
    system_prompt = _load_brainstorming_prompt()

    completion = await chat_completion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task},
        ],
    )

    assistant_message = completion["choices"][0]["message"]["content"]
    model_name = completion.get("model", model or get_settings().openrouter_model)

    return {
        "model": model_name,
        "assistant_message": assistant_message,
    }
