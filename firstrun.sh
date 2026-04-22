#!/bin/bash
set -e

# ── 1. Install Docker ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg lsb-release
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo "==> Docker installed. Continuing with sudo for docker commands..."
  DOCKER_CMD="sudo docker"
else
  DOCKER_CMD="docker"
fi

# ── 2. Ensure docker compose (v2 plugin) is available ───────────────────────
if ! $DOCKER_CMD compose version &>/dev/null; then
  echo "==> Installing docker-compose-plugin..."
  sudo apt-get install -y docker-compose-plugin
fi

# ── 3. Create .env from example if missing ──────────────────────────────────
if [ ! -f .env ]; then
  echo "==> No .env found, copying example.env..."
  cp example.env .env
fi

# ── 4. Build and start all services ─────────────────────────────────────────
echo "==> Building and starting Docker containers..."
$DOCKER_CMD compose up --build -d

echo ""
echo "Done! App running at http://localhost:80"
