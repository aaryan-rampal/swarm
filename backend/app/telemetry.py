import logging

import weave

from app.config import get_settings

logger = logging.getLogger(__name__)

_WEAVE_INITIALIZED = False


def init_weave() -> None:
    global _WEAVE_INITIALIZED

    if _WEAVE_INITIALIZED:
        return

    settings = get_settings()
    try:
        weave.init(settings.weave_project)
        _WEAVE_INITIALIZED = True
    except Exception as exc:
        logger.warning("Weave init failed (continuing without tracing): %s", exc)
        _WEAVE_INITIALIZED = False
