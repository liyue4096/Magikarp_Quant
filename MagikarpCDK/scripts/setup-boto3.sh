#!/bin/bash
# Setup boto3 for backfill scripts
#
# This script helps install boto3 on systems with externally-managed Python environments

set -e

echo "=========================================="
echo "boto3 Setup for Magikarp Backfill Scripts"
echo "=========================================="
echo ""

# Check if boto3 is already installed
if python3 -c "import boto3" 2>/dev/null; then
    echo "✓ boto3 is already installed!"
    python3 -c "import boto3; print(f'  Version: {boto3.__version__}')"
    exit 0
fi

echo "boto3 is not installed. Choose installation method:"
echo ""
echo "1. System package (Recommended - requires sudo)"
echo "2. User install (No sudo required)"
echo "3. Virtual environment (Isolated)"
echo "4. Exit"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "Installing python3-boto3 via apt..."
        sudo apt update
        sudo apt install -y python3-boto3
        echo ""
        echo "✓ Installation complete!"
        ;;
    2)
        echo ""
        echo "Installing boto3 via pip (user install)..."
        pip3 install --user boto3
        echo ""
        echo "✓ Installation complete!"
        echo ""
        echo "Note: Make sure ~/.local/bin is in your PATH"
        ;;
    3)
        VENV_PATH="$HOME/venv-magikarp"
        echo ""
        echo "Creating virtual environment at $VENV_PATH..."
        python3 -m venv "$VENV_PATH"
        source "$VENV_PATH/bin/activate"
        pip install boto3
        echo ""
        echo "✓ Installation complete!"
        echo ""
        echo "To use the virtual environment:"
        echo "  source $VENV_PATH/bin/activate"
        echo ""
        echo "Or run scripts directly with:"
        echo "  $VENV_PATH/bin/python3 scripts/backfill-missing-data.py"
        ;;
    4)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

# Verify installation
echo ""
echo "Verifying installation..."
if python3 -c "import boto3" 2>/dev/null; then
    echo "✓ boto3 is now available!"
    python3 -c "import boto3; print(f'  Version: {boto3.__version__}')"
else
    echo "❌ Installation verification failed"
    exit 1
fi
