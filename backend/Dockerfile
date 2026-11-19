# Production-grade Dockerfile for InvestEdge Backend
# Base image: python:3.11-slim matches backend/runtime.txt
FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer outputs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    INVESTEDGE_DB_PATH=/app/data/investedge.db

WORKDIR /app

# Install security updates and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root system user and group
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/bash -m appuser

# Install dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create data directory for SQLite / local caches and set permissions
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Copy backend application source code
COPY . /app/

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose default port
EXPOSE 8000

# Container healthcheck using /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/healthz || exit 1

# Launch application with uvicorn; reads $PORT dynamically for Cloud Run & Render
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}

