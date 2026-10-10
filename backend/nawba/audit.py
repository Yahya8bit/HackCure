"""Append-only, hash-chained audit log.

Each entry stores the hash of the previous entry. Changing or deleting any row
breaks every hash after it, which `verify_chain` (and scripts/verify_audit.py)
detects. The API exposes no update or delete for this table.
"""
import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEntry

GENESIS = "0" * 64


def entry_hash(prev_hash: str, ts: str, actor: str, action: str, target: str, reason: str) -> str:
    body = json.dumps([ts, actor, action, target, reason], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256((prev_hash + body).encode()).hexdigest()


def append(db: Session, actor: str, action: str, target: str, reason: str = "") -> AuditEntry:
    # ponytail: read-last-then-insert; under concurrent writers the unique hash
    # constraint rejects a fork. Add a DB advisory lock if audit volume grows.
    last = db.scalars(select(AuditEntry).order_by(AuditEntry.id.desc()).limit(1)).first()
    prev = last.hash if last else GENESIS
    ts = datetime.now(timezone.utc).isoformat()
    entry = AuditEntry(ts=ts, actor=actor, action=action, target=target, reason=reason,
                       prev_hash=prev, hash=entry_hash(prev, ts, actor, action, target, reason))
    db.add(entry)
    db.commit()
    return entry


def verify_chain(db: Session) -> tuple[bool, int, str]:
    """Returns (ok, entries_checked, message)."""
    prev = GENESIS
    n = 0
    for e in db.scalars(select(AuditEntry).order_by(AuditEntry.id)):
        n += 1
        if e.prev_hash != prev:
            return False, n, f"entry {e.id}: prev_hash does not match previous entry"
        if e.hash != entry_hash(e.prev_hash, e.ts, e.actor, e.action, e.target, e.reason):
            return False, n, f"entry {e.id}: content was modified"
        prev = e.hash
    return True, n, "chain intact"
