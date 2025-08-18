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

# Step 1: pnpm build
echo -e "\n${YELLOW}Step 1: Running pnpm build...${NC}"
if ! pnpm build; then
    echo -e "${RED}ERROR: pnpm build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}pnpm build completed successfully!${NC}"

# Step 2: Compress dist folder
echo -e "\n${YELLOW}Step 2: Compressing dist folder...${NC}"

# Remove existing dist.zip if exists
if [ -f "dist.zip" ]; then
    rm -f dist.zip
fi

# Check if dist folder exists
if [ ! -d "dist" ]; then
    echo -e "${RED}ERROR: dist folder not found after build!${NC}"
    exit 1
fi

# Use bandizip command line tool
# Format: bz a -r <archive> <files>
if ! bz a -r dist.zip dist/; then
    echo -e "${RED}ERROR: Failed to compress dist folder!${NC}"
    exit 1
fi
echo -e "${GREEN}dist folder compressed successfully!${NC}"

# Step 3: Move dist.zip to cmd/server/
echo -e "\n${YELLOW}Step 3: Moving dist.zip to cmd/server/...${NC}"

# Create cmd/server directory if it doesn't exist
mkdir -p cmd/server

# Remove existing dist.zip in target directory
if [ -f "cmd/server/dist.zip" ]; then
    rm -f cmd/server/dist.zip
fi

# Move the file
if ! mv dist.zip cmd/server/; then
    echo -e "${RED}ERROR: Failed to move dist.zip!${NC}"
    exit 1
fi
echo -e "${GREEN}dist.zip moved successfully!${NC}"

# Step 4: Go cross compilation
echo -e "\n${YELLOW}Step 4: Running Go cross compilation...${NC}"

# Set environment variables for cross compilation
export CGO_ENABLED=0

# Build Linux binary
echo -e "${CYAN}Building Linux binary...${NC}"
export GOOS=linux
export GOARCH=amd64
if ! go build -o nodepassplus ./cmd/server; then
    echo -e "${RED}ERROR: Linux Go compilation failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Linux binary (nodepassplus) built successfully!${NC}"

# Build Windows binary
echo -e "${CYAN}Building Windows binary...${NC}"
export GOOS=windows
export GOARCH=amd64
if ! go build -o nodepassplus.exe ./cmd/server; then
    echo -e "${RED}ERROR: Windows Go compilation failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Windows binary (nodepassplus.exe) built successfully!${NC}"

# Success message
echo -e "\n${GREEN}✓ Build process completed!${NC}"
echo -e "${CYAN}- Frontend built and compressed to: cmd/server/dist.zip${NC}"
echo -e "${CYAN}- Go Linux binary generated: nodepassplus${NC}"
echo -e "${CYAN}- Go Windows binary generated: nodepassplus.exe${NC}"

echo -e "\n${YELLOW}Press any key to exit...${NC}"
read -n 1