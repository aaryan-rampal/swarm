import weave

from app.config import get_settings


_WEAVE_INITIALIZED = False


def init_weave() -> None:
    global _WEAVE_INITIALIZED

    if _WEAVE_INITIALIZED:
        return

    settings = get_settings()
    weave.init(settings.weave_project)
    _WEAVE_INITIALIZED = True
