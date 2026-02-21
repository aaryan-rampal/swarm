import json

from app import openrouter_client


def test_parse_openrouter_sse_line_content_delta() -> None:
    line = 'data: {"choices":[{"delta":{"content":"hello"}}]}'

    parsed = openrouter_client._parse_openrouter_sse_line(line)

    assert parsed is not None
    assert parsed["content_delta"] == "hello"
    assert parsed["reasoning_details"] == []
    assert parsed["usage"] is None


def test_parse_openrouter_sse_line_reasoning_and_usage() -> None:
    reasoning_payload = {
        "choices": [
            {
                "delta": {
                    "reasoning_details": [
                        {
                            "type": "reasoning.summary",
                            "summary": "Prioritized legal compliance first.",
                        }
                    ]
                }
            }
        ],
        "usage": {
            "prompt_tokens": 111,
            "completion_tokens": 77,
            "reasoning_tokens": 45,
        },
    }
    line = f"data: {json.dumps(reasoning_payload)}"

    parsed = openrouter_client._parse_openrouter_sse_line(line)

    assert parsed is not None
    assert parsed["content_delta"] is None
    assert parsed["reasoning_details"][0]["type"] == "reasoning.summary"
    assert parsed["usage"]["reasoning_tokens"] == 45


def test_parse_openrouter_sse_line_done_and_noise() -> None:
    assert openrouter_client._parse_openrouter_sse_line(": ping") is None
    assert openrouter_client._parse_openrouter_sse_line("event: message") is None

    done = openrouter_client._parse_openrouter_sse_line("data: [DONE]")

    assert done == {"done": True}
