# InvestEdge — Google Cloud Run Deployment Guide

This guide documents deploying the production-grade InvestEdge FastAPI backend to **Google Cloud Run**, with serverless auto-scaling, **Google Secret Manager** for zero-leak credential storage, and **Google Artifact Registry** for container storage.

> **Status:** Deployment scripts and configuration verified syntactically. Live Cloud Run provisioning is **NOT VERIFIED** without live GCP account credentials (per Rule 5).

---

## 1. Architecture Overview

```
Frontend (Vercel SPA)
       │ HTTPS / CORS
       ▼
Google Cloud Run (investedge-backend)
   ├── Ingress: Auto TLS, HTTP/2, auto-scaling (0 → 10 instances)
   ├── Memory: 1Gi | CPU: 1 | Concurrency: 80 | Timeout: 300s
   ├── Healthchecks: GET /healthz (liveness), GET /readyz (readiness)
   └── Secret Manager Bindings:
         ├── GROQ_API_KEY
         ├── GROQ_API_KEY_2
         ├── GOOGLE_API_KEY (Gemini embeddings & ADK)
         ├── LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY
         └── RAG_ADMIN_TOKEN
```

---

## 2. Prerequisites

1. [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install) installed.
2. Authenticate to GCP:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
3. Enable required GCP service APIs:
   ```bash
   gcloud services enable \
     run.googleapis.com \
     artifactregistry.googleapis.com \
     secretmanager.googleapis.com \
     cloudbuild.googleapis.com
   ```

---

## 3. Secret Manager Setup

Store all production keys securely in Secret Manager so they are mounted into the Cloud Run container at runtime without appearing in plain text or environment logs:

```bash
# 1. Groq Keys
echo -n "gsk_your_groq_key" | gcloud secrets create GROQ_API_KEY --data-file=-
echo -n "gsk_your_second_groq_key" | gcloud secrets create GROQ_API_KEY_2 --data-file=-

# 2. Google Gemini / Vertex Key (for Embeddings & Agents)
echo -n "AIzaSy_your_gemini_key" | gcloud secrets create GOOGLE_API_KEY --data-file=-

# 3. Langfuse Observability Keys (optional, Phase 4)
echo -n "pk-lf-..." | gcloud secrets create LANGFUSE_PUBLIC_KEY --data-file=-
echo -n "sk-lf-..." | gcloud secrets create LANGFUSE_SECRET_KEY --data-file=-

# 4. RAG Ingest Admin Token (Phase 2)
echo -n "super-secret-admin-token" | gcloud secrets create RAG_ADMIN_TOKEN --data-file=-
```

Grant Cloud Run's default service account permission to read these secrets:
```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

for secret in GROQ_API_KEY GROQ_API_KEY_2 GOOGLE_API_KEY LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY RAG_ADMIN_TOKEN; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 4. One-Click Deployment Script

Execute the provided automated deployment script:

```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"
export CORS_ORIGINS="https://invest-edge-eight.vercel.app,http://localhost:5173"

chmod +x deploy/cloudrun/deploy.sh
./deploy/cloudrun/deploy.sh
```

### Manual Step-by-Step Alternative

```bash
# 1. Create Docker repository in Artifact Registry
gcloud artifacts repositories create investedge-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="InvestEdge Docker images"

# 2. Build and push container image using Cloud Build
gcloud builds submit --tag us-central1-docker.pkg.dev/$PROJECT_ID/investedge-repo/investedge-backend:latest ./backend

# 3. Deploy to Cloud Run
gcloud run deploy investedge-backend \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/investedge-repo/investedge-backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --timeout 300s \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars "CORS_ORIGINS=https://invest-edge-eight.vercel.app,PORT=8000" \
  --set-secrets "GROQ_API_KEY=GROQ_API_KEY:latest,GROQ_API_KEY_2=GROQ_API_KEY_2:latest,GOOGLE_API_KEY=GOOGLE_API_KEY:latest"
```

---

## 5. Verification & Health Probes

Once deployed, query the health endpoints:

```bash
SERVICE_URL=$(gcloud run services describe investedge-backend --region=us-central1 --format="value(status.url)")

# Liveness probe
curl -f "${SERVICE_URL}/healthz"
# Expected response: {"status":"ok","service":"investedge-backend","version":"2.0.0"}

# Readiness probe
curl -f "${SERVICE_URL}/readyz"
# Expected response: {"status":"ready","database":"ok",...}
```

---

## 6. Continuous Deployment via Workload Identity Federation (WIF)

To deploy automatically from GitHub Actions without storing long-lived service account keys:

1. Create a Workload Identity Pool and Provider in GCP:
   ```bash
   gcloud iam workload-identity-pools create "github-pool" \
     --project="${PROJECT_ID}" --location="global" --display-name="GitHub Pool"

   gcloud iam workload-identity-pools providers create-oidc "github-provider" \
     --project="${PROJECT_ID}" --location="global" \
     --workload-identity-pool="github-pool" \
     --display-name="GitHub Provider" \
     --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
     --issuer-uri="https://token.actions.githubusercontent.com"
   ```

2. Bind the GitHub repository to the deployer service account:
   ```bash
   gcloud iam service-accounts add-iam-policy-binding "investedge-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
     --project="${PROJECT_ID}" \
     --role="roles/iam.workloadIdentityUser" \
     --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/AB-1817/InvestEdge"
   ```

3. Enable the deploy job in `.github/workflows/backend-ci.yml`.

---

## 7. Maintaining Render Deployment

InvestEdge remains fully compatible with Render:
- `backend/runtime.txt` specifies Python 3.11.9.
- Render Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/healthz` (or legacy `/health`)
- Environment variables: set `GROQ_API_KEY`, `CORS_ORIGINS` in Render dashboard.

