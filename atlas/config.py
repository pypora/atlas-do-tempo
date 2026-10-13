"""Configuration loaded once at startup; secrets stay outside the repository."""

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _value(name: str) -> str | None:
    """Read a setting directly or from a Docker secret mounted as a file."""
    path = os.environ.get(f"{name}_FILE")
    if path:
        return Path(path).read_text(encoding="utf-8").strip()
    return os.environ.get(name)


@dataclass(frozen=True)
class Settings:
    database_url: str
    gateway_token: str | None
    public_origin: str
    development: bool = False
    public_dir: Path = ROOT / "public"
    seed_file: Path = ROOT / "seed.json"
    migration_dir: Path = ROOT / "migrations"

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = _value("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL or DATABASE_URL_FILE is required")
        development = os.environ.get("ATLAS_ENV") == "development"
        gateway_token = _value("GATEWAY_TOKEN")
        if not development and not gateway_token:
            raise ValueError("GATEWAY_TOKEN or GATEWAY_TOKEN_FILE is required")
        origin = os.environ.get("PUBLIC_ORIGIN", "http://127.0.0.1:8084" if development else "")
        if not origin or not origin.startswith(("https://", "http://")):
            raise ValueError("PUBLIC_ORIGIN must be an absolute HTTP(S) origin")
        if not development and not origin.startswith("https://"):
            raise ValueError("PUBLIC_ORIGIN must use HTTPS in production")
        return cls(database_url, gateway_token, origin.rstrip("/"), development)
