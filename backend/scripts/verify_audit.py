"""Verify the hash chain of the audit log. Exit code 0 = intact, 1 = tampered.
Usage (inside the api container):  python -m scripts.verify_audit"""
import sys

from nawba.audit import verify_chain
from nawba.db import SessionLocal

if __name__ == "__main__":
    with SessionLocal() as db:
        ok, n, msg = verify_chain(db)
    print(f"{'OK' if ok else 'TAMPERED'}: {n} entries checked — {msg}")
    sys.exit(0 if ok else 1)
