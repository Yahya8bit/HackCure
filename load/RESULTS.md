# Load test results (k6 0.55.0, `load/sync.js`) — measured 2026-10-10

Conditions: one laptop (16 CPU threads, 31 GB RAM, Linux), full `docker compose` stack,
PostgreSQL 16.6, requests go through nginx TLS → FastAPI. Each iteration = one phone syncing
a batch of 5 queued entries (4 dose confirmations + 1 seizure); every sync also re-runs the alert
engine for that patient. Per-IP rate limit raised to 1,000,000/min for runs 1–3 because all
virtual phones share one IP. Fresh seeded database unless stated.

| run | setup | VUs / duration | median | p95 | p99 | max | throughput | failed |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 uvicorn worker, full history loaded, 3 accounts (all writes on 3 patients) | 50 / 60 s | 2.64 s | 4.41 s | 4.75 s | 5.21 s | 17.2 req/s | 0 % |
| 2 | 4 workers, 120-day history window, same 3 accounts, DB NOT reset (hot patients kept growing) | 50 / 60 s | 1.18 s | 5.55 s | 8.28 s | 12.53 s | 26.4 req/s | 0 % |
| 3 | 4 workers, 120-day window, 50 accounts spread over 150 patients, fresh DB | 50 / 60 s | **410.55 ms** | **751.39 ms** | 906.97 ms | 1.21 s | 112.1 req/s | 0 % |
| 4 | as run 3 but DEFAULT rate limit (300/min per worker) | 10 / 20 s | — | — | — | — | 1327.8 req/s | 95.96 % (HTTP 429, by design) |

Run 3 is the realistic scenario and the number we report. Run 4 shows the rate limiter
rejecting a flood from one IP. Reproduce:

    docker compose down && docker volume rm epilipsy_dbdata
    LOADTEST_ACCOUNTS=1 RATE_LIMIT_PER_MINUTE=1000000 docker compose up -d --build --wait
    docker run --rm --network host -v ./load:/load grafana/k6:0.55.0 run /load/sync.js
    # afterwards reset again WITHOUT LOADTEST_ACCOUNTS so the demo data is clean
