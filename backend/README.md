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

## 5) Trigger a full brainstorming flow test

```bash
curl -X POST "http://127.0.0.1:8000/brainstorm/full-test" \
  -H "Content-Type: application/json" \
  -d '{"task":"Summarize my top 3 most important emails and propose an eval rubric."}'
```

This returns a single payload containing `synthetic_data`, `judging_criteria`, and `prompt_template`, and logs each model call as a Weave-traced operation.

## 6) Swarm SSE sample flow

Create a brainstorming session:

```bash
curl -X POST "http://127.0.0.1:8000/api/planner/sessions"
```

Send a message and mark direction ready for confirm:

```bash
curl -X POST "http://127.0.0.1:8000/api/planner/sessions/<session_id>/messages" \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize my top important emails."}'
```

Confirm to spawn the sample swarm run:

```bash
curl -X POST "http://127.0.0.1:8000/api/planner/sessions/<session_id>/confirm"
```

Stream run events via SSE:

```bash
curl -N "http://127.0.0.1:8000/api/runs/<run_id>/stream"
```

Replay run events (cursor optional):

```bash
curl "http://127.0.0.1:8000/api/runs/<run_id>/events"
```

Sample scenario files live in:

- `app/scenarios/email_priority/emails.json`
- `app/scenarios/email_priority/prompt.md`
- `app/scenarios/email_priority/evaluation.md`

The latest committed SSE sample output is in:

- `artifacts/sse/sample_output.txt`
