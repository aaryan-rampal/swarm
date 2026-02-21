import json

import pytest

from app.agents import brainstorming_agent


@pytest.mark.asyncio
async def test_run_brainstorming_full_flow_returns_three_artifacts(monkeypatch):
    responses = iter(
        [
            {
                "model": "openai/gpt-4o-mini",
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "cases": [
                                        {
                                            "id": "c1",
                                            "input": "email set",
                                            "expected": "top 3 summary",
                                        }
                                    ]
                                }
                            )
                        }
                    }
                ],
            },
            {
                "model": "openai/gpt-4o-mini",
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "rubric": [
                                        {
                                            "name": "correctness",
                                            "weight": 0.5,
                                        }
                                    ]
                                }
                            )
                        }
                    }
                ],
            },
            {
                "model": "openai/gpt-4o-mini",
                "choices": [
                    {
                        "message": {
                            "content": "# Prompt Template\n\nYou are a reliable assistant.",
                        }
                    }
                ],
            },
        ]
    )

    async def fake_chat_completion(messages, model=None):  # noqa: ARG001
        return next(responses)

    monkeypatch.setattr(brainstorming_agent, "chat_completion", fake_chat_completion)

    result = await brainstorming_agent.run_brainstorming_full_flow(
        task="Summarize my top 3 most important emails."
    )

    assert result["model"] == "openai/gpt-4o-mini"
    assert result["synthetic_data"]["cases"][0]["id"] == "c1"
    assert result["judging_criteria"]["rubric"][0]["name"] == "correctness"
    assert "Prompt Template" in result["prompt_template"]
