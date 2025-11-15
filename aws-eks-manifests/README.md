# AWS EKS Load Balancer Controller Setup Guide

This guide provides complete step-by-step instructions for setting up the AWS Load Balancer Controller in an EKS cluster, enabling Kubernetes Ingress resources to automatically create and manage AWS Application Load Balancers (ALBs).

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation Steps](#installation-steps)
  - [Step 1: Install eksctl](#step-1-install-eksctl)
  - [Step 2: Install Helm](#step-2-install-helm)
  - [Step 3: Set Up IAM OIDC Provider](#step-3-set-up-iam-oidc-provider)
  - [Step 4: Create IAM Policy](#step-4-create-iam-policy)
  - [Step 5: Create IAM Service Account](#step-5-create-iam-service-account)
  - [Step 6: Install AWS Load Balancer Controller](#step-6-install-aws-load-balancer-controller)
  - [Step 7: Create IngressClass](#step-7-create-ingressclass)
- [Understanding IngressClass](#understanding-ingressclass)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Overview

The **AWS Load Balancer Controller** is a Kubernetes controller that:

- Watches for Kubernetes `Ingress` resources in your cluster
- Automatically provisions AWS Application Load Balancers (ALBs)
- Manages ALB configuration, routing rules, and target groups
- Handles SSL/TLS termination using AWS Certificate Manager (ACM)
- Provides cost-effective load balancing (one ALB can serve multiple services)

### Why We Need This

Kubernetes `Ingress` resources are an abstraction - they don't actually create load balancers by themselves. Each cloud provider needs a specific **Ingress Controller** to translate Kubernetes Ingress definitions into actual cloud load balancers. For AWS EKS, that's the AWS Load Balancer Controller.

---

## Prerequisites

- An existing EKS cluster (e.g., `test-cluster`)
- AWS CLI configured with appropriate credentials
- `kubectl` configured to access your cluster
- Cluster administrator access

---

## Installation Steps

### Step 1: Install eksctl

**What it does:** `eksctl` is a CLI tool for creating and managing EKS clusters. We need it to easily set up IAM OIDC providers and service accounts.

**Why it's needed:** While you can do everything manually via AWS Console and CLI, `eksctl` automates complex IAM and OIDC configurations that would otherwise require multiple manual steps.

```bash
# Download and install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp

# Move to system PATH
sudo mv /tmp/eksctl /usr/local/bin

# Verify installation
eksctl version
```

**Expected output:** Version number like `0.217.0`

---

### Step 2: Install Helm

**What it does:** Helm is a package manager for Kubernetes that simplifies installing and managing applications.

**Why it's needed:** The AWS Load Balancer Controller is distributed as a Helm chart, making installation and upgrades much easier than manually applying multiple YAML files.

```bash
# Download and install Helm 3
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verify installation
helm version
```

**Expected output:** Version info like `version.BuildInfo{Version:"v3.19.2"...}`

---

### Step 3: Set Up IAM OIDC Provider

**What it does:** Creates an OpenID Connect (OIDC) identity provider in your AWS account that establishes trust between your EKS cluster and AWS IAM.

**Why it's needed:** This enables Kubernetes service accounts to assume IAM roles. Without this, the Load Balancer Controller running as a pod wouldn't have AWS permissions to create/modify ALBs.

**How it works:** When a pod uses a service account associated with an IAM role, AWS checks the OIDC provider to verify the pod's identity, then grants it temporary AWS credentials.

```bash
# Set environment variables
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
✔ created IAM Open ID Connect provider for cluster "test-cluster" in "us-east-1"
```

---

### Step 4: Create IAM Policy

**What it does:** Downloads and creates an IAM policy with all the permissions needed by the Load Balancer Controller to manage AWS resources.

**Why it's needed:** The controller needs specific AWS API permissions to:
- Create and delete Application Load Balancers
- Modify target groups and listeners
- Create and manage security groups
- Describe EC2 instances, subnets, and VPCs
- Add/remove tags on AWS resources

```bash
# Download the official IAM policy document
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.0/docs/install/iam_policy.json

# Create the IAM policy in your AWS account
aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json
```

**Expected output:** JSON output with the policy ARN like:
```json
{
    "Policy": {
        "PolicyName": "AWSLoadBalancerControllerIAMPolicy",
        "Arn": "arn:aws:iam::000866710370:policy/AWSLoadBalancerControllerIAMPolicy",
        ...
    }
}
```

---

### Step 5: Create IAM Service Account

**What it does:** Creates both:
1. An IAM role in AWS with the policy attached
2. A Kubernetes service account in your cluster
3. Links them together via IAM Roles for Service Accounts (IRSA)

**Why it's needed:** This is the bridge between Kubernetes and AWS IAM. The Load Balancer Controller pods will run using this service account, which allows them to assume the IAM role and get AWS permissions.

**How it works:** 
- The service account has an annotation pointing to the IAM role ARN
- When pods use this service account, AWS SDK automatically gets temporary credentials
- These credentials have the permissions defined in the IAM policy

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
✔ created serviceaccount "kube-system/aws-load-balancer-controller"
```

**What this creates:**
- IAM Role: `AmazonEKSLoadBalancerControllerRole`
- Service Account: `aws-load-balancer-controller` in `kube-system` namespace
- CloudFormation stack managing the role and trust policy

---

### Step 6: Install AWS Load Balancer Controller

**What it does:** Installs the actual Load Balancer Controller application in your cluster using Helm.

**Why it's needed:** This deploys the controller pods that will watch for Ingress resources and create/manage ALBs.

**Important:** For EKS Auto Mode clusters, you must explicitly provide the VPC ID because the controller cannot auto-detect it from instance metadata.

```bash
# Get your cluster's VPC ID
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
- `clusterName`: Tells the controller which EKS cluster it's managing
- `serviceAccount.create=false`: Use the existing service account we created
- `serviceAccount.name`: The service account with IAM role attached
- `vpcId`: Explicitly set VPC (required for EKS Auto Mode)

**Expected output:**
```
NAME: aws-load-balancer-controller
STATUS: deployed
```

**Verify the deployment:**

```bash
# Check deployment status (should show 2/2 READY)
kubectl get deployment -n kube-system aws-load-balancer-controller

# Check pods are running
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=20
```

**Expected output:**
```
NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
aws-load-balancer-controller   2/2     2            2           1m

NAME                                            READY   STATUS    RESTARTS   AGE
aws-load-balancer-controller-67c86cc99c-xxxxx   1/1     Running   0          1m
aws-load-balancer-controller-67c86cc99c-yyyyy   1/1     Running   0          1m
```

---

### Step 7: Create IngressClass

**What it does:** Creates an `IngressClass` resource that tells Kubernetes which controller should handle Ingress resources.

**Why it's needed:** Starting with Kubernetes 1.18+, you must explicitly specify which Ingress controller should process each Ingress. Without the IngressClass, your Ingress resources won't be picked up by any controller.

```bash
# Apply the IngressClass manifest
kubectl apply -f ingress-class.yml
```

**Verify:**

```bash
kubectl get ingressclass
```

**Expected output:**
```
NAME   CONTROLLER            PARAMETERS   AGE
alb    ingress.k8s.aws/alb   <none>       10s
```

---

## Understanding IngressClass

### What is an IngressClass?

An `IngressClass` is a Kubernetes resource that:
- Defines which Ingress controller should handle Ingress resources
- Acts as a selector/router for Ingress objects
- Allows multiple Ingress controllers to coexist in the same cluster

### Why is it Required?

Before Kubernetes 1.18, Ingress resources used annotations (like `kubernetes.io/ingress.class: alb`) to specify which controller should handle them. This wasn't standardized and caused issues.

With `IngressClass`:
- ✅ Standard API resource (like Deployments, Services)
- ✅ Can have only one default IngressClass
- ✅ Explicit controller specification
- ✅ Better multi-controller support

### How It Works with AWS Load Balancer Controller

1. **IngressClass Definition** (`ingress-class.yml`):
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

2. **Ingress Resource** (`service-https.yml`):
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: frontend-ingress
spec:
  ingressClassName: alb  # References the IngressClass
  rules:
    - host: example.com
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

3. **What Happens:**
   - You create an Ingress with `ingressClassName: alb`
   - AWS Load Balancer Controller sees it (because it watches for `ingress.k8s.aws/alb` controller)
   - Controller creates an AWS ALB
   - ALB is configured based on Ingress annotations and rules
   - Traffic flows: Internet → ALB → Service → Pods

### Traditional Ingress vs IngressClass

**Before (Kubernetes < 1.18):**
```yaml
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: my-ingress
  annotations:
    kubernetes.io/ingress.class: "alb"  # Old method
```

**Now (Kubernetes >= 1.18):**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
spec:
  ingressClassName: alb  # New standard method
```

### Benefits of This Approach

1. **Cost Effective**: One ALB can serve multiple services (vs LoadBalancer Service which creates one NLB per service)
2. **Advanced Routing**: Host-based and path-based routing
3. **SSL/TLS Management**: Free SSL certificates via AWS ACM
4. **AWS Native**: Deep integration with AWS services
5. **Automatic Updates**: Controller manages ALB configuration as you update Ingress

---

## Verification

### Check All Components

```bash
# 1. OIDC Provider
aws iam list-open-id-connect-providers

# 2. IAM Policy
aws iam get-policy --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy

# 3. IAM Role
aws iam get-role --role-name AmazonEKSLoadBalancerControllerRole

# 4. Service Account
kubectl describe sa aws-load-balancer-controller -n kube-system

# 5. Controller Deployment
kubectl get deployment -n kube-system aws-load-balancer-controller

# 6. Controller Pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# 7. IngressClass
kubectl get ingressclass

# 8. Check an Ingress (after deploying your app)
kubectl get ingress -n playground
kubectl describe ingress frontend-ingress -n playground
```

### Test with Sample Ingress

After deploying your application, the Ingress should automatically create an ALB:

```bash
# Watch ingress get an address (takes 2-3 minutes)
kubectl get ingress -n playground -w

# Once ADDRESS column is populated, that's your ALB DNS name
# Example: k8s-playground-frontend-abc123.us-east-1.elb.amazonaws.com
```

---

## Troubleshooting

### Controller Pods in CrashLoopBackOff

**Symptom:**
```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
# Shows CrashLoopBackOff status
```

**Common Causes:**

1. **Missing VPC ID** (EKS Auto Mode):
```bash
# Solution: Reinstall with VPC ID
export VPC_ID=$(aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query "cluster.resourcesVpcConfig.vpcId" --output text)

helm uninstall aws-load-balancer-controller -n kube-system

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set vpcId=$VPC_ID
```

2. **IAM Permissions Issue**:
```bash
# Check logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Verify service account has role annotation
kubectl describe sa aws-load-balancer-controller -n kube-system
# Should see: eks.amazonaws.com/role-arn annotation
```

3. **OIDC Provider Not Set Up**:
```bash
# Re-run OIDC setup
eksctl utils associate-iam-oidc-provider --cluster $CLUSTER_NAME --region $AWS_REGION --approve
```

### Ingress Not Creating ALB

**Check these in order:**

1. **IngressClass exists:**
```bash
kubectl get ingressclass
# Should show 'alb'
```

2. **Ingress has correct ingressClassName:**
```bash
kubectl get ingress -n playground -o yaml
# Should have: spec.ingressClassName: alb
```

3. **Controller is running:**
```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
# Should show 2 Running pods
```

4. **Check controller logs for errors:**
```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

5. **Check Ingress events:**
```bash
kubectl describe ingress frontend-ingress -n playground
# Look for error events
```

### Subnet Tagging Issues

If ALB creation fails due to subnet issues, your VPC subnets need proper tags:

**Public subnets** (for internet-facing ALBs):
```
kubernetes.io/role/elb = 1
```

**Private subnets** (for internal ALBs):
```
kubernetes.io/role/internal-elb = 1
```

**Add tags via AWS CLI:**
```bash
# Get subnet IDs
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[*].[SubnetId,MapPublicIpOnLaunch]' --output table

# Tag public subnets
aws ec2 create-tags --resources subnet-xxxxx --tags Key=kubernetes.io/role/elb,Value=1

# Tag private subnets
aws ec2 create-tags --resources subnet-yyyyy --tags Key=kubernetes.io/role/internal-elb,Value=1
```

---

## Summary

You've successfully installed and configured:

✅ **eksctl** - EKS management tool  
✅ **Helm** - Kubernetes package manager  
✅ **IAM OIDC Provider** - Trust between EKS and IAM  
✅ **IAM Policy** - Permissions for load balancer operations  
✅ **IAM Service Account** - Links Kubernetes pods to AWS IAM  
✅ **AWS Load Balancer Controller** - Creates and manages ALBs  
✅ **IngressClass** - Routes Ingress resources to the controller  

Your EKS cluster can now automatically create AWS Application Load Balancers from Kubernetes Ingress resources, providing enterprise-grade load balancing with SSL/TLS support!

---

## Additional Resources

- [AWS Load Balancer Controller Documentation](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [EKS Workshop - Load Balancing](https://www.eksworkshop.com/)
- [Kubernetes Ingress Documentation](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [IAM Roles for Service Accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)

