# AWS EKS Load Balancer Controller Setup Guide

This guide provides complete step-by-step instructions for setting up the AWS Load Balancer Controller in an EKS cluster, enabling Kubernetes Ingress resources to automatically create and manage AWS Application Load Balancers (ALBs) with HTTPS support.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation Steps](#installation-steps)
  - [Step 1: Install eksctl](#step-1-install-eksctl)
  - [Step 2: Install Helm](#step-2-install-helm)
  - [Step 3: Set Up IAM OIDC Provider](#step-3-set-up-iam-oidc-provider)
  - [Step 4: Create IAM Policy](#step-4-create-iam-policy)
  - [Step 5: Create IAM Service Account](#step-5-create-iam-service-account)
  - [Step 6: Attach Additional AWS Managed Policies](#step-6-attach-additional-aws-managed-policies)
  - [Step 7: Install AWS Load Balancer Controller](#step-7-install-aws-load-balancer-controller)
  - [Step 8: Create IngressClass](#step-8-create-ingressclass)
  - [Step 9: Deploy Your Application](#step-9-deploy-your-application)
- [Understanding IngressClass](#understanding-ingressclass)
- [How Traffic Flows](#how-traffic-flows)
- [Cost Comparison](#cost-comparison)
- [Verification Commands](#verification-commands)
- [Additional Resources](#additional-resources)

---

## Overview

The **AWS Load Balancer Controller** is a Kubernetes controller that:

- Watches for Kubernetes `Ingress` resources in your cluster
- Automatically provisions AWS Application Load Balancers (ALBs)
- Manages ALB configuration, routing rules, and target groups
- Handles SSL/TLS termination using AWS Certificate Manager (ACM)
- Provides cost-effective load balancing (one ALB can serve multiple services)
- Automatically configures HTTP to HTTPS redirects

### Why We Need This

Kubernetes `Ingress` resources are just an abstraction - they don't actually create load balancers by themselves. Each cloud provider needs a specific **Ingress Controller** to translate Kubernetes Ingress definitions into actual cloud load balancers. For AWS EKS, that's the AWS Load Balancer Controller.

**Without this controller:**

- Your Ingress resources will be created but won't do anything
- You'll get errors like: `IngressClass 'alb' not found`
- No load balancers will be provisioned in AWS

---

## Prerequisites

- An existing EKS cluster (Auto Mode or standard)
- AWS CLI configured with appropriate credentials
- `kubectl` configured to access your cluster (`aws eks update-kubeconfig --name <cluster-name> --region <region>`)
- Cluster administrator access
- AWS CloudShell or a terminal with internet access

---

## Installation Steps

### Step 1: Install eksctl

**What it does:** `eksctl` is the official CLI tool for Amazon EKS. It simplifies cluster management and automates complex IAM and OIDC configurations.

**Why it's needed:** While you can manually configure IAM OIDC providers through the AWS Console, `eksctl` automates this entire process in a single command, reducing the chance of misconfiguration.

**Run in AWS CloudShell or your terminal:**

```bash
# Download and install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp

# Move to system PATH
sudo mv /tmp/eksctl /usr/local/bin

# Make it executable (if needed)
sudo chmod +x /usr/local/bin/eksctl

# Verify installation
eksctl version
```

**Expected output:** Version number like `0.217.0`

**If command not found:** Try `ls -la /usr/local/bin/eksctl` to verify the file exists, then try running `eksctl` again (with full path `/usr/local/bin/eksctl`).

---

### Step 2: Install Helm

**What it does:** Helm is the package manager for Kubernetes, like `apt` for Ubuntu or `npm` for Node.js. It simplifies installing and managing Kubernetes applications.

**Why it's needed:** The AWS Load Balancer Controller is distributed as a Helm chart. Using Helm makes installation much easier than manually applying dozens of YAML files, and makes upgrades trivial.

```bash
# Download and install Helm 3
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verify installation
helm version
```

**Expected output:** Version info like `version.BuildInfo{Version:"v3.19.2"...}`

---

### Step 3: Set Up IAM OIDC Provider

**What it does:** Creates an OpenID Connect (OIDC) identity provider in your AWS account that establishes a trust relationship between your EKS cluster and AWS IAM.

**Why it's needed:** This is the foundation of IAM Roles for Service Accounts (IRSA). Without it:

- Kubernetes pods cannot assume IAM roles
- The Load Balancer Controller won't have AWS API permissions
- You'll get permission denied errors when the controller tries to create ALBs

**How it works:**

1. Your EKS cluster has an OIDC issuer URL
2. AWS IAM trusts this issuer
3. When a pod uses a service account with an IAM role annotation, AWS verifies the pod's identity through the OIDC provider
4. AWS grants the pod temporary credentials with the IAM role's permissions

```bash
# Set environment variables (replace with your cluster details)
export CLUSTER_NAME=test-cluster
export AWS_REGION=us-east-1

# Get OIDC issuer ID from your cluster
oidc_id=$(aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query "cluster.identity.oidc.issuer" --output text | cut -d '/' -f 5)
echo "OIDC ID: $oidc_id"

# Check if OIDC provider already exists
aws iam list-open-id-connect-providers | grep $oidc_id

# Create OIDC provider (if not exists)
eksctl utils associate-iam-oidc-provider --cluster $CLUSTER_NAME --region $AWS_REGION --approve
```

**Expected output:**

```
2025-11-15 XX:XX:XX [ℹ]  will create IAM Open ID Connect provider for cluster "test-cluster" in "us-east-1"
2025-11-15 XX:XX:XX [✔]  created IAM Open ID Connect provider for cluster "test-cluster" in "us-east-1"
```

**If already exists:** You'll see a message saying it already exists - that's fine, continue!

---

### Step 4: Create IAM Policy

**What it does:** Downloads the official IAM policy document from AWS and creates an IAM policy in your account with all the permissions the Load Balancer Controller needs.

**Why it's needed:** The controller is a Kubernetes pod, but it needs to call AWS APIs to:

- Create and delete Application Load Balancers
- Create and modify target groups
- Configure ALB listeners and rules
- Create and manage security groups
- Describe EC2 instances, subnets, VPCs, and route tables
- Add/remove tags on AWS resources

**Security note:** This policy follows the principle of least privilege - it only grants the specific permissions needed for ALB management.

```bash
# Download the official IAM policy document (version 2.7.0)
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.0/docs/install/iam_policy.json

# Create the IAM policy in your AWS account
aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json
```

**Expected output:** JSON output with the policy ARN:

```json
{
  "Policy": {
    "PolicyName": "AWSLoadBalancerControllerIAMPolicy",
    "Arn": "arn:aws:iam::123456789012:policy/AWSLoadBalancerControllerIAMPolicy",
    "Path": "/",
    "DefaultVersionId": "v1",
    "AttachmentCount": 0,
    "PermissionsBoundaryUsageCount": 0,
    "IsAttachable": true,
    "CreateDate": "2025-11-15T12:46:53+00:00",
    "UpdateDate": "2025-11-15T12:46:53+00:00"
  }
}
```

**If policy already exists:** You'll get an error `EntityAlreadyExists`. That's fine - you can either:

- Use the existing policy (continue to next step)
- Delete it first: `aws iam delete-policy --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy`

---

### Step 5: Create IAM Service Account

**What it does:** Creates THREE things in one command:

1. An IAM role in AWS (`AmazonEKSLoadBalancerControllerRole`)
2. A Kubernetes service account in your cluster (`aws-load-balancer-controller`)
3. A trust relationship that links them together via IAM Roles for Service Accounts (IRSA)

**Why it's needed:** This is the magical bridge between Kubernetes and AWS IAM:

- The service account has an annotation: `eks.amazonaws.com/role-arn: arn:aws:iam::xxx:role/AmazonEKSLoadBalancerControllerRole`
- When a pod uses this service account, the AWS SDK in the pod automatically gets temporary AWS credentials
- These credentials have all the permissions from the IAM role we're creating

```bash
# Get your AWS account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account ID: $AWS_ACCOUNT_ID"

# Create IAM role and Kubernetes service account
eksctl create iamserviceaccount \
  --cluster=$CLUSTER_NAME \
  --region=$AWS_REGION \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve
```

**Expected output:**

```
2025-11-15 XX:XX:XX [ℹ]  1 iamserviceaccount (kube-system/aws-load-balancer-controller) was included
2025-11-15 XX:XX:XX [ℹ]  building iamserviceaccount stack "eksctl-test-cluster-addon-iamserviceaccount-kube-system-aws-load-balancer-controller"
2025-11-15 XX:XX:XX [ℹ]  deploying stack "eksctl-test-cluster-addon-iamserviceaccount-kube-system-aws-load-balancer-controller"
2025-11-15 XX:XX:XX [ℹ]  waiting for CloudFormation stack...
2025-11-15 XX:XX:XX [ℹ]  created serviceaccount "kube-system/aws-load-balancer-controller"
```

**What this creates:**

- **IAM Role:** `AmazonEKSLoadBalancerControllerRole` with trust policy for OIDC
- **Service Account:** `aws-load-balancer-controller` in `kube-system` namespace
- **CloudFormation Stack:** Manages the role and trust policy automatically

**Verify it worked:**

```bash
# Check service account exists and has role annotation
kubectl describe sa aws-load-balancer-controller -n kube-system

# Look for this annotation:
# eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/AmazonEKSLoadBalancerControllerRole
```

---

### Step 6: Attach Additional AWS Managed Policies

**What it does:** Attaches AWS-managed IAM policies that provide comprehensive EC2 and ELB permissions to the controller's IAM role.

**Why this is needed:** During testing, we discovered that the custom IAM policy from the previous step sometimes misses certain permissions (like `ec2:DescribeRouteTables`), or AWS updates their APIs and the custom policy gets outdated. By attaching AWS-managed policies, we ensure:

- All required EC2 describe/read permissions (for subnets, VPCs, route tables, etc.)
- All required ELB permissions (create, modify, delete load balancers)
- Automatic updates when AWS adds new APIs

**This prevents errors like:**

```
Failed build model due to couldn't auto-discover subnets:
operation error EC2: DescribeRouteTables,
User is not authorized to perform: ec2:DescribeRouteTables
```

```bash
# Attach EC2 Read-Only Access (for subnet/VPC discovery)
aws iam attach-role-policy \
    --role-name AmazonEKSLoadBalancerControllerRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess

# Attach ELB Full Access (for creating/managing ALBs)
aws iam attach-role-policy \
    --role-name AmazonEKSLoadBalancerControllerRole \
    --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess
```

**No output expected** - these commands succeed silently.

**Verify policies are attached:**

```bash
# List all policies attached to the role
aws iam list-attached-role-policies --role-name AmazonEKSLoadBalancerControllerRole

# Should show:
# - AWSLoadBalancerControllerIAMPolicy (custom)
# - AmazonEC2ReadOnlyAccess (AWS managed)
# - ElasticLoadBalancingFullAccess (AWS managed)
```

**Security Note:** In production, you might want to create a more restrictive custom policy that combines only the specific permissions needed. For learning and development, using AWS managed policies is fine and ensures nothing breaks.

---

### Step 7: Install AWS Load Balancer Controller

**What it does:** Deploys the actual AWS Load Balancer Controller application into your cluster using Helm.

**Why it's needed:** This installs the controller pods that continuously watch for Ingress resources in your cluster and create/update/delete AWS ALBs accordingly.

**Important for EKS Auto Mode:** You **must** explicitly provide the VPC ID because EKS Auto Mode clusters don't expose EC2 instance metadata, which the controller normally uses to auto-detect the VPC.

**How the controller works:**

1. Controller pods run in the `kube-system` namespace
2. They use the service account from Step 5 (which has IAM permissions)
3. They watch for `Ingress` resources with `ingressClassName: alb`
4. When they detect a matching Ingress, they call AWS APIs to create an ALB
5. They continuously reconcile the ALB configuration with the Ingress spec

```bash
# Get your cluster's VPC ID (required for EKS Auto Mode)
export VPC_ID=$(aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query "cluster.resourcesVpcConfig.vpcId" --output text)
echo "VPC ID: $VPC_ID"

# Add AWS EKS Helm chart repository
helm repo add eks https://aws.github.io/eks-charts
helm repo update eks

# Install the AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set vpcId=$VPC_ID
```

**Key parameters explained:**

- `clusterName`: Tells the controller which EKS cluster it's managing (used for tagging resources)
- `serviceAccount.create=false`: Don't create a new service account (we already created one with IAM role)
- `serviceAccount.name`: Use the existing service account that has AWS IAM permissions
- `vpcId`: **Critical for EKS Auto Mode** - explicitly tells the controller which VPC to use

**Expected output:**

```
NAME: aws-load-balancer-controller
LAST DEPLOYED: Sat Nov 15 12:50:24 2025
NAMESPACE: kube-system
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
AWS Load Balancer controller installed!
```

**Verify the deployment (IMPORTANT - wait for pods to be ready):**

```bash
# Check deployment status (should show 2/2 READY after ~30 seconds)
kubectl get deployment -n kube-system aws-load-balancer-controller

# Check pods are running (should show 2 pods with STATUS: Running)
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check controller logs for any errors
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=30
```

**Expected output:**

```
NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
aws-load-balancer-controller   2/2     2            2           1m

NAME                                            READY   STATUS    RESTARTS   AGE
aws-load-balancer-controller-67c86cc99c-xxxxx   1/1     Running   0          1m
aws-load-balancer-controller-67c86cc99c-yyyyy   1/1     Running   0          1m
```

**If pods show `CrashLoopBackOff` status:**

This was a common issue we encountered. The solution is to **delete the pods** to force them to pick up the IAM permissions we just attached:

```bash
# Delete the controller pods (they will be automatically recreated)
kubectl delete pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Wait 30 seconds for new pods to start
sleep 30

# Check again
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check logs to ensure no errors
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --tail=20
```

**Healthy controller logs should show:**

```
{"level":"info","ts":"2025-11-15T13:21:38Z","msg":"version","GitVersion":"v2.14.1"...}
{"level":"info","ts":"2025-11-15T13:21:40Z","logger":"controller-runtime.webhook","msg":"Starting webhook server"}
{"level":"info","ts":"2025-11-15T13:21:56Z","msg":"Starting Controller","controller":"ingress"}
{"level":"info","ts":"2025-11-15T13:21:56Z","msg":"Starting workers","controller":"ingress","worker count":3}
```

**No errors about:**

- ❌ `failed to get VPC ID`
- ❌ `not authorized to perform: ec2:DescribeRouteTables`
- ❌ `UnauthorizedOperation`

If you see any of these errors, go back to Step 6 and verify the IAM policies are attached.

---

### Step 8: Create IngressClass

**What it does:** Creates an `IngressClass` resource in Kubernetes that tells the cluster which Ingress controller should handle Ingress resources that reference the class name `alb`.

**Why it's needed:** Starting with Kubernetes 1.18+:

- You can have multiple Ingress controllers in the same cluster (nginx, Traefik, AWS ALB, etc.)
- Each Ingress must specify which controller should handle it using `ingressClassName`
- Without an IngressClass resource, your Ingress will show errors like: `IngressClass 'alb' not found`

**The IngressClass acts as a contract:**

- **Ingress says:** "I want to use controller 'alb'" (`ingressClassName: alb`)
- **IngressClass says:** "Controller 'alb' is handled by `ingress.k8s.aws/alb`"
- **AWS Load Balancer Controller says:** "I handle anything with `ingress.k8s.aws/alb`"

```bash
# Apply the IngressClass manifest (already in this folder)
kubectl apply -f ingress-class.yml
```

**What this file contains:**

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: alb
  annotations:
    ingressclass.kubernetes.io/is-default-class: "true"
spec:
  controller: ingress.k8s.aws/alb
```

**Key fields:**

- `name: alb` - This is what you reference in your Ingress with `ingressClassName: alb`
- `is-default-class: "true"` - Makes this the default controller (Ingresses without `ingressClassName` will use this)
- `controller: ingress.k8s.aws/alb` - Tells Kubernetes this class is handled by the AWS Load Balancer Controller

**Expected output:**

```
ingressclass.networking.k8s.io/alb created
```

**Verify it was created:**

```bash
kubectl get ingressclass

# Should show:
# NAME   CONTROLLER            PARAMETERS   AGE
# alb    ingress.k8s.aws/alb   <none>       10s
```

**Important:** The IngressClass is a cluster-wide resource (not namespaced). You only need to create it once, and all namespaces can reference it.

---

### Step 9: Deploy Your Application

Now that the controller is set up, you can deploy your application with an Ingress resource. The controller will automatically create an AWS ALB for you.

**Example deployment structure:**

```yaml
# deployment.yml - Your application pods
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-deployment
  namespace: playground
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: your-ecr-repo/your-image:tag
          ports:
            - containerPort: 3000
```

```yaml
# service-https.yml - ClusterIP service + Ingress
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-service-https
  namespace: playground
spec:
  type: ClusterIP # No need for LoadBalancer - Ingress will handle external access
  selector:
    app: frontend
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: frontend-ingress
  namespace: playground
  annotations:
    # AWS Load Balancer Controller annotations
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    # Replace with your ACM Certificate ARN
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789:certificate/xxx
spec:
  ingressClassName: alb # References the IngressClass we created
  rules:
    - host: your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service-https
                port:
                  number: 3000
```

**Important Ingress annotations explained:**

- `scheme: internet-facing` - Creates a public ALB (use `internal` for private)
- `target-type: ip` - Routes directly to pod IPs (recommended for EKS)
- `listen-ports` - ALB listens on both HTTP (80) and HTTPS (443)
- `ssl-redirect: "443"` - Automatically redirects HTTP → HTTPS
- `certificate-arn` - Your ACM SSL certificate ARN (get from AWS Certificate Manager)

**Deploy your application:**

```bash
# Create namespace
kubectl create namespace playground

# Apply deployment and service
kubectl apply -f deployment.yml
kubectl apply -f service-https.yml

# Watch the Ingress get an ALB address (takes 2-3 minutes)
kubectl get ingress -n playground -w
```

**What happens behind the scenes:**

1. You create the Ingress resource
2. AWS Load Balancer Controller detects it (because `ingressClassName: alb`)
3. Controller calls AWS APIs to:
   - Create security groups for the ALB
   - Create the Application Load Balancer
   - Create target groups pointing to your pods
   - Configure HTTP listener (redirects to HTTPS)
   - Configure HTTPS listener with your ACM certificate
   - Create listener rules based on host/path
4. After 2-3 minutes, the ALB is ready and the Ingress shows an ADDRESS

**Check the Ingress status:**

```bash
# Get ingress details
kubectl get ingress -n playground

# Should show something like:
# NAME               CLASS   HOSTS              ADDRESS                                                   PORTS     AGE
# frontend-ingress   alb     your-domain.com    k8s-playgrou-frontend-xxxx.us-east-1.elb.amazonaws.com   80, 443   3m

# Get detailed info and events
kubectl describe ingress frontend-ingress -n playground
```

**If the ADDRESS column stays empty:**

- Check controller logs: `kubectl logs -n kube-system deployment/aws-load-balancer-controller`
- Check Ingress events: `kubectl describe ingress frontend-ingress -n playground`
- Verify IAM permissions are correct (Step 6)

**Test your application:**

```bash
# Get the ALB DNS name
ALB_DNS=$(kubectl get ingress frontend-ingress -n playground -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Your ALB DNS: $ALB_DNS"

# Test HTTP (should redirect to HTTPS)
curl -I http://$ALB_DNS

# Test HTTPS
curl -I https://$ALB_DNS

# Or open in browser
echo "https://$ALB_DNS"
```

**Set up your domain:**

Point your domain DNS to the ALB:

1. Go to your DNS provider (Route53, Cloudflare, etc.)
2. Create a CNAME record:
   - Name: `your-domain.com` (or subdomain)
   - Value: `k8s-playgrou-frontend-xxxx.us-east-1.elb.amazonaws.com` (the ALB DNS)
   - TTL: 300

After DNS propagates (5-10 minutes), you can access your app at `https://your-domain.com` 🎉

---

## Understanding IngressClass

### What is an IngressClass?

An `IngressClass` is a Kubernetes API resource (like Deployment, Service, Pod) that:

- Defines which Ingress controller should handle specific Ingress resources
- Acts as a "routing table" for Ingress objects
- Allows multiple Ingress controllers to coexist in the same cluster

### Why was it introduced?

**Before Kubernetes 1.18** (the old way):

```yaml
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: my-ingress
  annotations:
    kubernetes.io/ingress.class: "alb" # Controller specified via annotation
```

**Problems with the old way:**

- Annotations were not standardized
- No validation - typos would silently fail
- Hard to manage multiple controllers
- Not a first-class API resource

**After Kubernetes 1.18+** (the new way):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
spec:
  ingressClassName: alb # Controller specified in spec (proper API field)
```

**Benefits of IngressClass:**

- ✅ First-class API resource with validation
- ✅ Explicit, type-safe controller selection
- ✅ Can mark one as default for the cluster
- ✅ Better support for multiple controllers
- ✅ Clear separation of concerns

### How it works with AWS Load Balancer Controller

**The three-way relationship:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. IngressClass Resource                     │
│                                                                 │
│  apiVersion: networking.k8s.io/v1                              │
│  kind: IngressClass                                            │
│  metadata:                                                     │
│    name: alb                                                   │
│  spec:                                                         │
│    controller: ingress.k8s.aws/alb  ◄──────────────┐          │
└─────────────────────────────────────────────────────┼──────────┘
                                                       │
                                                       │
┌──────────────────────────────────────────────────────┼──────────┐
│            2. AWS Load Balancer Controller Pod       │          │
│                                                      │          │
│  Watches for Ingresses that reference controller:   │          │
│  "ingress.k8s.aws/alb" ──────────────────────────────┘          │
│                                                                 │
│  When found, calls AWS APIs to create ALBs                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    3. Your Ingress Resource                     │
│                                                                 │
│  apiVersion: networking.k8s.io/v1                              │
│  kind: Ingress                                                 │
│  metadata:                                                     │
│    name: frontend-ingress                                      │
│  spec:                                                         │
│    ingressClassName: alb  ◄─── References IngressClass name   │
│    rules: [...]                                                │
└─────────────────────────────────────────────────────────────────┘
```

**What happens when you create an Ingress:**

1. You create an Ingress with `ingressClassName: alb`
2. Kubernetes validates that an IngressClass named "alb" exists
3. Kubernetes looks up the controller for that class: `ingress.k8s.aws/alb`
4. AWS Load Balancer Controller (which registers as `ingress.k8s.aws/alb`) detects the new Ingress
5. Controller reads the Ingress spec and annotations
6. Controller calls AWS APIs to create:
   - Application Load Balancer
   - Security Groups
   - Target Groups
   - Listeners (HTTP, HTTPS)
   - Listener Rules (host/path routing)
7. Controller updates the Ingress status with the ALB DNS name
8. Controller continuously watches for changes and updates the ALB accordingly

### Multiple Ingress Controllers Example

You can run multiple controllers simultaneously:

```yaml
# IngressClass for AWS ALB
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: alb
spec:
  controller: ingress.k8s.aws/alb

---
# IngressClass for nginx
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx
spec:
  controller: k8s.io/ingress-nginx

---
# Ingress using AWS ALB
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: public-ingress
spec:
  ingressClassName: alb # Uses AWS ALB Controller
  rules: [...]

---
# Ingress using nginx
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: internal-ingress
spec:
  ingressClassName: nginx # Uses nginx Ingress Controller
  rules: [...]
```

Each Ingress is handled by its respective controller, and they don't interfere with each other.

---

## How Traffic Flows

Understanding the complete flow from internet to your pods:

```
┌──────────────┐
│   Internet   │
│    User      │
└──────┬───────┘
       │ HTTPS Request to your-domain.com
       │
       ▼
┌─────────────────────────────────────────────────────┐
│   AWS Route 53 (or your DNS provider)               │
│   CNAME: your-domain.com                            │
│       → k8s-playgrou-frontend-xxx.elb.amazonaws.com │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│   AWS Application Load Balancer (ALB)               │
│   - Terminates SSL/TLS (using ACM certificate)      │
│   - Port 80 → Redirects to 443                      │
│   - Port 443 → Routes to Target Group               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│   ALB Target Group                                  │
│   - Type: IP                                        │
│   - Protocol: HTTP                                  │
│   - Port: 3000                                      │
│   - Health checks: HTTP GET /                       │
│   - Targets: Pod IPs (172.30.0.212, 172.30.0.213)  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│   Kubernetes Service (ClusterIP)                    │
│   Name: frontend-service-https                      │
│   - Selector: app=frontend                          │
│   - Port: 3000                                      │
│   - Actually bypassed by ALB (target-type: ip)      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│   Kubernetes Pods                                   │
│   - Label: app=frontend                             │
│   - Container Port: 3000                            │
│   - IP: 172.30.0.212                                │
│   - IP: 172.30.0.213                                │
└─────────────────────────────────────────────────────┘
```

**Key points:**

1. **SSL Termination at ALB:** The ALB decrypts HTTPS traffic, so your pods only handle HTTP
2. **Direct IP Routing:** With `target-type: ip`, the ALB routes directly to pod IPs (faster than going through Service)
3. **Automatic Target Updates:** As pods scale up/down, the controller automatically updates the target group
4. **Health Checks:** ALB continuously health-checks pods and removes unhealthy ones
5. **Security Groups:** Controller automatically creates and manages security groups for ALB ↔ Pods communication

---

## Cost Comparison

### Option 1: LoadBalancer Service (NLB per service) 💰💰💰

```yaml
apiVersion: v1
kind: Service
metadata:
  name: service1
spec:
  type: LoadBalancer # Creates a Network Load Balancer
  ports:
    - port: 80
```

**Cost:**

- **1 NLB** = ~$16-18/month + data transfer
- **Each service needs its own NLB**
- **3 services** = ~$48-54/month + data transfer

### Option 2: Ingress + ALB Controller (One ALB for all services) 💰

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  rules:
    - host: service1.example.com
      http:
        paths:
          - path: /
            backend:
              service: service1
    - host: service2.example.com
      http:
        paths:
          - path: /
            backend:
              service: service2
    - host: service3.example.com
      http:
        paths:
          - path: /
            backend:
              service: service3
```

**Cost:**

- **1 ALB** = ~$16-18/month + data transfer
- **Unlimited services** behind the same ALB
- **3 services** = ~$16-18/month + data transfer

**Savings: ~$30-36/month for just 3 services!**

### Feature Comparison

| Feature               | LoadBalancer Service (NLB) | Ingress + ALB          |
| --------------------- | -------------------------- | ---------------------- |
| Cost per service      | ~$18/month each            | ~$18/month total       |
| SSL/TLS               | Manual cert management     | Free ACM certificates  |
| Host-based routing    | ❌ No                      | ✅ Yes                 |
| Path-based routing    | ❌ No                      | ✅ Yes                 |
| HTTP → HTTPS redirect | ❌ Manual                  | ✅ Automatic           |
| WAF integration       | ❌ Limited                 | ✅ Full support        |
| Multiple domains      | ❌ Need multiple NLBs      | ✅ One ALB handles all |

**Recommendation:** Use Ingress + ALB for web applications. Use LoadBalancer Service (NLB) only for:

- Non-HTTP protocols (TCP/UDP)
- When you need to preserve source IP
- Gaming servers, database connections, etc.

---

## Verification Commands

After setup, use these commands to verify everything is working:

### Check Controller Status

```bash
# Check controller deployment
kubectl get deployment -n kube-system aws-load-balancer-controller

# Check controller pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=50

# Check controller version
kubectl get deployment -n kube-system aws-load-balancer-controller -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### Check IAM Setup

```bash
# Check OIDC provider exists
aws iam list-open-id-connect-providers

# Check IAM policy
aws iam get-policy --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy

# Check IAM role
aws iam get-role --role-name AmazonEKSLoadBalancerControllerRole

# List policies attached to role
aws iam list-attached-role-policies --role-name AmazonEKSLoadBalancerControllerRole

# Check service account has role annotation
kubectl describe sa aws-load-balancer-controller -n kube-system | grep eks.amazonaws.com/role-arn
```

### Check IngressClass

```bash
# List IngressClasses
kubectl get ingressclass

# Get detailed info
kubectl describe ingressclass alb
```

### Check Your Application

```bash
# List ingresses
kubectl get ingress -n playground

# Get detailed ingress info with events
kubectl describe ingress frontend-ingress -n playground

# Check service
kubectl get svc -n playground

# Check pods
kubectl get pods -n playground -o wide

# Check target group binding (created by controller)
kubectl get targetgroupbinding -n playground

# Describe target group binding
kubectl describe targetgroupbinding -n playground
```

### Check AWS Resources

```bash
# List ALBs in your account
aws elbv2 describe-load-balancers --query 'LoadBalancers[?contains(LoadBalancerName, `k8s`)].{Name:LoadBalancerName,DNS:DNSName,State:State.Code}' --output table

# List target groups
aws elbv2 describe-target-groups --query 'TargetGroups[?contains(TargetGroupName, `k8s`)].{Name:TargetGroupName,Port:Port,Protocol:Protocol}' --output table

# Check target health (replace with your target group ARN)
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:xxx:targetgroup/k8s-xxx/xxx
```

### Test Your Application

```bash
# Get ALB DNS name
ALB_DNS=$(kubectl get ingress frontend-ingress -n playground -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "ALB DNS: $ALB_DNS"

# Test HTTP (should redirect to HTTPS)
curl -v http://$ALB_DNS 2>&1 | grep -i "< HTTP\|< location"

# Test HTTPS
curl -v https://$ALB_DNS 2>&1 | grep -i "< HTTP"

# Check response time
time curl -o /dev/null -s -w "HTTP Status: %{http_code}\nTime: %{time_total}s\n" https://$ALB_DNS

# Test with your actual domain (after DNS setup)
curl -v https://your-domain.com
```

---

## Common Issues and Solutions

### Issue: Pods in CrashLoopBackOff

**Symptoms:**

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
# Shows CrashLoopBackOff
```

**Solution:**

```bash
# Delete pods to force restart with new IAM permissions
kubectl delete pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Wait and check
sleep 30
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

### Issue: Permission Denied Errors in Logs

**Symptoms:**

```
User is not authorized to perform: ec2:DescribeRouteTables
```

**Solution:**
Go back to **Step 6** and ensure AWS managed policies are attached:

```bash
aws iam attach-role-policy \
    --role-name AmazonEKSLoadBalancerControllerRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess

aws iam attach-role-policy \
    --role-name AmazonEKSLoadBalancerControllerRole \
    --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess

# Restart controller
kubectl delete pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

### Issue: Ingress Created but No ALB

**Symptoms:**

```bash
kubectl get ingress -n playground
# ADDRESS column is empty
```

**Solutions:**

1. **Check controller logs:**

```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

2. **Check Ingress events:**

```bash
kubectl describe ingress frontend-ingress -n playground
```

3. **Verify IngressClass exists:**

```bash
kubectl get ingressclass
```

4. **Verify Ingress has correct ingressClassName:**

```bash
kubectl get ingress frontend-ingress -n playground -o yaml | grep ingressClassName
```

### Issue: ALB Created but Targets Unhealthy

**Symptoms:**
ALB DNS returns 503 Service Unavailable

**Solutions:**

1. **Check target health:**

```bash
kubectl describe targetgroupbinding -n playground
```

2. **Check pod health:**

```bash
kubectl get pods -n playground
kubectl logs <pod-name> -n playground
```

3. **Check security groups:**

```bash
# Controller should automatically create security group rules
# Check if pods can receive traffic on their port
kubectl exec -it <pod-name> -n playground -- netstat -tlnp
```

4. **Verify service selector matches pods:**

```bash
kubectl get svc frontend-service-https -n playground -o yaml | grep selector -A2
kubectl get pods -n playground --show-labels
```

---

## Summary

You've successfully set up the AWS Load Balancer Controller! Here's what you accomplished:

✅ **eksctl** - EKS management CLI tool  
✅ **Helm** - Kubernetes package manager  
✅ **IAM OIDC Provider** - Trust between EKS and AWS IAM  
✅ **IAM Policy** - Custom permissions for ALB operations  
✅ **IAM Service Account** - Links Kubernetes pods to AWS IAM roles  
✅ **AWS Managed Policies** - Comprehensive EC2 and ELB permissions  
✅ **AWS Load Balancer Controller** - Watches Ingress and creates ALBs  
✅ **IngressClass** - Routes Ingress resources to the controller  
✅ **Working Application** - Deployed with HTTPS and automatic HTTP redirect

Your EKS cluster can now:

- 🚀 Automatically create AWS ALBs from Kubernetes Ingress resources
- 🔒 Handle SSL/TLS termination with ACM certificates
- 🔄 Automatically redirect HTTP to HTTPS
- 📊 Route traffic based on hostnames and paths
- 💰 Save costs by sharing one ALB across multiple services
- 🔄 Auto-update ALB configuration when you modify Ingress specs

---

## Additional Resources

- [AWS Load Balancer Controller Documentation](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [AWS Load Balancer Controller GitHub](https://github.com/kubernetes-sigs/aws-load-balancer-controller)
- [Ingress Annotations Reference](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/ingress/annotations/)
- [EKS Workshop - Load Balancing](https://www.eksworkshop.com/)
- [Kubernetes Ingress Documentation](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [IAM Roles for Service Accounts (IRSA)](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [AWS Certificate Manager (ACM)](https://docs.aws.amazon.com/acm/)

---

**Created by:** Your DevOps Journey  
**Last Updated:** November 15, 2025  
**Tested on:** EKS Auto Mode, Kubernetes 1.31+, AWS Load Balancer Controller v2.14.1
