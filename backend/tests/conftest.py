import pytest


@pytest.fixture(autouse=True)
def _skip_weave_init(monkeypatch):
    """Prevent Weave from connecting to W&B during tests."""
    monkeypatch.setattr("app.main.init_weave", lambda: None)
