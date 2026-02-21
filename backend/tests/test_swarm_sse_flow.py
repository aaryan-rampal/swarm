from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_sample_email_scenario_artifacts_exist() -> None:
    scenario_dir = Path("app/scenarios/email_priority")
    prompt_path = scenario_dir / "prompt.md"
    evaluation_path = scenario_dir / "evaluation.md"
    emails_path = scenario_dir / "emails.json"

    assert prompt_path.exists()
    assert evaluation_path.exists()
    assert emails_path.exists()

    emails_text = emails_path.read_text(encoding="utf-8")
    assert emails_text.count('"priority": "important"') == 2
    assert emails_text.count('"priority": "kinda_important"') == 1
    assert emails_text.count('"priority": "spam"') == 2


def test_confirm_run_emits_events_and_writes_txt() -> None:
    async def fake_chat_completion_stream(messages, model=None, reasoning=None):  # noqa: ARG001
        yield {
            "content_delta": "Top priority email is legal retention policy.",
            "raw": {"choices": [{"delta": {"content": "Top priority email"}}]},
        }
        yield {
            "reasoning_details": [
                {
                    "type": "reasoning.summary",
                    "summary": "Prioritized legal and payroll risk above marketing updates.",
                }
            ],
            "raw": {
                "choices": [
                    {"delta": {"reasoning_details": [{"type": "reasoning.summary"}]}}
                ]
            },
        }
        yield {
            "usage": {
                "prompt_tokens": 120,
                "completion_tokens": 80,
                "reasoning_tokens": 40,
            },
            "raw": {"usage": {"prompt_tokens": 120}},
        }
        yield {"done": True}

    from app import swarm_orchestrator

    with TestClient(app) as client:
        from pytest import MonkeyPatch

        monkeypatch = MonkeyPatch()
        monkeypatch.setattr(
            swarm_orchestrator,
            "chat_completion_stream",
            fake_chat_completion_stream,
        )

        create_response = client.post("/api/planner/sessions")
        assert create_response.status_code == 200
        session_id = create_response.json()["session_id"]

        message_response = client.post(
            f"/api/planner/sessions/{session_id}/messages",
            json={"message": "Summarize my top important emails."},
        )
        assert message_response.status_code == 200
        assert "assistant_message" in message_response.json()

        confirm_response = client.post(f"/api/planner/sessions/{session_id}/confirm")
        assert confirm_response.status_code == 200
        confirm_body = confirm_response.json()
        run_id = confirm_body["run_id"]

        events_response = client.get(f"/api/runs/{run_id}/events")
        assert events_response.status_code == 200
        events = events_response.json()["events"]
        assert len(events) >= 4
        assert any(event["event_type"] == "llm_content_delta" for event in events)
        assert any(event["event_type"] == "llm_reasoning_delta" for event in events)
        assert any(event["event_type"] == "llm_usage_final" for event in events)
        assert any(event["model"] == "google/gemini-3-pro" for event in events)

        sample_path = Path(confirm_body["sse_sample_path"])
        assert sample_path.exists()
        sample_text = sample_path.read_text(encoding="utf-8")
        assert "event: llm_content_delta" in sample_text
        assert "event: llm_reasoning_delta" in sample_text
        assert "event: llm_usage_final" in sample_text
        assert f'"run_id": "{run_id}"' in sample_text

        monkeypatch.undo()


def test_sse_stream_returns_event_source_format() -> None:
    async def fake_chat_completion_stream(messages, model=None, reasoning=None):  # noqa: ARG001
        yield {
            "content_delta": "Urgent legal task detected.",
            "raw": {"choices": [{"delta": {"content": "Urgent legal"}}]},
        }
        yield {
            "reasoning_details": [
                {
                    "type": "reasoning.summary",
                    "summary": "Compliance deadline outranks optional marketing review.",
                }
            ],
            "raw": {
                "choices": [
                    {"delta": {"reasoning_details": [{"type": "reasoning.summary"}]}}
                ]
            },
        }
        yield {
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "raw": {"usage": {"prompt_tokens": 100}},
        }
        yield {"done": True}

    from app import swarm_orchestrator
    from pytest import MonkeyPatch

    with TestClient(app) as client:
        monkeypatch = MonkeyPatch()
        monkeypatch.setattr(
            swarm_orchestrator,
            "chat_completion_stream",
            fake_chat_completion_stream,
        )

        session_id = client.post("/api/planner/sessions").json()["session_id"]
        client.post(
            f"/api/planner/sessions/{session_id}/messages",
            json={"message": "Give me a concise brief."},
        )
        run_id = client.post(f"/api/planner/sessions/{session_id}/confirm").json()[
            "run_id"
        ]

        with client.stream("GET", f"/api/runs/{run_id}/stream") as response:
            assert response.status_code == 200
            body = "".join(chunk for chunk in response.iter_text())

        assert "event: run_started" in body
        assert "event: llm_content_delta" in body
        assert "event: llm_reasoning_delta" in body
        assert "event: llm_usage_final" in body
        assert "event: run_completed" in body
        assert "data: {" in body

        monkeypatch.undo()
