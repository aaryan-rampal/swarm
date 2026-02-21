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
    except Exception:
        logger.warning("Weave init failed — running without trace capture", exc_info=True)
