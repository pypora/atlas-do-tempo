FROM python:3.14-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY atlas ./atlas
COPY migrations ./migrations
COPY public ./public
COPY seed.json ./seed.json
RUN pip install . && useradd --system --uid 10001 --home /nonexistent atlas

USER atlas
EXPOSE 8084
CMD ["uvicorn", "atlas.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8084", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
