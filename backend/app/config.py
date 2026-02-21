from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "OmniTrace Backend"
    app_env: str = "dev"

    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        alias="OPENROUTER_BASE_URL",
    )
    openrouter_model: str = Field(
        default="openai/gpt-4o-mini", alias="OPENROUTER_MODEL"
    )

    openrouter_site_url: str = Field(
        default="http://localhost:8000", alias="OPENROUTER_SITE_URL"
    )
    openrouter_site_name: str = Field(
        default="OmniTrace Local Test", alias="OPENROUTER_SITE_NAME"
    )

    weave_project: str = Field(default="omnitrace-dev", alias="WEAVE_PROJECT")
    brainstorming_skill_path: str = Field(
        default="~/.config/opencode/skills/superpowers/brainstorming/SKILL.md",
        alias="BRAINSTORMING_SKILL_PATH",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.brainstorming_skill_path = str(
        Path(settings.brainstorming_skill_path).expanduser()
    )
    return settings
