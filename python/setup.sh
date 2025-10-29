#!/bin/bash
# Setup script for Excel Integration System

echo "🚀 Setting up Excel Integration System..."

# Create necessary directories
mkdir -p templates
mkdir -p generated
mkdir -p logs

# Copy Excel templates to templates directory
echo "📋 Copying Excel templates..."
if [ -f "teklif formu.xlsx" ]; then
    cp "teklif formu.xlsx" templates/
    echo "✅ Copied teklif formu.xlsx"
fi

if [ -f "teklif mukayese formu.xlsx" ]; then
    cp "teklif mukayese formu.xlsx" templates/
    echo "✅ Copied teklif mukayese formu.xlsx"
fi

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
pip install -r requirements.txt

# Set up environment variables
echo "🔧 Setting up environment variables..."
cat > .env << EOF
# Firebase Configuration
FIREBASE_PROJECT_ID=teklifbul
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# Excel Integration
TEMPLATES_DIR=templates
GENERATED_DIR=generated
MAX_FILE_SIZE=10485760  # 10MB
EOF

echo "✅ Setup completed!"
echo ""
echo "📝 Next steps:"
echo "1. Update .env file with your Firebase credentials"
echo "2. Place your Excel templates in the templates/ directory"
echo "3. Run: python firebase_functions_integration.py"
echo ""
echo "🔗 API Endpoints:"
echo "- POST /generate-bid-template - Generate bid template"
echo "- POST /process-bid-submission - Process submitted bid"
echo "- POST /generate-comparison-table - Generate comparison table"
echo "- GET /download-template?path=filename - Download template"
echo "- GET /download-comparison?path=filename - Download comparison"
echo "- GET /health - Health check"
