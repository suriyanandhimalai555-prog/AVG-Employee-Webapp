#!/bin/bash

set -e

echo "=================================="
echo "Starting Deployment"
echo "=================================="

cd /root/otp/apps/AVG-Employee-Webapp

echo "Pulling latest code..."
git pull origin main

echo "Stopping containers..."
docker compose down

echo "Building containers..."
docker compose build --no-cache

echo "Starting containers..."
docker compose up -d

echo "Removing unused images..."
docker image prune -af

echo "Deployment Complete!"
