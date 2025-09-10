#!/bin/bash

# Build script for NodePassDash
set -e  # Exit on any error

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting build process...${NC}"
echo -e "${CYAN}Current directory: $(pwd)${NC}"

# Step 1: Build frontend
echo -e "\n${YELLOW}Step 1: Building frontend...${NC}"

# Check if web directory exists
if [ ! -d "web" ]; then
    echo -e "${RED}ERROR: web directory not found!${NC}"
    exit 1
fi

# Go to web directory and build
cd web
if ! pnpm install --frozen-lockfile; then
    echo -e "${RED}ERROR: pnpm install failed!${NC}"
    exit 1
fi

if ! pnpm build; then
    echo -e "${RED}ERROR: pnpm build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Frontend built successfully!${NC}"

# Go back to root directory
cd ..

# Step 2: Verify frontend build output
echo -e "\n${YELLOW}Step 2: Verifying build output...${NC}"

# Check if dist folder exists in cmd/server/
if [ ! -d "cmd/server/dist" ]; then
    echo -e "${RED}ERROR: Frontend build output not found at cmd/server/dist!${NC}"
    exit 1
fi

echo -e "${GREEN}Build output verified at cmd/server/dist/${NC}"
echo -e "${CYAN}Build contents:${NC}"
ls -la cmd/server/dist/ | head -10

# Step 3: Go cross compilation
echo -e "\n${YELLOW}Step 3: Running Go cross compilation...${NC}"

# Create release directory
mkdir -p release

# Set environment variables for cross compilation
export CGO_ENABLED=0

# Build Linux binary
echo -e "${CYAN}Building Linux binary...${NC}"
export GOOS=linux
export GOARCH=amd64
if ! go build -o release/nodepassdash ./cmd/server; then
    echo -e "${RED}ERROR: Linux Go compilation failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Linux binary (release/nodepassdash) built successfully!${NC}"

# Build Windows binary
echo -e "${CYAN}Building Windows binary...${NC}"
export GOOS=windows
export GOARCH=amd64
if ! go build -o release/nodepassdash.exe ./cmd/server; then
    echo -e "${RED}ERROR: Windows Go compilation failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Windows binary (release/nodepassdash.exe) built successfully!${NC}"

# Success message
echo -e "\n${GREEN}✓ Build process completed!${NC}"
echo -e "${CYAN}- Frontend built and embedded to: cmd/server/dist/${NC}"
echo -e "${CYAN}- Go Linux binary generated: release/nodepassdash${NC}"
echo -e "${CYAN}- Go Windows binary generated: release/nodepassdash.exe${NC}"

echo -e "\n${GREEN}Release files:${NC}"
ls -la release/

echo -e "\n${YELLOW}Press any key to exit...${NC}"
read -n 1