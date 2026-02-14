#!/bin/bash
# n8n startup script for Ventura Fresh Laundry

# Set environment variables
export N8N_HOST=0.0.0.0
export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_BASIC_AUTH_ACTIVE=true
export N8N_BASIC_AUTH_USER=admin
export N8N_BASIC_AUTH_PASSWORD=ventura2024
export GENERIC_TIMEZONE=America/Los_Angeles
export N8N_LOG_LEVEL=info
export N8N_USER_FOLDER=/app/n8n/data
export EXECUTIONS_DATA_SAVE_ON_ERROR=all
export EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
export EXECUTIONS_DATA_SAVE_ON_PROGRESS=true
export EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true
export N8N_METRICS=true

# Create data directory if not exists
mkdir -p /app/n8n/data

# Start n8n
exec /usr/bin/n8n start
