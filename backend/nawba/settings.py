"""Settings: secrets come ONLY from the environment; clinical values ONLY from
config/clinical_rules.yaml."""
import base64
import os
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
RULES_PATH = Path(os.environ.get("NAWBA_RULES", ROOT / "config" / "clinical_rules.yaml"))


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"Missing required environment variable {name} (see .env.example)")
    return value


DATABASE_URL = env("DATABASE_URL", "sqlite:///./nawba.db")
TOKEN_TTL_SECONDS = int(env("TOKEN_TTL_SECONDS", "28800"))
RATE_LIMIT_PER_MINUTE = int(env("RATE_LIMIT_PER_MINUTE", "300"))


@lru_cache
def secret_key() -> bytes:
    return env("SECRET_KEY").encode()


@lru_cache
def encryption_key() -> bytes:
    key = base64.b64decode(env("ENCRYPTION_KEY"))
    if len(key) != 32:
        raise RuntimeError("ENCRYPTION_KEY must be 32 bytes, base64-encoded (AES-256)")
    return key


@lru_cache
def rules() -> dict:
    return yaml.safe_load(RULES_PATH.read_text(encoding="utf-8"))
