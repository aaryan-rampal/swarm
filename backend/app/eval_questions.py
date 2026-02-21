"""Validation and formatting for eval_questions from planner specs."""

from __future__ import annotations

from typing import Any

EVAL_QUESTION_KEYS = {"id", "category", "question"}
_YES_NO_PREFIXES = (
    "is ",
    "are ",
    "does ",
    "do ",
    "did ",
    "can ",
    "could ",
    "should ",
    "would ",
    "will ",
    "has ",
    "have ",
    "had ",
    "was ",
    "were ",
)


def _looks_like_yes_no_question(question: str) -> bool:
    normalized = question.strip().lower()
    return normalized.endswith("?") and normalized.startswith(_YES_NO_PREFIXES)


def validate_eval_questions(raw: Any) -> list[dict[str, str]]:
    """
    Validate that raw is a list of eval question dicts.
    Each item must have: id (str), category (str), question (str).
    Returns the validated list. Raises ValueError on invalid structure.
    """
    if not isinstance(raw, list):
        raise ValueError("eval_questions must be a list")
    if len(raw) == 0:
        raise ValueError("eval_questions must contain at least one question")

    result: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"eval_questions[{i}]: expected dict, got {type(item).__name__}")

        for key in EVAL_QUESTION_KEYS:
            if key not in item:
                raise ValueError(f"eval_questions[{i}]: missing required key '{key}'")
        extra = set(item) - EVAL_QUESTION_KEYS
        if extra:
            raise ValueError(f"eval_questions[{i}]: unexpected keys {extra}")

        id_val = item["id"]
        cat_val = item["category"]
        q_val = item["question"]

        if not isinstance(id_val, str) or not id_val.strip():
            raise ValueError(f"eval_questions[{i}]: 'id' must be a non-empty string")
        if not isinstance(cat_val, str) or not cat_val.strip():
            raise ValueError(f"eval_questions[{i}]: 'category' must be a non-empty string")
        if not isinstance(q_val, str) or not q_val.strip():
            raise ValueError(f"eval_questions[{i}]: 'question' must be a non-empty string")
        if not _looks_like_yes_no_question(q_val):
            raise ValueError(
                f"eval_questions[{i}]: 'question' must be a yes/no question (e.g. starts with Is/Does/Can and ends with '?')"
            )

        if id_val in seen_ids:
            raise ValueError(f"eval_questions[{i}]: duplicate id '{id_val}'")
        seen_ids.add(id_val)

        result.append({"id": id_val, "category": cat_val, "question": q_val})

    return result


def eval_questions_to_markdown(questions: list[dict[str, str]]) -> str:
    """Convert eval_questions list to markdown rubric for model instruction."""
    by_category: dict[str, list[dict[str, str]]] = {}
    for q in questions:
        cat = q["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(q)

    parts = ["# Evaluation Criteria\n\nUse these yes/no questions to evaluate the output.\n"]
    for category, items in by_category.items():
        label = category.replace("_", " ").title()
        parts.append(f"## {label}\n\n")
        for q in items:
            parts.append(f"- **{q['id']}**: {q['question']}\n")
        parts.append("\n")

    parts.append("\n## Pass Condition\n\n- Weighted score >= 0.80")
    return "".join(parts)
