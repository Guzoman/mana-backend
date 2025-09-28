#!/bin/bash
# Rebuild script for applying Auth-BFF and Nginx changes

echo "🔄 Rebuilding Auth-BFF container..."
docker-compose build auth-bff

echo "🔄 Restarting services..."
docker-compose down auth-bff reverse-proxy
docker-compose up -d auth-bff reverse-proxy

echo "⏳ Waiting for services to start..."
sleep 15

echo "🔍 Checking service health..."
docker-compose ps auth-bff reverse-proxy

echo "📋 Recent logs:"
docker-compose logs --tail=30 auth-bff

echo "✅ Rebuild complete!"
echo ""
echo "🧪 Testing /hola endpoint..."
curl -X POST https://api.manaproject.app/hola \
  -H 'Content-Type: application/json' \
  -d '{"userId":"aabbcc","userLanguage":"es","question":""}' \
  -v

echo ""
echo "📋 Auth-BFF logs after test:"
docker-compose logs --tail=10 auth-bff

echo ""
echo "🔧 Also test with explicit 'boot':"
curl -X POST https://api.manaproject.app/hola \
  -H 'Content-Type: application/json' \
  -d '{"userId":"testuser","userLanguage":"en","question":"boot"}' \
  -v
