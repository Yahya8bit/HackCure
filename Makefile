PY = .venv/bin/python
export SECRET_KEY ?= test-secret
export ENCRYPTION_KEY ?= ZGVtby1rZXktMzItYnl0ZXMtLWNoYW5nZS1tZS0hISE=

.PHONY: setup test
setup:
	python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt

test:
	cd backend && ../$(PY) -m pytest -q
