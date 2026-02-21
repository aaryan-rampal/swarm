from __future__ import annotations

import asyncio
import json
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
        run: dict[str, Any] = {
            "run_id": run_id,
            "session_id": session_id,
            "status": "running",
            "events": [],
            "cursor": 0,
            "results": {},
            "queue": asyncio.Queue(),
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
        model_id: str | None = None,
        rep_index: int | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        run = self.runs[run_id]
        run["cursor"] += 1
        event: dict[str, Any] = {
            "event_id": f"evt_{run['cursor']:04d}",
            "cursor": str(run["cursor"]),
            "run_id": run_id,
            "session_id": run["session_id"],
            "agent_id": agent_id,
            "event_type": event_type,
            "phase": phase,
            "content": content,
            "model": model,
            "model_id": model_id,
            "rep_index": rep_index,
            "timestamp": now_iso(),
            "weave": weave,
        }
        event.update(extra)
        run["events"].append(event)

        queue: asyncio.Queue[dict[str, Any]] = run["queue"]
        queue.put_nowait(event)

        return event

    def set_model_result(
        self,
        run_id: UUID,
        model_id: str,
        rep_index: int,
        result: dict[str, Any],
    ) -> None:
        key = f"{model_id}::{rep_index}"
        self.runs[run_id]["results"][key] = result

    def get_results(self, run_id: UUID) -> dict[str, dict[str, Any]]:
        return dict(self.runs[run_id]["results"])

    def get_events(
        self,
        run_id: UUID,
        cursor: str | None = None,
        model_id: str | None = None,
    ) -> list[dict[str, Any]]:
        run = self.runs[run_id]
        events = run["events"]
        if cursor is not None:
            cursor_int = int(cursor)
            events = [e for e in events if int(e["cursor"]) > cursor_int]
        if model_id is not None:
            events = [e for e in events if e.get("model_id") == model_id]
        return list(events)

    def set_run_complete(self, run_id: UUID) -> None:
        self.runs[run_id]["status"] = "completed"
        queue: asyncio.Queue[dict[str, Any]] = self.runs[run_id]["queue"]
        queue.put_nowait({"_sentinel": True})

    def to_sse_block(self, event: dict[str, Any]) -> str:
        payload = json.dumps(event, default=str)
        return (
            f"id: {event['cursor']}\nevent: {event['event_type']}\ndata: {payload}\n\n"
        )

    def write_sse_sample(self, run_id: UUID) -> str:
        run = self.runs[run_id]
        output_dir = Path("artifacts/sse")
        output_dir.mkdir(parents=True, exist_ok=True)
        for existing_file in output_dir.glob("*.txt"):
            existing_file.unlink()

        sample_text = "".join(self.to_sse_block(event) for event in run["events"])
        sample_output_path = output_dir / "sample_output.txt"
        sample_output_path.write_text(sample_text, encoding="utf-8")

        run["sse_sample_path"] = str(sample_output_path)
        return str(sample_output_path)


runtime = SwarmRuntime()
