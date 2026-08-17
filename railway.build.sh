#!/bin/bash
# Railway build hook - installs Python dependencies
set -e

echo "📦 Installing Python dependencies..."
pip install -r TTMPC_THESIS/src/server/requirements.txt

echo "✅ Build complete!"
