#!/bin/bash

# Prompt Injection Defense Lab - Setup and Run Script (Doppler Edition)

set -e

echo "=================================="
echo "Prompt Injection Defense Lab (Doppler)"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js version 18+ required${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✓ Node.js version check passed${NC}"
echo ""

# Check if Doppler is installed
if ! command -v doppler &> /dev/null; then
    echo -e "${RED}Error: Doppler CLI is not installed${NC}"
    echo "Please install Doppler from https://docs.doppler.com/docs/install-cli"
    exit 1
fi

echo -e "${GREEN}✓ Doppler check passed${NC}"
echo ""

# Function to check if dependencies are installed
check_dependencies() {
    if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
        return 1
    fi
    return 0
}

# Function to install dependencies
install_dependencies() {
    echo "=================================="
    echo "Installing Dependencies"
    echo "=================================="
    echo ""

    echo "Installing backend dependencies..."
    cd backend
    npm install
    cd ..
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
    echo ""

    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
    echo ""
}

# Function to check Doppler setup
setup_env() {
    echo "=================================="
    echo "Checking Environment"
    echo "=================================="
    echo ""
    if ! doppler configure &> /dev/null; then
        echo -e "${YELLOW}⚠ Doppler might not be fully configured for this project.${NC}"
        echo "Make sure to run 'doppler setup' if you encounter missing variables."
    else
        echo -e "${GREEN}✓ Doppler is configured${NC}"
    fi
    echo ""
}

# Function to start the application
start_app() {
    echo "=================================="
    echo "Starting Application with Doppler"
    echo "=================================="
    echo ""
    
    echo "Starting backend server on port 3001..."
    echo "Starting frontend server on port 3000..."
    echo ""
    echo -e "${GREEN}Once started, open: http://localhost:3000${NC}"
    echo ""
    echo "Press Ctrl+C to stop both servers"
    echo ""
    
    # Start backend and frontend in parallel
    trap 'kill 0' SIGINT
    
    (cd backend && doppler run -- npm run dev) &
    BACKEND_PID=$!
    
    sleep 3
    
    (cd frontend && doppler run -- npm run dev) &
    FRONTEND_PID=$!
    
    wait
}

# Main script logic
case "${1:-}" in
    "install")
        install_dependencies
        setup_env
        echo -e "${GREEN}Installation complete!${NC}"
        echo "Run './dopplersetup.sh start' to start the application"
        ;;
    "start")
        if ! check_dependencies; then
            echo -e "${YELLOW}Dependencies not found. Installing...${NC}"
            install_dependencies
        fi
        setup_env
        start_app
        ;;
    "clean")
        echo "Cleaning up..."
        rm -rf backend/node_modules backend/dist
        rm -rf frontend/node_modules frontend/dist
        echo -e "${GREEN}✓ Cleaned up build artifacts and dependencies${NC}"
        ;;
    *)
        echo "Usage: ./dopplersetup.sh [command]"
        echo ""
        echo "Commands:"
        echo "  install  - Install dependencies"
        echo "  start    - Start the application with doppler (installs if needed)"
        echo "  clean    - Remove node_modules and build artifacts"
        echo ""
        echo "Quick start: ./dopplersetup.sh start"
        ;;
esac
