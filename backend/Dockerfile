FROM python:3.12.8-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -r nawba && chown -R nawba /app
USER nawba
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"
CMD ["sh", "-c", "python -m scripts.seed && python -m scripts.train_risk && uvicorn nawba.main:app --host 0.0.0.0 --port 8000 --workers 4"]
