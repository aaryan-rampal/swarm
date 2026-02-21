from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import UUID

from app.swarm_runtime import runtime


def export_run_results(run_id: UUID) -> Path:
    """Write all accumulated model results to artifacts/runs/{run_id}/.

    Creates:
      - summary.json  (all models, overview)
      - {safe_model_id}_rep{N}.json  (per model+rep, full output)

    Returns the output directory path.
    """
    output_dir = Path("artifacts/runs") / str(run_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    results = runtime.get_results(run_id)

    summary_entries: list[dict[str, Any]] = []

    for key, result in results.items():
        model_id = result.get("model_id", "unknown")
        rep_index = result.get("rep_index", 0)

        safe_name = model_id.replace("/", "_")
        per_file = output_dir / f"{safe_name}_rep{rep_index}.json"
        per_file.write_text(
            json.dumps(result, indent=2, default=str),
            encoding="utf-8",
        )

        summary_entries.append({
            "model_id": model_id,
            "rep_index": rep_index,
            "status": result.get("status"),
            "latency_ms": result.get("latency_ms"),
            "chunks": result.get("chunks"),
            "usage": result.get("usage"),
            "weave_trace_id": result.get("weave_trace_id"),
            "error": result.get("error"),
            "output_file": per_file.name,
        })

    summary_path = output_dir / "summary.json"
    summary = {
        "run_id": str(run_id),
        "total": len(summary_entries),
        "completed": sum(1 for e in summary_entries if e["status"] == "completed"),
        "errored": sum(1 for e in summary_entries if e["status"] != "completed"),
        "results": summary_entries,
    }
    summary_path.write_text(
        json.dumps(summary, indent=2, default=str),
        encoding="utf-8",
    )

    return output_dir
