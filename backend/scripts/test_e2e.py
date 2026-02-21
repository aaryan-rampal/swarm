"""Quick end-to-end smoke test: 1 model, 1 rep, real OpenRouter call."""
import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.model_registry import ModelSpec
from app.swarm_orchestrator import run_swarm
from app.swarm_runtime import runtime
from app.telemetry import init_weave
from app.trace_exporter import export_run_results


async def main():
    settings = get_settings()
    print(f"OpenRouter key present: {bool(settings.openrouter_api_key)}")
    print(f"Weave project: {settings.weave_project}")

    try:
        init_weave()
        print("Weave initialized successfully")
    except Exception as e:
        print(f"Weave init skipped ({type(e).__name__}: {e})")

    model = ModelSpec(
        id="openai/gpt-4o-mini",
        name="GPT-4o-Mini",
        provider="OpenAI",
        color="#10b981",
    )

    session = runtime.create_session()
    run = runtime.create_run(session["session_id"])
    run_id = run["run_id"]
    print(f"\nRun ID: {run_id}")
    print(f"Model: {model.id}")
    print("Running 1 model x 1 rep...\n")

    results = await run_swarm(run_id, [model], reps=1)

    print(f"\n--- Results ---")
    for r in results:
        status = r.get("status", "unknown")
        latency = r.get("latency_ms", "?")
        chunks = r.get("chunks", "?")
        output_len = len(r.get("output", ""))
        error = r.get("error")
        print(f"  status={status}  latency={latency}ms  chunks={chunks}  output_chars={output_len}")
        if error:
            print(f"  ERROR: {error}")
        if output_len > 0:
            print(f"  output preview: {r['output'][:200]}...")

    output_dir = export_run_results(run_id)
    print(f"\nExported to: {output_dir}")

    summary_path = output_dir / "summary.json"
    summary = json.loads(summary_path.read_text())
    print(f"Summary: {summary['completed']}/{summary['total']} completed, {summary['errored']} errors")

    events = runtime.get_events(run_id)
    print(f"\nTotal events: {len(events)}")
    for e in events:
        print(f"  [{e['event_type']}] model_id={e.get('model_id', '-')} rep={e.get('rep_index', '-')} | {e['content'][:80]}")


if __name__ == "__main__":
    asyncio.run(main())
