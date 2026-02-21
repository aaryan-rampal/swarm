from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class SwarmRuntime:
    def __init__(self) -> None:
        self.sessions: dict[UUID, dict[str, Any]] = {}
        self.runs: dict[UUID, dict[str, Any]] = {}

    def create_session(self) -> dict[str, Any]:
        session_id = uuid4()
        session = {
            "session_id": session_id,
            "status": "active",
            "messages": [],
            "draft_prompt": "",
            "ready_to_confirm": False,
            "created_at": now_iso(),
        }
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: UUID) -> dict[str, Any]:
        return self.sessions[session_id]

    def add_session_message(self, session_id: UUID, role: str, content: str) -> None:
        session = self.sessions[session_id]
        session["messages"].append(
            {
                "role": role,
                "content": content,
                "timestamp": now_iso(),
            }
        )

    def create_run(self, session_id: UUID) -> dict[str, Any]:
        run_id = uuid4()
        run = {
            "run_id": run_id,
            "session_id": session_id,
            "status": "running",
            "events": [],
            "cursor": 0,
            "sse_sample_path": "",
        }
        self.runs[run_id] = run
        return run

    def add_run_event(
        self,
        run_id: UUID,
        *,
        agent_id: str,
        event_type: str,
        phase: str,
        content: str,
        model: str,
        weave: dict[str, str],
        **extra: Any,
    ) -> dict[str, Any]:
        run = self.runs[run_id]
        run["cursor"] += 1
        event = {
            "event_id": f"evt_{run['cursor']:04d}",
            "cursor": str(run["cursor"]),
            "run_id": run_id,
            "session_id": run["session_id"],
            "agent_id": agent_id,
            "event_type": event_type,
            "phase": phase,
            "content": content,
            "model": model,
            "timestamp": now_iso(),
            "weave": weave,
        }
        event.update(extra)
        run["events"].append(event)
        return event

    def get_events(
        self, run_id: UUID, cursor: str | None = None
    ) -> list[dict[str, Any]]:
        run = self.runs[run_id]
        if cursor is None:
            return list(run["events"])
        cursor_int = int(cursor)
        return [event for event in run["events"] if int(event["cursor"]) > cursor_int]

    def set_run_complete(self, run_id: UUID) -> None:
        self.runs[run_id]["status"] = "completed"

    def to_sse_block(self, event: dict[str, Any]) -> str:
        import json

        payload = json.dumps(event, default=str)
        return (
            f"id: {event['cursor']}\nevent: {event['event_type']}\ndata: {payload}\n\n"
        )

    def write_sse_sample(self, run_id: UUID) -> str:
        run = self.runs[run_id]
        output_dir = Path("artifacts/sse")
        output_dir.mkdir(parents=True, exist_ok=True)
        sample_text = "".join(self.to_sse_block(event) for event in run["events"])

        run_output_path = output_dir / f"run_{run_id}.txt"
        run_output_path.write_text(
            sample_text,
            encoding="utf-8",
        )

        sample_output_path = output_dir / "sample_output.txt"
        if not sample_output_path.exists():
            sample_output_path.write_text(sample_text, encoding="utf-8")

        run["sse_sample_path"] = str(run_output_path)
        return str(run_output_path)


runtime = SwarmRuntime()
