# 🎯 ArgoCD UI Guide - Connect Repo & Create Application

This guide provides step-by-step instructions for connecting Git repositories and creating applications using the **ArgoCD Web UI only** (no CLI commands).

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Connecting a Repository](#connecting-a-repository)
   - [Public Repository](#option-1-public-repository-no-authentication)
   - [Private Repository (HTTPS)](#option-2-private-repository-via-https)
   - [Private Repository (SSH)](#option-3-private-repository-via-ssh)
3. [Creating an Application](#creating-an-application)
4. [Understanding All Application Options](#understanding-all-application-options)
5. [Syncing Your Application](#syncing-your-application)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

✅ ArgoCD installed in your Kubernetes cluster (in `argocd` namespace)  
✅ ArgoCD UI accessible via port-forward, LoadBalancer, or Ingress  
✅ Logged into ArgoCD UI (username: `admin`, password from initial secret)  
✅ Your Kubernetes manifests pushed to a Git repository

---

## Connecting a Repository

### 🔍 When Do You Need This?

- **Public Repositories**: Optional (ArgoCD can access without pre-registering)
- **Private Repositories**: Required (must add credentials first)

### Where to Go:

1. Open ArgoCD UI in your browser
2. Click the **⚙️ Settings** icon in the left sidebar
3. Click **Repositories**
4. Click the **"+ CONNECT REPO"** button (top right)

---

### Option 1: Public Repository (No Authentication)

**You can skip this step for public repos!** ArgoCD will automatically access public repositories when you create an application.

If you still want to pre-register a public repo:

1. **Choose connection method**: `VIA HTTPS`
2. **Fill in details**:
   - **Repository URL**: `https://github.com/username/repository-name.git`
   - Leave **Username** and **Password** empty
3. Click **"CONNECT"** button

✅ **Status**: Should show "Successful" with a green checkmark

---

### Option 2: Private Repository (via HTTPS)

#### Step 1: Create GitHub Personal Access Token

Before connecting, you need a GitHub token:

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a name: `ArgoCD Access Token`
4. Set **Expiration**: Choose your preference (30 days, 90 days, or no expiration)
5. **Select scopes**:
   - ✅ Check `repo` (Full control of private repositories)
6. Scroll down and click **"Generate token"**
7. **⚠️ IMPORTANT**: Copy the token immediately (format: `ghp_xxxxxxxxxxxx`)
   - You won't be able to see it again!
   - Store it securely

#### Step 2: Connect Repository in ArgoCD UI

1. In ArgoCD UI → Settings → Repositories → **"+ CONNECT REPO"**
2. **Choose connection method**: `VIA HTTPS`
3. **Fill in details**:

   | Field                          | Value                              | Example                                      |
   | :----------------------------- | :--------------------------------- | :------------------------------------------- |
   | **Repository URL**             | Your GitHub repo URL               | `https://github.com/username/repository.git` |
   | **Username**                   | Your GitHub username               | `saquibmansuri`                              |
   | **Password**                   | GitHub Personal Access Token       | `ghp_xxxxxxxxxxxxxxxxxxxx`                   |
   | **TLS client certificate**     | Leave empty                        | -                                            |
   | **TLS client certificate key** | Leave empty                        | -                                            |
   | **Skip server verification**   | Unchecked (default)                | -                                            |
   | **Enable LFS support**         | Unchecked (unless you use Git LFS) | -                                            |
   | **Proxy**                      | Leave empty                        | -                                            |
   | **Project**                    | `default`                          | -                                            |

4. Click **"CONNECT"** button (top)

✅ **Verification**: You should see:

- Green checkmark with "Successful" status
- "Connection Status: Successful"

---

### Option 3: Private Repository (via SSH)

#### Step 1: Generate SSH Key Pair

**On Windows PowerShell:**

```powershell
ssh-keygen -t ed25519 -C "argocd@k8s-cluster"
```

**On Linux/Mac:**

```bash
ssh-keygen -t ed25519 -C "argocd@k8s-cluster"
```

- Save to default location: `C:\Users\admin\.ssh\id_ed25519` (Windows) or `~/.ssh/id_ed25519` (Linux/Mac)
- Optionally add a passphrase (or press Enter to skip)

#### Step 2: Add Public Key to GitHub

1. Go to: https://github.com/settings/keys
2. Click **"New SSH key"**
3. **Title**: `ArgoCD Cluster Access`
4. **Key type**: `Authentication Key`
5. **Key**: Copy contents of public key file:
   - **Windows**: `C:\Users\admin\.ssh\id_ed25519.pub`
   - **Linux/Mac**: `~/.ssh/id_ed25519.pub`
6. Click **"Add SSH key"**

#### Step 3: Connect Repository in ArgoCD UI

1. In ArgoCD UI → Settings → Repositories → **"+ CONNECT REPO"**
2. **Choose connection method**: `VIA SSH`
3. **Fill in details**:

   | Field                        | Value                    | Example                                  |
   | :--------------------------- | :----------------------- | :--------------------------------------- |
   | **Repository URL**           | SSH format URL           | `git@github.com:username/repository.git` |
   | **SSH private key data**     | Paste entire private key | Contents of `id_ed25519` file            |
   | **Skip server verification** | Unchecked                | -                                        |
   | **Enable LFS support**       | Unchecked                | -                                        |
   | **Proxy**                    | Leave empty              | -                                        |
   | **Project**                  | `default`                | -                                        |

4. Click **"CONNECT"** button

✅ **Verification**: Status should show "Successful"

---

## Creating an Application

### Step 1: Navigate to Applications

1. Click **"Applications"** in the left sidebar (or the ArgoCD logo at top)
2. Click **"+ NEW APP"** button (top left)

---

### Step 2: Fill in Application Details

A form will appear with several sections. Here's what to fill in:

---

#### 🔷 **GENERAL Section**

| Field                | Description                  | Example Value  | Required       |
| :------------------- | :--------------------------- | :------------- | :------------- |
| **Application Name** | Unique name for your app     | `frontend-app` | ✅ Yes         |
| **Project Name**     | ArgoCD project (use default) | `default`      | ✅ Yes         |
| **Sync Policy**      | Manual or Automatic          | `Automatic`    | ⚠️ Recommended |

**Sync Policy Options:**

- **Manual**: You must click "Sync" button each time
- **Automatic**: ArgoCD auto-syncs when Git changes detected

**If you choose Automatic, additional checkboxes appear:**

- ✅ **PRUNE RESOURCES**: Delete resources removed from Git
- ✅ **SELF HEAL**: Auto-correct manual changes to cluster (revert drift)
- ✅ **AUTO-CREATE NAMESPACE**: Create namespace if it doesn't exist

---

#### 🔷 **SOURCE Section** (Where is your code?)

| Field              | Description            | Example Value                                         | Required |
| :----------------- | :--------------------- | :---------------------------------------------------- | :------- |
| **Repository URL** | Git repo URL           | `https://github.com/saquibmansuri/k8s-playground.git` | ✅ Yes   |
| **Revision**       | Branch, tag, or commit | `HEAD` or `main` or `master`                          | ✅ Yes   |
| **Path**           | Directory path in repo | `gke-files-argocd/frontend`                           | ✅ Yes   |

**Repository URL Tips:**

- If you registered the repo in Settings → Repositories, select it from dropdown
- Otherwise, paste the URL directly (works for public repos)
- Format: `https://github.com/username/repo.git`

**Revision Options:**

- `HEAD` - Latest commit on default branch
- `main` or `master` - Specific branch name
- `v1.0.0` - Specific tag
- `abc123def` - Specific commit hash

**Path:**

- Relative path from repository root
- Where your Kubernetes YAML files are located
- Example: `gke-files-argocd/frontend` if your deployment.yml is in that folder

---

#### 🔷 **DESTINATION Section** (Where to deploy?)

| Field           | Description                 | Example Value                    | Required |
| :-------------- | :-------------------------- | :------------------------------- | :------- |
| **Cluster URL** | Kubernetes cluster endpoint | `https://kubernetes.default.svc` | ✅ Yes   |
| **Namespace**   | Target namespace            | `playground-argocd`              | ✅ Yes   |

**Cluster URL:**

- For same cluster (ArgoCD deployed in same cluster): `https://kubernetes.default.svc`
- For external clusters: Full API server URL (must be registered first)

**Namespace:**

- Must exist, OR enable "AUTO-CREATE NAMESPACE" option above
- Use `default` namespace or create a custom one like `playground-argocd`

---

#### 🔷 **DIRECTORY Section** (Advanced Options - Usually Leave Default)

Only appears if your path contains plain YAML/JSON files (not Helm/Kustomize)

| Field                   | Description           | Default   | When to Change                        |
| :---------------------- | :-------------------- | :-------- | :------------------------------------ |
| **Directory recurse**   | Search subdirectories | Unchecked | Check if YAML files in nested folders |
| **Top-level arguments** | Kustomize arguments   | None      | Only for Kustomize                    |
| **Include/Exclude**     | File patterns         | None      | To filter specific files              |

---

#### 🔷 **HELM/KUSTOMIZE Sections**

Only appear if ArgoCD detects Helm charts or Kustomize files. Usually hidden for plain YAML.

---

### Step 3: Review and Create

1. **Review all fields** - Make sure everything is correct
2. Click **"CREATE"** button at the very top of the form
3. You'll be redirected to the Applications view

---

## Understanding All Application Options

### 🎨 Visual Status Indicators

After creating an app, you'll see:

| Status          | Icon/Color            | Meaning                         |
| :-------------- | :-------------------- | :------------------------------ |
| **Synced**      | Green checkmark ✅    | Git state matches cluster state |
| **OutOfSync**   | Yellow warning ⚠️     | Git has changes not in cluster  |
| **Unknown**     | Gray question mark ❓ | Status cannot be determined     |
| **Healthy**     | Green heart ❤️        | All resources running properly  |
| **Progressing** | Blue circle 🔵        | Resources being created/updated |
| **Degraded**    | Red X ❌              | Resources failing or unhealthy  |
| **Suspended**   | Paused icon ⏸️        | Resources intentionally paused  |

---

### ⚙️ Application Actions Menu

Click the three dots (⋮) on your application card for actions:

| Action           | Description                   | When to Use                                                       |
| :--------------- | :---------------------------- | :---------------------------------------------------------------- |
| **Sync**         | Deploy/update from Git        | When OutOfSync or after Git changes                               |
| **Refresh**      | Re-check Git repo for changes | To manually trigger refresh                                       |
| **Hard Refresh** | Clear cache and re-check      | If changes not detected                                           |
| **Delete**       | Remove app from ArgoCD        | To unregister (doesn't delete K8s resources unless Prune enabled) |
| **Edit**         | Modify app settings           | To change sync policy, path, etc.                                 |
| **Details**      | View full configuration       | To see all app settings                                           |

---

### 📊 Application Details View

Click on an application to see:

1. **Top Bar:**

   - App health and sync status
   - **SYNC** button - Deploy changes
   - **REFRESH** - Check for updates
   - **DELETE** - Remove application
   - **APP DETAILS** - View settings

2. **Resource Tree:**

   - Visual graph of all Kubernetes resources
   - Shows relationships (Deployment → ReplicaSet → Pods)
   - Click any resource to see details

3. **Tabs:**
   - **SUMMARY** - Overview of app configuration
   - **PARAMETERS** - Helm/Kustomize parameters (if applicable)
   - **MANIFEST** - View rendered Kubernetes YAML
   - **EVENTS** - Recent activity log
   - **LOGS** - Live pod logs

---

## Syncing Your Application

### First-Time Sync (Manual)

Even if you set "Automatic" sync policy, you may need to manually sync the first time:

1. Go to **Applications** view
2. Find your application card
3. Click the **"SYNC"** button on the card

   - OR click the app → click **"SYNC"** in top bar

4. **Sync Options Dialog** appears:

   | Option         | Description                        | Recommendation                |
   | :------------- | :--------------------------------- | :---------------------------- |
   | **PRUNE**      | Delete resources not in Git        | Check if you want clean state |
   | **DRY RUN**    | Preview changes without applying   | Check to test first           |
   | **APPLY ONLY** | Don't run hooks/waves              | Usually leave unchecked       |
   | **FORCE**      | Force apply even on conflicts      | Only if normal sync fails     |
   | **REPLACE**    | Replace resources instead of patch | For complex changes           |

5. Click **"SYNCHRONIZE"** button

6. **Watch Progress:**
   - Resources appear in tree view as they're created
   - Wait for all to show green/healthy

---

### Automatic Sync Behavior

If you enabled **Automatic** sync policy:

- ArgoCD polls Git repo every **3 minutes** (default)
- When changes detected, automatically syncs
- No manual action needed
- You can watch real-time updates in the UI

---

## 🎯 Example: Complete Walkthrough

**Scenario**: Deploy frontend app from public GitHub repo

1. **Repository**: Already public at `https://github.com/saquibmansuri/k8s-playground.git`

   - ✅ No need to register in ArgoCD (public repo)

2. **Create Application**:

   - Application Name: `frontend-app`
   - Project: `default`
   - Sync Policy: `Automatic` (with PRUNE, SELF HEAL, AUTO-CREATE NAMESPACE checked)
   - Repository URL: `https://github.com/saquibmansuri/k8s-playground.git`
   - Revision: `main`
   - Path: `gke-files-argocd/frontend`
   - Cluster URL: `https://kubernetes.default.svc`
   - Namespace: `playground-argocd`
   - Click **CREATE**

3. **Sync**:

   - Click **SYNC** button
   - Select **PRUNE** option
   - Click **SYNCHRONIZE**

4. **Verify**:
   - Wait for green checkmarks
   - Resources should show: Deployment ✅, ReplicaSet ✅, Pods ✅

Done! 🎉

---

## 📚 Additional Resources

- **ArgoCD Official Docs**: https://argo-cd.readthedocs.io/

---

**💡 Pro Tips:**

- Always use Automatic sync policy for true GitOps
- Enable SELF HEAL to prevent manual cluster changes
- Use descriptive application names (e.g., `frontend-prod`, `backend-staging`)
- Check ArgoCD UI regularly for health status
- Review EVENTS tab when troubleshooting

Happy GitOps! 🚀
