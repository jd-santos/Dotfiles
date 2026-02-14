# Minimal Security Tests

Step-by-step tests to verify each security layer independently.

---

## Test 1: GitHub Branch Protection (5 minutes)

**Goal:** Verify that branch protection can prevent direct pushes to `main`.

### Prerequisites
- GitHub repo you can test with (I recommend creating a test repo, NOT Dotfiles yet)
- Terminal access to run git commands

### Steps

#### 1.1 Create a Test Repository

```bash
# Option A: Via GitHub CLI (if you have it)
gh repo create test-branch-protection --private --clone

# Option B: Via GitHub web
# Go to github.com/new
# Name: test-branch-protection
# Private: Yes
# Initialize with README: Yes
```

#### 1.2 Clone It Locally (if you used Option B)

```bash
cd ~/tmp  # or wherever you want to test
git clone git@github.com:YOUR_USERNAME/test-branch-protection.git
cd test-branch-protection
```

#### 1.3 Verify You Can Push to Main (Before Protection)

```bash
# Make a change
echo "Test before protection" >> README.md
git add README.md
git commit -m "Test: push to main before protection"
git push origin main
```

**Expected:** ✅ Push succeeds

#### 1.4 Enable Branch Protection on GitHub

1. Go to: `https://github.com/YOUR_USERNAME/test-branch-protection/settings/branches`
2. Click "Add rule" or "Add branch protection rule"
3. Branch name pattern: `main`
4. Check these boxes:
   - ✅ **Require a pull request before merging**
   - ✅ **Require approvals** (set to 1)
   - ✅ **Do not allow bypassing the above settings** (CRITICAL)
5. Click "Create" or "Save changes"

#### 1.5 Try to Push to Main Again (After Protection)

```bash
# Make another change
echo "Test after protection" >> README.md
git add README.md
git commit -m "Test: push to main after protection"
git push origin main
```

**Expected:** ❌ Push FAILS with error like:
```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Required status checks, approvals, and signatures are not all satisfied.
```

#### 1.6 Verify Feature Branches Still Work

```bash
# Create a feature branch
git checkout -b test-feature
git push origin test-feature
```

**Expected:** ✅ Push succeeds (feature branches are not protected)

#### 1.7 Test Pull Request Flow

```bash
# On GitHub, create a PR from test-feature to main
# Go to: https://github.com/YOUR_USERNAME/test-branch-protection/pulls
# Click "New pull request"
# Base: main, Compare: test-feature
# Create PR and merge it
```

