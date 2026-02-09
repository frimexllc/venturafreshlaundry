#!/bin/bash
# n8n Initialization Script for Ventura Fresh Laundry

export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_HOST=localhost
export WEBHOOK_URL=http://localhost:5678/
export N8N_BASIC_AUTH_ACTIVE=true
export N8N_BASIC_AUTH_USER=admin
export N8N_BASIC_AUTH_PASSWORD=vfl2024admin
export N8N_ENCRYPTION_KEY=vfl-n8n-encryption-key-2024
export GENERIC_TIMEZONE=America/Los_Angeles
export N8N_USER_FOLDER=/app/n8n
export N8N_CONFIG_FILES=/app/n8n/config.json

# CRM API URL
export CRM_API_URL="https://laundry-portal-5.preview.emergentagent.com"

echo "Starting n8n on port $N8N_PORT..."
echo "Admin URL: http://localhost:$N8N_PORT"
echo "Username: $N8N_BASIC_AUTH_USER"
echo "Password: $N8N_BASIC_AUTH_PASSWORD"

# Start n8n
n8n start
