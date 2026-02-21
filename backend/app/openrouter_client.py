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
