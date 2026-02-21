"""Tests for eval_questions validation and formatting."""

import pytest

from app.eval_questions import eval_questions_to_markdown, validate_eval_questions


def test_validate_eval_questions_valid() -> None:
    q = [
        {"id": "c1", "category": "correctness", "question": "Does it include exactly 3?"},
        {"id": "q1", "category": "quality", "question": "Is it well structured?"},
    ]
    result = validate_eval_questions(q)
    assert len(result) == 2
    assert result[0]["id"] == "c1"
    assert result[1]["category"] == "quality"


def test_validate_eval_questions_not_list() -> None:
    with pytest.raises(ValueError, match="must be a list"):
        validate_eval_questions({"id": "c1"})  # type: ignore[arg-type]


def test_validate_eval_questions_item_not_dict() -> None:
    with pytest.raises(ValueError, match="expected dict"):
        validate_eval_questions(["not a dict"])


def test_validate_eval_questions_missing_key() -> None:
    with pytest.raises(ValueError, match="missing required key 'question'"):
        validate_eval_questions([{"id": "c1", "category": "correctness"}])


def test_validate_eval_questions_extra_key() -> None:
    with pytest.raises(ValueError, match="unexpected keys"):
        validate_eval_questions([{"id": "c1", "category": "c", "question": "Q?", "extra": "x"}])


def test_validate_eval_questions_empty_id() -> None:
    with pytest.raises(ValueError, match="'id' must be a non-empty string"):
        validate_eval_questions([{"id": "", "category": "c", "question": "Q?"}])


def test_validate_eval_questions_duplicate_id() -> None:
    with pytest.raises(ValueError, match="duplicate id"):
        validate_eval_questions([
            {"id": "x", "category": "c", "question": "Q1"},
            {"id": "x", "category": "c", "question": "Q2"},
        ])


def test_eval_questions_to_markdown() -> None:
    q = [
        {"id": "c1", "category": "correctness", "question": "Is it right?"},
        {"id": "q1", "category": "quality", "question": "Is it clear?"},
    ]
    md = eval_questions_to_markdown(q)
    assert "# Evaluation Criteria" in md
    assert "correctness" in md.lower()
    assert "quality" in md.lower()
    assert "c1" in md
    assert "Is it right?" in md
    assert "Pass Condition" in md
