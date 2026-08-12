FROM python:3.11-slim

# 3.11 matches the local conda env this was verified against, rather than
# tracking whatever :slim resolves to today.

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run injects PORT and is free to choose something other than 8080.
# Hardcoding it worked only by coincidence.
ENV PORT=8080
EXPOSE 8080

# Run as a non-root user; the image holds no secrets (see .dockerignore) but
# there is no reason for the process to have root either.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser

# Shell form so $PORT expands. One worker on purpose: a run is a long,
# stateful, rate-limited sequence of model calls, and concurrency here would
# multiply 429s rather than throughput.
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1
