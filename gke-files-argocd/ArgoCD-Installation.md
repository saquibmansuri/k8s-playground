# 🚀 Argo CD Setup on K8s (Example - GKE Autopilot)

This guide walks you through **installing**, **accessing**, and **exposing** Argo CD on a **Google Kubernetes Engine (GKE Autopilot)** cluster.  
Official doc - https://argo-cd.readthedocs.io/en/stable/getting_started/

---

## 🧩 1. Create Namespace

```bash
kubectl create namespace argocd
```

---

## ⚙️ 2. Install Argo CD

Apply the official stable Argo CD manifest:

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

This installs all necessary components including:
- Application Controller
- Repo Server
- Redis
- Dex (SSO)
- API Server / UI

---

## 🔍 3. Verify Installation

Check that all resources were created successfully:

```bash
kubectl get all -n argocd
```

You should see pods and services like:
```
argocd-server
argocd-repo-server
argocd-application-controller
argocd-dex-server
argocd-redis
```

> Note: If you’re on **GKE Autopilot**, you may see warnings about resource defaults — that’s normal and handled automatically.

---

## 🌐 4. Accessing the Argo CD UI

By default, `argocd-server` is exposed as a **ClusterIP**, meaning it’s only accessible inside the cluster.

You have three main options to access it externally:

---

### 🔹 Option 1 — Port Forward (for local testing)

Run:
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Then open:
👉 [https://localhost:8080](https://localhost:8080)

> ⚠️ You may see a certificate warning — it’s safe to ignore for testing.

#### Get Admin Password
```bash
# for linux shells
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d
# For windows cmd, you have to decode later
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}"
```

**Login:**
- Username: `admin`
- Password: *(decoded output)*

---

### 🔹 Option 2 — Expose as LoadBalancer (for cloud clusters)

Convert the `argocd-server` Service to a LoadBalancer:

```bash
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'
```

Wait a few moments, then check:
```bash
kubectl get svc -n argocd argocd-server
```

You’ll see an external IP:
```
NAME             TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)         AGE
argocd-server    LoadBalancer   10.12.4.10     35.203.145.89    80:32380/TCP    5m
```

Now open:
👉 `https://<EXTERNAL-IP>`

---

### 🔹 Option 3 — Ingress (for production)

If you already have an ingress controller (NGINX, GKE Ingress, etc.), create an ingress resource:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
spec:
  rules:
  - host: argocd.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: argocd-server
            port:
              number: 443
```

Then map your DNS (e.g., `argocd.example.com`) to the ingress IP.

---

## 🧠 5. Common Commands

Check all Argo CD resources:
```bash
kubectl get all -n argocd
```

View logs for troubleshooting:
```bash
kubectl logs -n argocd deploy/argocd-server
```

Check rollout status:
```bash
kubectl rollout status deploy/argocd-server -n argocd
```

---

## ✅ Summary

| Method | Command | Access URL | When to Use |
|:--|:--|:--|:--|
| **Port-forward** | `kubectl port-forward svc/argocd-server -n argocd 8080:443` | https://localhost:8080 | Local testing |
| **LoadBalancer** | `kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'` | https://EXTERNAL-IP | GKE Autopilot / Cloud setup |
| **Ingress** | Create ingress YAML | https://yourdomain.com | Production |

---

💡 **Tips**
- Use `kubectl get svc -n argocd` to confirm your service type and external IP.
- Argo CD UI listens on **port 443** (HTTPS).
- For GKE Autopilot, all resource defaults (CPU/memory) are automatically managed.

---

🎯 You now have Argo CD up and running — ready to manage GitOps deployments on your GKE Autopilot cluster!
