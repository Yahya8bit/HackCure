from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import api_clinic, api_patient
from .db import Base, engine, ensure_columns
from .security import rate_limited


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # ponytail: create_all instead of migrations; add Alembic once schema stabilises.
    from . import models  # noqa: F401  (registers tables)
    Base.metadata.create_all(engine)
    ensure_columns()
    yield


app = FastAPI(title="Nawba API", version="0.1.0", lifespan=lifespan)
app.include_router(api_patient.router)
app.include_router(api_clinic.router)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    client = request.headers.get("x-real-ip") or (request.client.host if request.client else "?")
    if request.url.path != "/health" and rate_limited(client):
        return JSONResponse({"detail": "Too many requests"}, status_code=429)
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok"}
