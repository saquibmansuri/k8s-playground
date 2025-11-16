# Azure Application Gateway Ingress Controller (AGIC) Setup Guide

## 1. Enable AGIC on Existing AKS Cluster
1. Go to **Azure Portal → AKS Cluster → Networking → Virtual network integration**.
2. Under **Application Gateway ingress controller**, click **Manage**.
3. Check **Enable Application Gateway Ingress Controller**.
4. Choose **Create new** or **Use existing** Application Gateway.
5. Click **Save**.

> If the Application Gateway is in a different resource group, assign **Network Contributor** and **Reader** roles to the managed identity `ingressapplicationgateway-{AKSNAME}`.

---

## 2. Create Ingress with AGIC

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-service
  namespace: playground
  annotations:
    kubernetes.io/ingress.class: azure/application-gateway
spec:
  ingressClassName: azure-application-gateway
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service
                port:
                  number: 3000
```

Apply:
```bash
kubectl apply -f ingress.yml -n playground
```

---

## 3. Verify Setup

```bash
kubectl describe ingress ingress-service -n playground
```

✅ You should see:
```
Ingress Class: azure-application-gateway
Address: <AppGatewayPublicIP>
```

Now access your app at:
```
http://<AppGatewayPublicIP>/
```
