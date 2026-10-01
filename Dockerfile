# Image unique du site : le front Angular est compilé, puis servi par l'API FastAPI
# (même origine → pas de CORS, cookie de session simple). Utilisé par Railway.

# ── 1. Front Angular ─────────────────────────────────────────────────────────
FROM node:24-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

# ── 2. API + front compilé ───────────────────────────────────────────────────
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static
WORKDIR /app
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api/app ./app
COPY --from=frontend /frontend/dist/lilium/browser ./static

# Railway fournit $PORT ; --proxy-headers : l'appli est derrière le proxy HTTPS de Railway.
CMD ["sh", "-c", "uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
