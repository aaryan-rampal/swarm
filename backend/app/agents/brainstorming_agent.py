from pathlib import Path
import json
from typing import Any

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


def _parse_json_output(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:-1]).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


@weave.op
async def run_brainstorming_full_flow(
    task: str, model: str | None = None
) -> dict[str, Any]:
    system_prompt = _load_brainstorming_prompt()

    synthetic_data_response = await chat_completion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "Task: "
                    f"{task}\n\n"
                    "Generate synthetic_data.json as strict JSON only. "
                    "Return an object with a top-level 'cases' array of realistic test inputs."
                ),
            },
        ],
    )
    synthetic_data_text = synthetic_data_response["choices"][0]["message"]["content"]
    synthetic_data = _parse_json_output(synthetic_data_text)

    judging_criteria_response = await chat_completion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "Task: "
                    f"{task}\n\n"
                    "Synthetic data:\n"
                    f"{json.dumps(synthetic_data)}\n\n"
                    "Generate judging_criteria.json as strict JSON only. "
                    "Return an object with a top-level 'rubric' array and numeric weights."
                ),
            },
        ],
    )
    judging_criteria_text = judging_criteria_response["choices"][0]["message"][
        "content"
    ]
    judging_criteria = _parse_json_output(judging_criteria_text)

    prompt_template_response = await chat_completion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "Task: "
                    f"{task}\n\n"
                    "Judging criteria:\n"
                    f"{json.dumps(judging_criteria)}\n\n"
                    "Generate prompt_template.md as markdown."
                ),
            },
        ],
    )
    prompt_template = prompt_template_response["choices"][0]["message"]["content"]

    model_name = (
        prompt_template_response.get("model")
        or model
        or get_settings().openrouter_model
    )

    return {
        "model": model_name,
        "synthetic_data": synthetic_data,
        "judging_criteria": judging_criteria,
        "prompt_template": prompt_template,
    }
