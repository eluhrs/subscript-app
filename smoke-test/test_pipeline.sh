#!/bin/bash

# Test Pipeline for Subscript
# Usage: ./tests/test_pipeline.sh

set -e # Exit on error

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Starting Subscript Pipeline Tests..."

# Resolve Project Root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"
echo "Running from Project Root: $PROJECT_ROOT"

# Activate Virtual Environment
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Warning: venv not found. Running with system python."
fi

# Load .env if present (ignoring comments)
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Setup
TEST_DIR="smoke-test/output"
# Clean previous run to avoid stale debug crops
if [ -d "$TEST_DIR" ]; then
    echo "Cleaning previous test output..."
    rm -rf "$TEST_DIR"
fi
mkdir -p "$TEST_DIR"
SAMPLE_IMG="smoke-test/sample.jpg"

if [ ! -f "$SAMPLE_IMG" ]; then
    echo -e "${RED}Error: Sample image $SAMPLE_IMG not found.${NC}"
    exit 1
fi

# Function to check file existence
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}[PASS] File created: $1${NC}"
    else
        echo -e "${RED}[FAIL] File missing: $1${NC}"
        exit 1
    fi
}

# Test 1: Basic Processing (Single Image)
echo "-----------------------------------"
echo "Test 1: Basic Processing (gemini-2.5-flash)"
echo "-----------------------------------"
./subscript.py gemini-2.5-flash "$SAMPLE_IMG" --config smoke-test/test_config.yml --output-dir "$TEST_DIR/basic"

check_file "$TEST_DIR/basic/sample.xml"
check_file "$TEST_DIR/basic/sample.pdf"
check_file "$TEST_DIR/basic/sample.txt"

# Test 2: Combine Mode (Simulated Batch)
echo "-----------------------------------"
echo "Test 2: Combine Mode"
echo "-----------------------------------"
# We use the same image twice to simulate a batch
./subscript.py gemini-2.5-flash "$SAMPLE_IMG" "$SAMPLE_IMG" --config smoke-test/test_config.yml --combine combined_test --output-dir "$TEST_DIR/combine"

check_file "$TEST_DIR/combine/combined_test.pdf"
check_file "$TEST_DIR/combine/combined_test.txt"

# Test 3: Concurrency (Dry Run check mostly, as 2 images is small)
echo "-----------------------------------"
echo "Test 3: Concurrency Flag"
echo "-----------------------------------"
./subscript.py gemini-2.5-flash "$SAMPLE_IMG" --config smoke-test/test_config.yml --concurrency 2 --output-dir "$TEST_DIR/concurrency"

check_file "$TEST_DIR/concurrency/sample.xml"

echo "-----------------------------------"
echo -e "${GREEN}All Tests Passed!${NC}"
echo "Output is in $TEST_DIR"
