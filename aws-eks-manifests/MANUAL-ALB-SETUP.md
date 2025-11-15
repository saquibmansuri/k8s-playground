# Manual Load Balancer Setup for AWS EKS (Beginner-Friendly)

This guide shows you how to expose your Kubernetes applications to the internet **without** installing any controllers or complex configurations. Perfect for beginners who want to understand the basics first!

## Table of Contents

- [Overview](#overview)
- [Approach 1: Automatic NLB (Easiest)](#approach-1-automatic-nlb-easiest)
- [Approach 2: Manual ALB Setup (Console)](#approach-2-manual-alb-setup-console)
- [Step-by-Step Instructions](#step-by-step-instructions)
- [Cost Comparison](#cost-comparison)
- [When to Upgrade to Ingress Controller](#when-to-upgrade-to-ingress-controller)

---

## Overview

There are **TWO simple ways** to expose your app without the Ingress Controller:

### Approach 1: LoadBalancer Service (Automatic NLB) ⭐ Easiest

- Change your Service type to `LoadBalancer`
- AWS **automatically** creates a Network Load Balancer (NLB)
- Zero manual configuration needed
- Takes 2-3 minutes to provision

### Approach 2: Manual ALB + NodePort Service

- Create an Application Load Balancer manually in AWS Console
- Use `NodePort` service type
- Point ALB to your EKS worker nodes
- More control, but more manual work

**For beginners, we recommend Approach 1!**

---

## Approach 1: Automatic NLB (Easiest)

### What You'll Get

- ✅ Automatic Network Load Balancer creation
- ✅ Public DNS endpoint
- ✅ High performance TCP/UDP load balancing
- ✅ Automatic health checks
- ✅ SSL termination (with additional configuration)

### Simple Service File

```yaml
# service-loadbalancer.yml
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: playground
  annotations:
    # Optional: Use NLB instead of Classic LB
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    # Optional: Make it internet-facing (default)
    # service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"
    # Optional: For internal-only access
    # service.beta.kubernetes.io/aws-load-balancer-scheme: "internal"
spec:
  type: LoadBalancer # This creates the load balancer automatically!
  selector:
    app: frontend
  ports:
    - name: http
      protocol: TCP
      port: 80 # External port users access
      targetPort: 3000 # Your container port
```

### Deploy It

```bash
# 1. Create namespace
kubectl create namespace playground

# 2. Deploy your application
kubectl apply -f deployment.yml

# 3. Deploy LoadBalancer service
kubectl apply -f service-loadbalancer.yml

# 4. Wait for external IP (takes 2-3 minutes)
kubectl get svc -n playground -w

# You'll see:
# NAME                TYPE           CLUSTER-IP      EXTERNAL-IP                                                              PORT(S)
# frontend-service    LoadBalancer   10.100.69.165   a1234567890abcdef.elb.us-east-1.amazonaws.com   80:32511/TCP
```

### Access Your App

```bash
# Get the load balancer URL
LB_URL=$(kubectl get svc frontend-service -n playground -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "Your app is available at: http://$LB_URL"

# Test it
curl http://$LB_URL
```

**That's it! No controllers, no ingress, no complex setup!**

---

## Approach 2: Manual ALB Setup (Console)

This approach gives you more control and is closer to production setups, but requires manual AWS Console work.

### What You'll Get

- ✅ Application Load Balancer (Layer 7)
- ✅ Path-based routing
- ✅ Host-based routing
- ✅ Better for HTTP/HTTPS traffic
- ✅ SSL/TLS termination with ACM
- ✅ Integration with WAF, Cognito, etc.

### Service File for Manual ALB

```yaml
# service-nodeport.yml
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: playground
spec:
  type: NodePort # Exposes on all nodes
  selector:
    app: frontend
  ports:
    - name: http
      protocol: TCP
      port: 3000 # Service port
      targetPort: 3000 # Container port
      # nodePort: 30080  # Optional: specify port (30000-32767)
```

---

## Step-by-Step Instructions

### Prerequisites

1. **EKS Cluster created** (Auto Mode or standard)
2. **kubectl configured** to access your cluster
3. **Docker image** pushed to ECR or Docker Hub
4. **AWS Console access**

---

## Part 1: Using Automatic LoadBalancer Service

### Step 1: Prepare Your Deployment File

Create `deployment-simple.yml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-deployment
  namespace: playground
  labels:
    app: frontend
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
          image: YOUR_ECR_REPO/YOUR_IMAGE:latest
          ports:
            - containerPort: 3000
              protocol: TCP
          # Optional: Health checks
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### Step 2: Prepare Your LoadBalancer Service File

Create `service-loadbalancer.yml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: playground
  annotations:
    # Use Network Load Balancer (faster, better for production)
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"

    # Optional: Enable cross-zone load balancing
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"

    # Optional: For HTTPS, specify certificate ARN
    # service.beta.kubernetes.io/aws-load-balancer-ssl-cert: "arn:aws:acm:region:account:certificate/xxx"
    # service.beta.kubernetes.io/aws-load-balancer-ssl-ports: "443"
spec:
  type: LoadBalancer
  selector:
    app: frontend
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 3000
```

### Step 3: Deploy Everything

```bash
# 1. Configure kubectl
aws eks update-kubeconfig --name your-cluster-name --region us-east-1

# 2. Create namespace
kubectl create namespace playground

# 3. Deploy application
kubectl apply -f deployment-simple.yml

# 4. Verify pods are running
kubectl get pods -n playground

# 5. Deploy LoadBalancer service
kubectl apply -f service-loadbalancer.yml

# 6. Check service (wait for EXTERNAL-IP)
kubectl get svc -n playground

# Initially shows:
# NAME                TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)
# frontend-service    LoadBalancer   10.100.69.165   <pending>     80:32511/TCP

# After 2-3 minutes:
# NAME                TYPE           CLUSTER-IP      EXTERNAL-IP                                    PORT(S)
# frontend-service    LoadBalancer   10.100.69.165   a123.elb.us-east-1.amazonaws.com              80:32511/TCP
```

### Step 4: Test Your Application

```bash
# Get the load balancer URL
kubectl get svc frontend-service -n playground

# Copy the EXTERNAL-IP and access it in browser
# http://a123-456.elb.us-east-1.amazonaws.com
```

### Step 5: Update Your CI/CD (GitHub Actions)

Update your workflow to use the LoadBalancer service:

```yaml
# In .github/workflows/deploy-to-aws-eks.yml

- name: Deploy to EKS
  run: |
    # Create namespace
    kubectl create namespace playground || true

    # Apply deployment
    kubectl apply -f aws-eks-manifests/deployment-simple.yml

    # Apply LoadBalancer service
    kubectl apply -f aws-eks-manifests/service-loadbalancer.yml

    # Wait for rollout
    kubectl rollout status deployment/frontend-deployment -n playground

    # Get load balancer URL
    echo "Waiting for Load Balancer..."
    sleep 60
    kubectl get svc frontend-service -n playground
```

**Done! Your app is now accessible via the NLB URL.**

---

## Part 2: Using Manual ALB Setup

This is more work but gives you full control and is a good learning experience.

### Step 1: Deploy with NodePort Service

Create `service-nodeport.yml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: playground
  labels:
    app: frontend
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
    - name: http
      protocol: TCP
      port: 3000 # Service internal port
      targetPort: 3000 # Container port
      nodePort: 31000 # Port on each node (30000-32767)
```

Deploy it:

```bash
# Deploy application
kubectl apply -f deployment-simple.yml

# Deploy NodePort service
kubectl apply -f service-nodeport.yml

# Verify
kubectl get svc -n playground

# Shows:
# NAME                TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)
# frontend-service    NodePort    10.100.91.60    <none>        3000:31000/TCP
```

### Step 2: Get EKS Worker Node Information

You need to know:

1. VPC ID where your EKS cluster is
2. Subnets (public subnets for internet-facing ALB)
3. Security group for your nodes

```bash
# Get cluster VPC
export CLUSTER_NAME=your-cluster-name
export AWS_REGION=us-east-1

# Get VPC ID
aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query 'cluster.resourcesVpcConfig.vpcId' --output text

# Get Subnets
aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query 'cluster.resourcesVpcConfig.subnetIds' --output table

# Get node security group
aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text
```

**Note these values - you'll need them for the ALB setup!**

### Step 3: Create ALB in AWS Console

#### 3.1 Go to EC2 Console

1. Open AWS Console
2. Navigate to **EC2** → **Load Balancers** (left sidebar)
3. Click **Create Load Balancer**

#### 3.2 Choose Load Balancer Type

1. Select **Application Load Balancer**
2. Click **Create**

#### 3.3 Configure Basic Settings

**Load balancer name:** `eks-frontend-alb`

**Scheme:**

- Select **Internet-facing** (for public access)
- OR **Internal** (for private access)

**IP address type:** `IPv4`

#### 3.4 Network Mapping

**VPC:** Select your EKS cluster's VPC (from Step 2)

**Availability Zones:**

- Check at least **2 availability zones**
- Select **public subnets** for internet-facing ALB
- Select **private subnets** for internal ALB

#### 3.5 Security Groups

1. Click **Create new security group** (opens in new tab)
2. **Security group name:** `eks-alb-sg`
3. **Description:** `Security group for EKS ALB`
4. **VPC:** Same VPC as your EKS cluster

**Inbound rules:**

- Type: `HTTP`, Port: `80`, Source: `0.0.0.0/0` (or your IP range)
- Type: `HTTPS`, Port: `443`, Source: `0.0.0.0/0` (if using HTTPS)

**Outbound rules:**

- Type: `All traffic`, Destination: `0.0.0.0/0`

5. Click **Create security group**
6. Go back to ALB creation tab
7. Select the new security group `eks-alb-sg`

#### 3.6 Configure Target Group (NEW)

**Don't select existing, create new:**

1. **Target type:** `Instances` (since we're using NodePort)
2. **Target group name:** `eks-frontend-tg`
3. **Protocol:** `HTTP`
4. **Port:** `31000` (the NodePort we specified)
5. **VPC:** Same VPC as cluster
6. **Protocol version:** `HTTP1`

**Health checks:**

- **Health check protocol:** `HTTP`
- **Health check path:** `/` (adjust if your app has specific health endpoint)
- **Advanced health check settings:**
  - Healthy threshold: `2`
  - Unhealthy threshold: `2`
  - Timeout: `5 seconds`
  - Interval: `30 seconds`
  - Success codes: `200` (adjust based on your app)

7. Click **Next**

#### 3.7 Register Targets

**Important:** You need to register your EKS worker nodes as targets.

1. **Get your worker nodes:**

```bash
# List nodes
kubectl get nodes -o wide

# Get node instance IDs
aws ec2 describe-instances \
  --filters "Name=tag:eks:cluster-name,Values=$CLUSTER_NAME" \
  --query 'Reservations[*].Instances[*].[InstanceId,PrivateIpAddress,State.Name]' \
  --output table
```

2. In the AWS Console, under **Available instances**:

   - Select all your EKS worker node instances
   - Click **Include as pending below**
   - Port should show `31000` (the NodePort)

3. Click **Create target group**

#### 3.8 Configure Listeners

Back in ALB creation:

**Listener HTTP:80**

- Protocol: `HTTP`
- Port: `80`
- Default action: Forward to `eks-frontend-tg` (the target group you created)

**Optional - Add HTTPS:443 Listener:**

- Click **Add listener**
- Protocol: `HTTPS`
- Port: `443`
- Default action: Forward to `eks-frontend-tg`
- Default SSL/TLS certificate: Select certificate from ACM
  - If you don't have one, skip HTTPS for now

#### 3.9 Review and Create

1. Review all settings
2. Click **Create load balancer**
3. Wait 2-3 minutes for provisioning

#### 3.10 Get ALB DNS Name

1. Go to **Load Balancers**
2. Select your ALB: `eks-frontend-alb`
3. Copy the **DNS name**: `eks-frontend-alb-123456789.us-east-1.elb.amazonaws.com`

### Step 4: Update Node Security Group

**Critical:** Allow ALB to reach nodes on NodePort!

```bash
# Get node security group
NODE_SG=$(aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)

# Get ALB security group (from console)
ALB_SG=sg-xxxxx  # Replace with your ALB security group ID

# Add inbound rule to node security group
aws ec2 authorize-security-group-ingress \
  --group-id $NODE_SG \
  --protocol tcp \
  --port 31000 \
  --source-group $ALB_SG \
  --region $AWS_REGION
```

### Step 5: Test Your Setup

```bash
# Get your ALB DNS name (from console)
ALB_DNS="eks-frontend-alb-123456789.us-east-1.elb.amazonaws.com"

# Wait 2-3 minutes for health checks to pass
echo "Waiting for health checks..."
sleep 120

# Test the endpoint
curl http://$ALB_DNS

# Or open in browser
echo "Access your app at: http://$ALB_DNS"
```

### Step 6: Check Target Health

1. Go to **EC2** → **Target Groups**
2. Select `eks-frontend-tg`
3. Click **Targets** tab
4. Verify all instances show **healthy** status

**If unhealthy:**

- Check security group rules (Step 4)
- Verify NodePort service is running: `kubectl get svc -n playground`
- Check pods are running: `kubectl get pods -n playground`
- Test direct node access: `curl http://NODE_IP:31000`

---

## Understanding the Difference

### LoadBalancer Service (Automatic)

```
Internet → Network Load Balancer (auto-created) → Service → Pods
```

**Pros:**

- ✅ Zero manual configuration
- ✅ Automatic provisioning
- ✅ Easy to manage
- ✅ Scales automatically

**Cons:**

- ❌ One NLB per service (costs $18/month each)
- ❌ Limited Layer 7 features
- ❌ No path-based routing
- ❌ Manual SSL setup

### NodePort + Manual ALB

```
Internet → Application Load Balancer (manual) → NodePort Service → Pods
```

**Pros:**

- ✅ One ALB for multiple services
- ✅ Layer 7 features (host/path routing)
- ✅ Better SSL/TLS management
- ✅ More cost-effective at scale

**Cons:**

- ❌ Manual console work
- ❌ More complex setup
- ❌ Manual target registration
- ❌ Need to update targets when nodes change

---

## Cost Comparison

### Scenario: 3 Services

**Using LoadBalancer Service (3 NLBs):**

- 3 NLBs × $18/month = **$54/month**
- Plus data transfer costs

**Using One Manual ALB:**

- 1 ALB = **$18/month**
- Plus data transfer costs
- **Savings: $36/month**

**Using Ingress Controller (Automated ALB):**

- 1 ALB = **$18/month**
- Automatic management
- Best of both worlds!

---

## CI/CD Integration

### For LoadBalancer Service Approach

Update your `.github/workflows/deploy-to-aws-eks.yml`:

```yaml
- name: Deploy to EKS
  run: |
    # Create namespace
    kubectl create namespace playground || true

    # Apply deployment
    sed -i "s|image:.*|image: ${{ steps.build-image.outputs.appimage }}|g" aws-eks-manifests/deployment-simple.yml
    kubectl apply -f aws-eks-manifests/deployment-simple.yml

    # Apply LoadBalancer service (only once)
    kubectl apply -f aws-eks-manifests/service-loadbalancer.yml

    # Wait for deployment
    kubectl rollout status deployment/frontend-deployment -n playground --timeout=180s

    # Show load balancer URL
    kubectl get svc frontend-service -n playground
```

### For Manual ALB + NodePort Approach

```yaml
- name: Deploy to EKS
  run: |
    # Create namespace
    kubectl create namespace playground || true

    # Apply deployment
    sed -i "s|image:.*|image: ${{ steps.build-image.outputs.appimage }}|g" aws-eks-manifests/deployment-simple.yml
    kubectl apply -f aws-eks-manifests/deployment-simple.yml

    # Apply NodePort service (only once, ALB is manual)
    kubectl apply -f aws-eks-manifests/service-nodeport.yml

    # Wait for deployment
    kubectl rollout status deployment/frontend-deployment -n playground --timeout=180s

    echo "App deployed! Access via your manual ALB: http://your-alb-dns.elb.amazonaws.com"
```

---

## When to Upgrade to Ingress Controller

**Start with manual approaches when:**

- ✅ You're learning Kubernetes and AWS
- ✅ You have 1-2 services only
- ✅ You want to understand the basics first
- ✅ You're comfortable with some manual work

**Upgrade to Ingress Controller when:**

- 🚀 You have 3+ services (cost savings)
- 🚀 You need path-based or host-based routing
- 🚀 You want automatic ALB management
- 🚀 You're ready for production-grade setup
- 🚀 You want to avoid manual console work
- 🚀 Your team size grows and you need automation

**The Ingress Controller (from main README) basically automates everything in Part 2!**

---

## Verification Commands

### For LoadBalancer Service

```bash
# Check service status
kubectl get svc -n playground

# Get load balancer details
kubectl describe svc frontend-service -n playground

# Check pods
kubectl get pods -n playground -o wide

# Check logs
kubectl logs -l app=frontend -n playground

# Test endpoint
LB_URL=$(kubectl get svc frontend-service -n playground -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -v http://$LB_URL
```

### For Manual ALB + NodePort

```bash
# Check NodePort service
kubectl get svc -n playground
# Note the NodePort (e.g., 3000:31000/TCP)

# Check if pods are receiving traffic
kubectl logs -l app=frontend -n playground --tail=20

# Test NodePort directly (from within VPC or if security groups allow)
kubectl get nodes -o wide
# Get node IP and test: curl http://NODE_IP:31000

# Check ALB target health (AWS CLI)
TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:region:account:targetgroup/eks-frontend-tg/xxx"
aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN
```

---

## Troubleshooting

### LoadBalancer Service Issues

**Issue: EXTERNAL-IP stays `<pending>`**

```bash
# Check service events
kubectl describe svc frontend-service -n playground

# Check AWS Load Balancer Controller logs (if installed)
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Common causes:
# - No available subnets
# - IAM permissions issue
# - VPC configuration problem
```

**Solution:**

```bash
# Verify cluster has public subnets
aws eks describe-cluster --name $CLUSTER_NAME --query 'cluster.resourcesVpcConfig.subnetIds'

# Check subnet tags
aws ec2 describe-subnets --subnet-ids subnet-xxx --query 'Subnets[*].Tags'
```

### Manual ALB Issues

**Issue: Targets showing unhealthy**

```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN

# Common causes:
# - Security group not allowing ALB → Nodes
# - Wrong NodePort
# - Pods not ready
# - Wrong health check path
```

**Solution:**

```bash
# 1. Verify NodePort
kubectl get svc frontend-service -n playground
# Should show: 3000:31000/TCP

# 2. Test NodePort directly
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
curl http://$NODE_IP:31000
# If this fails, problem is with the app or service

# 3. Check security group rules
aws ec2 describe-security-group-rules --filters Name=group-id,Values=$NODE_SG

# 4. Add rule if missing (see Step 4 above)
```

**Issue: ALB returns 503**

This means ALB is working, but targets are unhealthy.

```bash
# Check pod status
kubectl get pods -n playground

# Check pod logs
kubectl logs -l app=frontend -n playground

# Check service endpoints
kubectl get endpoints -n playground
```

---

## Summary

### What You Learned

✅ **LoadBalancer Service** - Automatic NLB with zero configuration  
✅ **NodePort Service** - Exposes app on all nodes for manual ALB  
✅ **Manual ALB Creation** - Full control via AWS Console  
✅ **Target Groups** - How ALB routes traffic to nodes  
✅ **Security Groups** - Controlling traffic flow  
✅ **Health Checks** - Ensuring traffic goes to healthy instances

### Next Steps

1. **Start with LoadBalancer Service** - Get comfortable with basics
2. **Try Manual ALB** - Learn AWS networking concepts
3. **Graduate to Ingress Controller** - When you're ready for automation (see main README.md)

---

## Additional Resources

- [Kubernetes Service Types](https://kubernetes.io/docs/concepts/services-networking/service/#loadbalancer)
- [AWS Load Balancer Types](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/load-balancer-types.html)
- [Application Load Balancer Guide](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)
- [Network Load Balancer Guide](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/)
- [EKS Networking](https://docs.aws.amazon.com/eks/latest/userguide/eks-networking.html)

---

**Perfect for:** Beginners, Learning, Development, Small Projects  
**Graduate to:** Ingress Controller (main README.md) for Production, Multiple Services, Automation  
**Last Updated:** November 15, 2025
