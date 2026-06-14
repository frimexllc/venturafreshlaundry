#!/bin/bash
echo "========================================"
echo "  Ventura Fresh Laundry - Deploy (Linux/Mac)"
echo "========================================"
echo ""

echo "[1/2] Building frontend..."
cd frontend
echo "Running yarn build..."
yarn build
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed!"
    exit 1
fi
cd ..

echo ""
echo "[2/2] Starting backend server..."
cd backend
echo "Starting uvicorn on port 8001..."
uvicorn server:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!

echo ""
echo "Deployment complete!"
echo ""
echo "Backend is running on http://localhost:8001 (PID: $BACKEND_PID)"
echo "Visit http://localhost:8001 to access the application"
echo ""
echo "To stop the backend, run: kill $BACKEND_PID"
