import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import weave

from app.config import get_settings


@weave.op
async def chat_completion(
    messages: list[dict[str, str]], model: str | None = None
) -> dict[str, Any]:
    settings = get_settings()
    selected_model = model or settings.openrouter_model

    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY is not set")

    payload = {
        "model": selected_model,
        "messages": messages,
        "temperature": 0.2,
    }

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_site_name,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.openrouter_base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()

    return response.json()


def _parse_openrouter_sse_line(line: str) -> dict[str, Any] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith(":"):
        return None
    if not stripped.startswith("data:"):
        return None

    payload_text = stripped[len("data:") :].strip()
    if payload_text == "[DONE]":
        return {"done": True}

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        return None

    choice = (payload.get("choices") or [{}])[0]
    delta = choice.get("delta") or {}
    message = choice.get("message") or {}
    content_delta = delta.get("content")
    reasoning_details = (
        delta.get("reasoning_details") or message.get("reasoning_details") or []
    )
    usage = payload.get("usage")

    return {
        "content_delta": content_delta,
        "reasoning_details": reasoning_details,
        "usage": usage,
        "raw": payload,
    }


async def chat_completion_stream(
    messages: list[dict[str, str]],
    model: str | None = None,
    reasoning: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    settings = get_settings()
    selected_model = model or settings.openrouter_reasoning_model

    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY is not set")

    payload: dict[str, Any] = {
        "model": selected_model,
        "messages": messages,
        "temperature": 0.2,
        "stream": True,
    }
    if reasoning is not None:
        payload["reasoning"] = reasoning

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_site_name,
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{settings.openrouter_base_url}/chat/completions",
            json=payload,
            headers=headers,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                parsed = _parse_openrouter_sse_line(line)
                if parsed is not None:
                    yield parsed
