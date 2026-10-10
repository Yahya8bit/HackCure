"""Passwords, tokens, encryption, rate limiting — stdlib + `cryptography` only."""
import base64
import hashlib
import hmac
import json
import os
import time
from collections import defaultdict, deque

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .settings import RATE_LIMIT_PER_MINUTE, TOKEN_TTL_SECONDS, encryption_key, secret_key


# --- passwords: scrypt (memory-hard, in stdlib) --------------------------------
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


# --- tokens: HMAC-SHA256 signed payload with expiry (a minimal JWT equivalent) --
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_token(user_id: int, role: str) -> str:
    body = _b64(json.dumps({"uid": user_id, "role": role, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    sig = _b64(hmac.new(secret_key(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str) -> dict | None:
    try:
        body, sig = token.split(".")
        expected = _b64(hmac.new(secret_key(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_unb64(body))
        return payload if payload["exp"] > time.time() else None
    except (ValueError, KeyError):
        return None


# --- encryption at rest: AES-256-GCM, random 96-bit nonce per value -----------
def encrypt(plaintext: str) -> str:
    nonce = os.urandom(12)
    return _b64(nonce + AESGCM(encryption_key()).encrypt(nonce, plaintext.encode(), None))


def decrypt(token: str) -> str:
    raw = _unb64(token)
    return AESGCM(encryption_key()).decrypt(raw[:12], raw[12:], None).decode()


# --- rate limiting: sliding 60 s window per client key ------------------------
# ponytail: in-process memory; per-worker limit. Move to Redis if we run >1 worker.
_hits: dict[str, deque] = defaultdict(deque)


def rate_limited(key: str, limit: int = RATE_LIMIT_PER_MINUTE) -> bool:
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False
