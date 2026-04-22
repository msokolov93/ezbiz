#!/bin/bash
set -e

if [ ! -f .env ]; then
  echo "==> No .env found, copying example.env..."
  cp example.env .env
fi

echo "==> Installing backend dependencies..."
cd backend
npm ci
cd ..

echo "==> Tearing down existing containers and volumes..."
docker compose down -v

echo "==> Building and starting Docker containers..."
docker compose up --build -d

echo "Done! App running at http://localhost:80"
