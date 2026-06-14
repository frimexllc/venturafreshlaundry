#!/bin/bash
echo "========================================"
echo "  Ventura Fresh Laundry - Setup (Linux/Mac)"
echo "========================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null
then
    echo "ERROR: Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

echo "[1/4] Setting up backend..."
cd backend
if [ ! -f ".env" ]; then
    echo "Creating backend .env file from example..."
    cp .env.example .env
fi
echo "Installing Python dependencies..."
pip3 install -r requirements.txt
cd ..

echo ""
echo "[2/4] Setting up frontend..."
cd frontend
if [ ! -f ".env" ]; then
    echo "Creating frontend .env file from example..."
    cp .env.example .env
fi
echo "Installing Node.js dependencies with yarn..."
yarn install
cd ..

echo ""
echo "[3/4] Setting up notifications node..."
cd backend/notifications_node
if [ -f "package.json" ]; then
    echo "Installing Node.js dependencies for notifications..."
    yarn install
fi
cd ../..

echo ""
echo "[4/4] Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env and frontend/.env with your actual credentials"
echo "2. Make sure MongoDB is running locally or update MONGO_URL in backend/.env"
echo "3. Run ./deploy.sh to build and start the application"
echo ""
