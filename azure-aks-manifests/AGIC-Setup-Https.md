# Enabling HTTPS in AKS with Azure Application Gateway Ingress Controller (AGIC)

This guide explains two ways to enable HTTPS for services exposed via AGIC in AKS.

---

## 🔹 Method 1: Manual Certificate + Kubernetes Secret

### Steps

1. **Generate a self-signed certificate** (for testing or internal use)
   ```bash
   openssl req -x509 -nodes -days 365      -newkey rsa:2048      -out my-cert.crt      -keyout my-cert.key      -subj "/CN=myapp.example.com/O=myapp"
   ```

2. **Create a Kubernetes TLS secret**
   ```bash
   kubectl create secret tls myapp-tls-secret      --cert=my-cert.crt      --key=my-cert.key      -n playground
   ```

3. **Create/Update Ingress YAML**
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: ingress-service
     namespace: playground
     annotations:
       kubernetes.io/ingress.class: azure/application-gateway
       appgw.ingress.kubernetes.io/ssl-redirect: "true"
   spec:
     ingressClassName: azure-application-gateway
     tls:
       - hosts:
           - myapp.example.com
         secretName: myapp-tls-secret
     rules:
       - host: myapp.example.com
         http:
           paths:
             - path: /
               pathType: Prefix
               backend:
                 service:
                   name: frontend-service
                   port:
                     number: 3000
   ```

4. **Apply the ingress**
   ```bash
   kubectl apply -f ingress-https.yaml
   ```

5. **Add a DNS record**
   - Create an **A record**: `myapp.example.com → <AppGatewayPublicIP>`

✅ HTTPS will now work.

⚠️ **Drawback:** Certificate must be renewed manually. You’ll need to recreate the secret when it expires.

---

## 🔹 Method 2: Auto-Renewing HTTPS via cert-manager + Let’s Encrypt

### Steps

1. **Install cert-manager**
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml
   ```

   Wait for pods to start:
   ```bash
   kubectl get pods -n cert-manager
   ```

2. **Create ClusterIssuer**
   ```yaml
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       email: you@example.com
       server: https://acme-v02.api.letsencrypt.org/directory
       privateKeySecretRef:
         name: letsencrypt-prod
       solvers:
         - http01:
             ingress:
               class: azure/application-gateway
   ```

   Apply:
   ```bash
   kubectl apply -f letsencrypt-prod-issuer.yaml
   ```

3. **Create HTTPS Ingress**
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: ingress-service
     namespace: playground
     annotations:
       kubernetes.io/ingress.class: azure/application-gateway
       cert-manager.io/cluster-issuer: letsencrypt-prod
       appgw.ingress.kubernetes.io/ssl-redirect: "true"
   spec:
     ingressClassName: azure-application-gateway
     tls:
       - hosts:
           - myapp.example.com
         secretName: myapp-tls # this is where cert is auto created and stored by cert manager
     rules:
       - host: myapp.example.com
         http:
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
   NOTE- Create DNS record before applying, take ip of application gateway from portal or describe the service
   
   kubectl apply -f ingress-https.yml

   IMP - after applying wait for sometime as it takes sometime to generate cert and create a secret.

   ```

4. **Add DNS record**
   - Create **A record**: `myapp.example.com → <AppGatewayPublicIP>`

5. **Verify**
   ```bash
   kubectl describe ingress ingress-service -n playground
   ```
   ✅ You’ll see:
   ```
   TLS: myapp-tls terminates myapp.example.com
   Address: <AppGatewayPublicIP>
   ```

✅ **Result:** HTTPS auto-renewing certificates from Let’s Encrypt, managed by cert-manager and AGIC.

    ** Some Troubleshooting Commands **
    kubectl get certificate -n playground
    kubectl describe certificate myapp-tls -n playground
    kubectl get challenge -n playground
    kubectl describe challenge -n playground
    kubectl logs -n cert-manager -l app=cert-manager --tail=50 -f

---

## 🧾 Summary

| Method | Renewal | Certificate Source | Recommended For |
|--------|----------|--------------------|-----------------|
| Manual Secret | ❌ Manual | Self-signed / Custom | Testing / internal use |
| cert-manager + Let’s Encrypt | ✅ Automatic | Public CA | Production / public apps |
