# Kubernetes Deployment Guide for Flux ETL

## Overview

This directory contains production-grade Kubernetes manifests for deploying Flux ETL on any Kubernetes cluster (EKS, GKE, AKS, on-prem).

## Files

- `flux-production.yaml` - Complete production stack (API, Lake, PostgreSQL, networking)
- `flux-dev.yaml` - Development/staging environment (simpler, fewer replicas)
- `monitoring.yaml` - Prometheus, Grafana, Alerting stack
- `backup.yaml` - PostgreSQL backup strategy + retention

## Prerequisites

```bash
# Required: kubectl configured for your cluster
kubectl config current-context

# Required: StorageClass for persistent volumes
kubectl get storageclasses

# Required: Ingress controller (nginx-ingress)
kubectl get deployment -n ingress-nginx

# Optional but recommended: `cert-manager` for TLS
kubectl get deployment cert-manager -n cert-manager

# Optional: KEDA for advanced scaling
kubectl get deployment keda-operator -n keda
```

## Quick Start (5 minutes)

### 1. Create namespace and secrets

```bash
# Create namespace
kubectl create namespace flux-prod

# Create PostgreSQL secrets (CHANGE THESE!)
kubectl create secret generic postgres-secrets \
  --from-literal=username=flux_app \
  --from-literal=password=YOUR_VERY_SECURE_PASSWORD_HERE \
  -n flux-prod

# Create JWT/OIDC secrets
kubectl create secret generic jwt-secrets \
  --from-literal=jwt_secret=YOUR_JWT_SECRET \
  --from-literal=oidc_client_id=YOUR_OIDC_CLIENT_ID \
  --from-literal=oidc_client_secret=YOUR_OIDC_SECRET \
  -n flux-prod
```

### 2. Deploy the stack

```bash
# Deploy all resources
kubectl apply -f flux-production.yaml

# Wait for rollout
kubectl rollout status deployment/flux-api -n flux-prod --timeout=5m
kubectl rollout status deployment/flux-lake -n flux-prod --timeout=5m
kubectl rollout status statefulset/flux-postgres -n flux-prod --timeout=10m
```

### 3. Initialize database

```bash
# Port-forward to PostgreSQL
kubectl port-forward svc/flux-postgres 5432:5432 -n flux-prod &

# Run migrations
psql -h localhost -U flux_app -d flux_production < ../demo/apps/lake/schema_checkpoints.sql

# Verify
psql -h localhost -U flux_app -d flux_production -c "\\dt flux.*"
```

### 4. Verify deployment

```bash
# Check pods are running
kubectl get pods -n flux-prod

# Check services
kubectl get svc -n flux-prod

# Port-forward API to test
kubectl port-forward svc/flux-api 8080:8080 -n flux-prod

# In another terminal:
curl http://localhost:8080/health/ready
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Load Balancer (Ingress Controller - NGINX)                 │
└────────────┬────────────────────────────────────────────────┘
             │
      ┌──────▼──────┐
      │  flux-api   │  ← 3 replicas (HPA: 3-10)
      │  (Express)  │     Auto-scales on CPU/memory
      └──────┬──────┘
             │
      ┌──────▼──────────────┬──────────────┐
      │ PostgreSQL Master   │ Replicas (2) │
      │ + Checkpoints       │              │
      │ + Audit Log         │              │
      └─────┬───────────────┴──────────────┘
            │
      ┌─────▼──────┐
      │  flux-lake │  ← 1-5 replicas (HPA: CPU-based)
      │  (Python)  │     High-volume ETL worker
      └────────────┘
```

## Scaling

### Horizontal Pod Autoscaling (HPA)

API scales based on metrics:
- CPU utilization > 70% → scale up
- CPU utilization < 50% → scale down
- Min: 3 pods | Max: 10 pods

Lake worker scales based on CPU:
- CPU utilization > 75% → scale up
- Min: 1 pod | Max: 5 pods

```bash
# Monitor HPA status
kubectl get hpa -n flux-prod -w

# Manual scaling (overrides HPA)
kubectl scale deployment flux-api --replicas 5 -n flux-prod
```

