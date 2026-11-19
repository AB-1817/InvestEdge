#!/usr/bin/env bash
# ==============================================================================
# InvestEdge — Google Cloud Run Production Deployment Script
# ==============================================================================
# Deploys InvestEdge backend to GCP Cloud Run with:
#  - Artifact Registry image repository
#  - Secret Manager integration for API keys
#  - Auto-scaling (min: 0, max: 10, concurrency: 80, timeout: 300s)
#  - Configurable CORS origins & resource limits
# ==============================================================================

set -euo pipefail

# ── Configuration & Defaults ──────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-investedge-backend}"
REPO_NAME="${GCP_REPO_NAME:-investedge-repo}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
CONCURRENCY="${CONCURRENCY:-80}"
TIMEOUT="${TIMEOUT:-300s}"
MEMORY="${MEMORY:-1Gi}"
CPU="${CPU:-1}"
CORS_ORIGINS="${CORS_ORIGINS:-https://invest-edge-eight.vercel.app,http://localhost:5173}"

if [ -z "$PROJECT_ID" ]; then
  echo "[-] ERROR: GCP_PROJECT_ID is not set and no active gcloud project found."
  echo "    Set it via: export GCP_PROJECT_ID=your-gcp-project-id"
  exit 1
fi

IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

echo "=================================================================="
echo " Deploying InvestEdge Backend to Google Cloud Run"
echo " Project:       ${PROJECT_ID}"
echo " Region:        ${REGION}"
echo " Service:       ${SERVICE_NAME}"
echo " Image Target:  ${IMAGE_URL}"
echo " Min Instances: ${MIN_INSTANCES} | Max Instances: ${MAX_INSTANCES}"
echo " Concurrency:   ${CONCURRENCY}  | Timeout: ${TIMEOUT}"
echo " Memory:        ${MEMORY}       | CPU: ${CPU}"
echo "=================================================================="

# 1. Enable required GCP APIs
echo "[+] Enabling required GCP services..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  --project="${PROJECT_ID}"

# 2. Ensure Artifact Registry repository exists
echo "[+] Checking Artifact Registry repository '${REPO_NAME}'..."
if ! gcloud artifacts repositories describe "${REPO_NAME}" --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[+] Creating Artifact Registry repository '${REPO_NAME}'..."
  gcloud artifacts repositories create "${REPO_NAME}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="InvestEdge Docker container repository" \
    --project="${PROJECT_ID}"
fi

# 3. Build & push container image using Cloud Build
echo "[+] Submitting build to Cloud Build..."
gcloud builds submit \
  --tag="${IMAGE_URL}" \
  --project="${PROJECT_ID}" \
  ./backend

# 4. Assemble Secret Manager references if secrets exist
SECRETS_ARGS=()
for secret in GROQ_API_KEY GROQ_API_KEY_2 GOOGLE_API_KEY LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY RAG_ADMIN_TOKEN; do
  if gcloud secrets describe "${secret}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    SECRETS_ARGS+=("${secret}=${secret}:latest")
  else
    echo "[!] Notice: Secret '${secret}' not found in Secret Manager; skipping secret binding."
  fi
done

SECRETS_FLAG=""
if [ ${#SECRETS_ARGS[@]} -gt 0 ]; then
  IFS=','
  SECRETS_FLAG="--set-secrets=${SECRETS_ARGS[*]}"
  unset IFS
fi

# 5. Deploy to Cloud Run
echo "[+] Deploying service to Cloud Run..."
DEPLOY_CMD=(
  gcloud run deploy "${SERVICE_NAME}"
  --image="${IMAGE_URL}"
  --platform=managed
  --region="${REGION}"
  --project="${PROJECT_ID}"
  --allow-unauthenticated
  --min-instances="${MIN_INSTANCES}"
  --max-instances="${MAX_INSTANCES}"
  --concurrency="${CONCURRENCY}"
  --timeout="${TIMEOUT}"
  --memory="${MEMORY}"
  --cpu="${CPU}"
  --set-env-vars="CORS_ORIGINS=${CORS_ORIGINS},PORT=8000"
)

if [ -n "$SECRETS_FLAG" ]; then
  DEPLOY_CMD+=("${SECRETS_FLAG}")
fi

"${DEPLOY_CMD[@]}"

# 6. Retrieve Service URL and verify health
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --platform=managed --region="${REGION}" --project="${PROJECT_ID}" --format="value(status.url)")

echo "=================================================================="
echo "[+] SUCCESS: Service deployed successfully!"
echo "    Service URL: ${SERVICE_URL}"
echo "    Health check: curl ${SERVICE_URL}/healthz"
echo "=================================================================="