**Expected:** ✅ PR can be created and merged (you're the admin)

### What This Proves

- [x] Branch protection prevents direct pushes to `main`
- [x] Feature branches can still be pushed
- [x] PRs are the only way to get code into `main`
- [x] This works BEFORE we add SSH deploy keys (it works with account keys too)

### Next Step

Once this works, we'll test with a deploy key that doesn't have admin access.

---

## Test 2: Deploy Key Access Control (10 minutes)

**Goal:** Verify that a deploy key with "write" access still can't push to a protected branch.

### Prerequisites
- Test repository from Test 1 with branch protection enabled
- SSH key generated (we'll generate a new test one)

### Steps

#### 2.1 Generate a Test Deploy Key

```bash
# Generate a new SSH key for testing
ssh-keygen -t ed25519 -f ~/.ssh/test_deploy_ed25519 -N '' -C "test-deploy-key"

# Display the public key
cat ~/.ssh/test_deploy_ed25519.pub
```

#### 2.2 Add Deploy Key to Test Repository

1. Go to: `https://github.com/YOUR_USERNAME/test-branch-protection/settings/keys`
2. Click "Add deploy key"
3. Title: `Test Deploy Key`
4. Key: Paste the public key from above
5. ✅ Check "Allow write access"
6. Click "Add key"

#### 2.3 Configure SSH to Use the Deploy Key

```bash
# Add to ~/.ssh/config
cat >> ~/.ssh/config << 'EOF'

Host github-deploy-test
    HostName github.com
    User git
    IdentityFile ~/.ssh/test_deploy_ed25519
    IdentitiesOnly yes
EOF
```

#### 2.4 Clone with Deploy Key

```bash
cd ~/tmp
# Use the custom host from SSH config
git clone git@github-deploy-test:YOUR_USERNAME/test-branch-protection.git test-deploy-clone
cd test-deploy-clone

# Verify we're using the deploy key
ssh -T git@github-deploy-test
# Should say: "Hi YOUR_USERNAME/test-branch-protection! ..."
```

#### 2.5 Try to Push to Main with Deploy Key

```bash
# Make a change
echo "Deploy key test" >> README.md
git add README.md
git commit -m "Test: deploy key push to main"

# This should fail
git push origin main
```

**Expected:** ❌ Push FAILS (same error as before - branch protection applies to ALL keys)

#### 2.6 Push to Feature Branch with Deploy Key

```bash
git checkout -b deploy-feature
git push origin deploy-feature
```

**Expected:** ✅ Push succeeds

### What This Proves

- [x] Deploy keys can push to feature branches
- [x] Deploy keys CANNOT push to protected branches (even with write access)
- [x] Branch protection is enforced server-side (can't be bypassed by key type)

### Critical Understanding

**Deploy keys don't directly restrict branch access** - they're repo-specific but still have write permission. The restriction comes from **branch protection rules**, which apply to ALL keys (account keys, deploy keys, etc.).

The security model is:
1. **Deploy key** = limits which repos can be accessed
2. **Branch protection** = limits which branches can be pushed to
3. Together = agent can only push feature branches to specific repos

---

## Test 3: SSH Key per Container (15 minutes)

**Goal:** Verify we can have different SSH keys in different containers.

### Prerequisites
- Docker running
- Test repository from Test 2

### Steps

#### 3.1 Create Two Simple Test Containers

```bash
cd ~/tmp
mkdir test-keys
cd test-keys
```

Create `Dockerfile`:
```dockerfile
FROM fedora:41
RUN dnf install -y openssh-clients git
RUN useradd -m -s /bin/bash testuser
USER testuser
WORKDIR /home/testuser
CMD ["sleep", "infinity"]
```

Create `docker-compose.yml`:
```yaml
services:
  container-a:
    build: .
    container_name: test-key-a
    volumes:
      - key-a:/home/testuser/.ssh
  
  container-b:
    build: .
    container_name: test-key-b
    volumes:
      - key-b:/home/testuser/.ssh

volumes:
  key-a:
  key-b:
```

#### 3.2 Start Containers

```bash
docker compose up -d
docker compose ps
```

#### 3.3 Generate Different Keys in Each Container

```bash
# Container A
docker exec -u testuser test-key-a ssh-keygen -t ed25519 -f /home/testuser/.ssh/id_ed25519 -N '' -C "container-a"

# Container B
docker exec -u testuser test-key-b ssh-keygen -t ed25519 -f /home/testuser/.ssh/id_ed25519 -N '' -C "container-b"
```

#### 3.4 Verify Keys Are Different

```bash
echo "=== Container A Key ==="
docker exec -u testuser test-key-a cat /home/testuser/.ssh/id_ed25519.pub

echo ""
echo "=== Container B Key ==="
docker exec -u testuser test-key-b cat /home/testuser/.ssh/id_ed25519.pub
```

**Expected:** Different public keys (check the end of each line)

#### 3.5 Add Keys as Different Deploy Keys

Add Container A's key as "Deploy Key A" and Container B's key as "Deploy Key B" to your test repo (same process as Test 2).

#### 3.6 Test Access from Each Container

```bash
# Configure SSH in Container A
docker exec -u testuser test-key-a bash -c 'mkdir -p ~/.ssh && cat > ~/.ssh/config << EOF
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
EOF'

# Same for Container B
docker exec -u testuser test-key-b bash -c 'mkdir -p ~/.ssh && cat > ~/.ssh/config << EOF
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
EOF'

# Test from Container A
docker exec -u testuser test-key-a ssh -T git@github.com
# Should work

# Test from Container B
docker exec -u testuser test-key-b ssh -T git@github.com
# Should work

# If you DELETE one deploy key from GitHub and retry, that container should fail
```

### What This Proves

- [x] Each container can have its own SSH key
- [x] Keys persist in Docker volumes
- [x] Keys can be independently revoked on GitHub

### Cleanup

```bash
cd ~/tmp/test-keys
docker compose down -v
cd ..
rm -rf test-keys
```

---

## Test 4: Your Current Setup Compatibility (5 minutes)

**Goal:** Verify your current dev-container can still work while we add new security.

### Steps

#### 4.1 Check Current SSH Keys

```bash
ls -la ~/.ssh/
```

Look for `dev_container_ed25519` (or similar) - this is your current key.

#### 4.2 Verify Current Key Is on GitHub

1. Go to: `https://github.com/settings/keys`
2. Look for a key titled "Docker Dev Container" or similar
3. Note whether it's an **Account SSH key** or a **Deploy key**

**Expected:** It should be an Account SSH key (under your main account settings)

#### 4.3 Verify Current Container Can Still Push

If you have the dev-container running:

```bash
# SSH into it
ssh -p 2222 dev@localhost

# Try cloning Dotfiles
cd /tmp
git clone git@github.com:YOUR_USERNAME/Dotfiles.git
cd Dotfiles

# Make a test change on a branch
git checkout -b test-minimal-setup
git commit --allow-empty -m "Test: verify current setup still works"
git push origin test-minimal-setup
```

**Expected:** ✅ Works (your current setup is unaffected)

### What This Proves

- [x] Current dev-container setup still works
- [x] We can add new containers with different keys without breaking existing setup
- [x] No changes needed to your current development workflow

---

## Summary: What We Learned

After completing these tests, you understand:

1. **Branch Protection** is the server-side enforcement (GitHub's job)
2. **Deploy Keys** limit repo access (can't access other repos)
3. **Container Isolation** gives each container its own identity
4. **Your Current Setup** continues working while you add new restricted containers

### Next: Apply to Real Setup

Once these tests pass, you can:
1. Enable branch protection on your actual Dotfiles repo
2. Add deploy keys for new restricted containers
3. Keep your existing dev-container with account key (full access)

### Security Model Recap

```
GitHub Account (you)
    ├── Account SSH Key (dev-container) ────► All repos, all branches*
    ├── Deploy Key A (openclaw) ───────────► Dotfiles only, branches only**
    └── Deploy Key B (opencode-web) ───────► Dotfiles only, branches only**

* Can push to main IF you're repo admin AND no branch protection
** Cannot push to main BECAUSE of branch protection (applies to all keys)
```

The key insight: **Branch protection is the safety net**, not the key type. Deploy keys just add repo-scoping on top.
