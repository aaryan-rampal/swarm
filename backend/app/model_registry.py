from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

_PALETTE = [
    "#10b981",  # emerald
    "#f97316",  # orange
    "#3b82f6",  # blue
    "#a855f7",  # purple
    "#ef4444",  # red
    "#14b8a6",  # teal
    "#f59e0b",  # amber
    "#6366f1",  # indigo
    "#ec4899",  # pink
    "#22d3ee",  # cyan
]


@dataclass(frozen=True)
class ModelSpec:
    id: str
    name: str
    provider: str
    color: str


def _derive_name(model_id: str) -> str:
    """'openai/gpt-4o-mini' -> 'GPT-4o-Mini'"""
    slug = model_id.split("/", 1)[-1]
    return slug.replace("-", " ").title().replace(" ", "-")


def _derive_provider(model_id: str) -> str:
    """'openai/gpt-4o-mini' -> 'OpenAI'"""
    prefix = model_id.split("/", 1)[0]
    return prefix.replace("ai", "AI").replace("meta-llama", "Meta").title()


def load_models(path: str | Path = "models.txt") -> list[ModelSpec]:
    lines = Path(path).read_text(encoding="utf-8").strip().splitlines()
    models: list[ModelSpec] = []
    for i, raw in enumerate(lines):
        model_id = raw.strip()
        if not model_id or model_id.startswith("#"):
            continue
        models.append(
            ModelSpec(
                id=model_id,
                name=_derive_name(model_id),
                provider=_derive_provider(model_id),
                color=_PALETTE[i % len(_PALETTE)],
            )
        )
    return models
