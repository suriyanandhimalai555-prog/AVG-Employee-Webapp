#!/bin/bash

set -e

echo "=================================="
echo "Starting Deployment"
echo "=================================="

cd /root/otp/apps/AVG-Employee-Webapp

echo "Git Pull"
time git pull origin main

echo "Docker Pull"
time docker compose pull

echo "Docker Restart"
time docker compose up -d --remove-orphans

echo "Docker Cleanup"
time docker image prune -af

echo "=================================="
echo "Deployment Completed Successfully"
echo "=================================="
