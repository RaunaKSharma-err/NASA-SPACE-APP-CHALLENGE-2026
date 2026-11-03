from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MARS_", env_file=".env", extra="ignore")

    app_name: str = "Mars Explorer API"
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:5173"]  # Vite default
    database_url: str = "sqlite:///./mars.db"  # reserved; unused until models exist
    metadata_dir: Path = Path("../data/metadata")
    processed_dir: Path = Path("../data/processed")  # <region_id>/manifest.json packages
    # Enables the clearly-labelled SYNTHETIC demo terrain. Never enable in a real demo of NASA data.
    allow_synthetic_fixtures: bool = False
    # AI provider: "ollama" (local, default), "openrouter" (cloud, requires API key), or "none"
    ai_provider: str = "ollama"
    # Ollama (local inference) settings
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:0.5b"
    ollama_timeout: int = 120
    # OpenRouter (optional cloud) settings — disabled unless API key is set
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_timeout: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