### Vertical Pod Autoscaling (VPA)

To enable resource requests/limits optimization (optional):

```bash
# Install VPA
https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler

# VPA will recommend resource adjustments
kubectl get vpa -n flux-prod
```

## Monitoring & Observability

### Prometheus Metrics

Flux exports Prometheus metrics on port 8080:

```bash
# Scrape metrics
kubectl port-forward svc/flux-api 9090:9090 -n flux-prod

# Common metrics:
curl http://localhost:9090/metrics | grep flux_
```

### Logs & Tracing

```bash
# View pod logs
kubectl logs -f deployment/flux-api -n flux-prod --all-containers --timestamps

# Follow logs across all pods
kubectl logs -f deployment/flux-api -n flux-prod -l app=flux-api

# View events
kubectl get events -n flux-prod --sort-by='.lastTimestamp'
```

## Security

### Network Policies

By default:
- ✅ Pods in flux-prod can talk to each other
- ✅ Traffic to DNS (53) allowed
- ❌ No ingress from other namespaces
- ❌ No egress outside cluster (except DNS)

To allow ingress from external traffic:
```yaml
ingress:
- from:
  - namespaceSelector: {}  # Allow from all namespaces
  ports:
  - protocol: TCP
    port: 8080
```

### Pod Security Context

All pods run as:
- **Non-root user (1000)**
- **Read-only root filesystem**
- **No privilege escalation**

### Secrets Management

Secrets are stored as Kubernetes Secrets (etcd encrypted):
- Use `sealed-secrets` or `vault` for additional security
- Never commit secrets to git
- Rotate monthly

## Disaster Recovery

### Backup PostgreSQL

```bash
# Manual backup
kubectl exec -it flux-postgres-0 -n flux-prod -- \
  pg_dump -U flux_app flux_production > backup.sql

# Restore
kubectl exec -it flux-postgres-0 -n flux-prod -- \
  psql -U flux_app flux_production < backup.sql
```

### Restore from Backup

```bash
# Delete current deployment
kubectl delete pvc --all -n flux-prod

# Re-apply manifests
kubectl apply -f flux-production.yaml

# Restore data
# (See backup.yaml for automated backups)
```

## Troubleshooting

### Pod not starting?

```bash
# Check pod status
kubectl describe pod flux-api-XXX -n flux-prod

# Check events
kubectl get events -n flux-prod --sort-by='.lastTimestamp'

# Check logs
kubectl logs flux-api-XXX -n flux-prod
```

### Database connection failed?

```bash
# Verify PostgreSQL is running
kubectl get pods -n flux-prod | grep postgres

# Port-forward and test connection
kubectl port-forward svc/flux-postgres 5432 -n flux-prod
psql -h localhost -U flux_app -d flux_production -c "SELECT version();"
```

### API returning 500 errors?

```bash
# Check API logs
kubectl logs -f deployment/flux-api -n flux-prod

# Check database connectivity
kubectl exec -it deployment/flux-api -n flux-prod -- \
  nc -zv flux-postgres 5432

# Check environment variables
kubectl exec deployment/flux-api -n flux-prod -- env | grep DATABASE
```

## Production Checklist

- [ ] Secrets stored securely (not in git)
- [ ] TLS certificates configured (cert-manager)
- [ ] PostgreSQL backed up daily (backup.yaml)
- [ ] Monitoring/alerting enabled (monitoring.yaml)
- [ ] HPA configured and tested
- [ ] Network policies verified
- [ ] Pod disruption budgets created
- [ ] Resource requests/limits set
- [ ] Liveness and readiness probes working
- [ ] Audit logging enabled
- [ ] RBAC policies in place
- [ ] Ingress rate limiting enabled

## Next Steps

1. **Deploy monitoring** - `kubectl apply -f monitoring.yaml`
2. **Configure backups** - See `backup.yaml`
3. **Set up alerting** - Define AlertRules for Prometheus
4. **Enable audit logging** - `auditPolicy.yaml`
5. **Add CI/CD** - ArgoCD or Flux for GitOps

---

See CTO_TECHNICAL_REVIEW.md §8 for architecture post-refactoring.
