# OmniTrace Backend (Test Harness)

This is a minimal backend test setup that:
- calls OpenRouter,
- traces execution in Weave,
- runs a first-pass brainstorming agent seeded from your brainstorming skill prompt.

## 1) Environment variables

Add these values to `.env`:

```bash
OPENROUTER_API_KEY=<your_openrouter_api_key>
OPENROUTER_MODEL=openai/gpt-4o-mini
WEAVE_PROJECT=omnitrace-dev

# Optional
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=http://localhost:8000
OPENROUTER_SITE_NAME=OmniTrace Local Test
BRAINSTORMING_SKILL_PATH=~/.config/opencode/skills/superpowers/brainstorming/SKILL.md
```

## 2) Install dependencies

```bash
.venv/bin/python -m uv pip install -e .
```

## 3) Run API

```bash
.venv/bin/python -m uvicorn app.main:app --reload
```

## 4) Trigger a test run

```bash
curl -X POST "http://127.0.0.1:8000/brainstorm/test" \
  -H "Content-Type: application/json" \
  -d '{"task":"Summarize my top 3 most important emails and propose an eval rubric."}'
```

If everything is configured, you should get a JSON response and a corresponding trace in Weave.
