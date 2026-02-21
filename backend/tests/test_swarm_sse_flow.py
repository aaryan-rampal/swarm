from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.model_registry import ModelSpec


_SINGLE_MODEL = [ModelSpec(id="test/fake-model", name="Fake-Model", provider="Test", color="#10b981")]


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


def test_confirm_run_emits_events_and_exports_results() -> None:
    async def fake_stream(messages, model=None, reasoning=None):  # noqa: ARG001
        yield {"content_delta": "Scanning legal and payroll emails.", "raw": {}}
        yield {"content_delta": " Ranking by urgency.", "raw": {}}
        yield {"usage": {"prompt_tokens": 120, "completion_tokens": 80}, "raw": {}}
        yield {"done": True}

    from app import swarm_orchestrator
    from app.routers import planner as planner_mod
    from pytest import MonkeyPatch

    with TestClient(app) as client:
        mp = MonkeyPatch()
        mp.setattr(swarm_orchestrator, "chat_completion_stream", fake_stream)
        mp.setattr(planner_mod, "load_models", lambda: _SINGLE_MODEL)

        session_id = client.post("/api/planner/sessions").json()["session_id"]
        client.post(
            f"/api/planner/sessions/{session_id}/messages",
            json={"message": "Summarize my top important emails."},
        )

        confirm_body = client.post(f"/api/planner/sessions/{session_id}/confirm").json()
        run_id = confirm_body["run_id"]

        events_resp = client.get(f"/api/runs/{run_id}/events")
        assert events_resp.status_code == 200
        events = events_resp.json()["events"]

        event_types = {e["event_type"] for e in events}
        assert "run_started" in event_types
        assert "model_run_started" in event_types
        assert "narration_delta" in event_types
        assert "model_run_completed" in event_types
        assert "run_completed" in event_types

        model_events = [e for e in events if e.get("model_id") == "test/fake-model"]
        assert len(model_events) >= 5

        output_dir = Path(confirm_body["sse_sample_path"])
        assert output_dir.exists()
        summary = output_dir / "summary.json"
        assert summary.exists()

        mp.undo()


def test_events_filter_by_model_id() -> None:
    async def fake_stream(messages, model=None, reasoning=None):  # noqa: ARG001
        yield {"content_delta": "Analyzing emails.", "raw": {}}
        yield {"done": True}

    from app import swarm_orchestrator
    from app.routers import planner as planner_mod
    from pytest import MonkeyPatch

    with TestClient(app) as client:
        mp = MonkeyPatch()
        mp.setattr(swarm_orchestrator, "chat_completion_stream", fake_stream)
        mp.setattr(planner_mod, "load_models", lambda: _SINGLE_MODEL)

        session_id = client.post("/api/planner/sessions").json()["session_id"]
        client.post(
            f"/api/planner/sessions/{session_id}/messages",
            json={"message": "test"},
        )
        run_id = client.post(f"/api/planner/sessions/{session_id}/confirm").json()["run_id"]

        all_events = client.get(f"/api/runs/{run_id}/events").json()["events"]
        filtered = client.get(f"/api/runs/{run_id}/events?model_id=test/fake-model").json()["events"]

        assert len(filtered) < len(all_events)
        assert all(e["model_id"] == "test/fake-model" for e in filtered)

        mp.undo()


def test_sse_stream_returns_event_source_format() -> None:
    async def fake_stream(messages, model=None, reasoning=None):  # noqa: ARG001
        yield {"content_delta": "Reviewing emails.", "raw": {}}
        yield {"done": True}

    from app import swarm_orchestrator
    from app.routers import planner as planner_mod
    from pytest import MonkeyPatch

    with TestClient(app) as client:
        mp = MonkeyPatch()
        mp.setattr(swarm_orchestrator, "chat_completion_stream", fake_stream)
        mp.setattr(planner_mod, "load_models", lambda: _SINGLE_MODEL)

        session_id = client.post("/api/planner/sessions").json()["session_id"]
        client.post(
            f"/api/planner/sessions/{session_id}/messages",
            json={"message": "test"},
        )
        run_id = client.post(f"/api/planner/sessions/{session_id}/confirm").json()["run_id"]

        with client.stream("GET", f"/api/runs/{run_id}/stream") as response:
            assert response.status_code == 200
            body = "".join(chunk for chunk in response.iter_text())

        assert "event: run_started" in body
        assert "event: narration_delta" in body
        assert "event: run_completed" in body
        assert "data: {" in body

        mp.undo()
