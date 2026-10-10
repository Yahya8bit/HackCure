import os
import tempfile

# Fresh SQLite file per test session; must be set before nawba is imported.
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "ZGVtby1rZXktMzItYnl0ZXMtLWNoYW5nZS1tZS0hISE=")
os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"
