#!/bin/bash
# deploy-multi-role-features.sh
# Çok rollü firma + yönlendirme + teklifler ekranı deployment script'i

echo "🚀 Starting deployment of multi-role company features..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Please run:"
    echo "firebase login"
    exit 1
fi

echo "📋 Deploying Firestore indexes..."
firebase deploy --only firestore:indexes

echo "📋 Deploying Firestore rules..."
firebase deploy --only firestore:rules

echo "📋 Deploying storage rules..."
firebase deploy --only storage

echo "✅ Deployment completed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Run the migration script to update existing users:"
echo "   node migrate-users-multi-role.js"
echo ""
echo "2. Test the following features:"
echo "   - Create demands with categories and groups"
echo "   - Publish demands and verify supplier matching"
echo "   - Check incoming/outgoing demands tabs"
echo "   - Check incoming/outgoing bids tabs"
echo "   - Verify multi-role company support"
echo ""
echo "3. Monitor Firestore console for any index creation prompts"
echo "   - Click 'Create index' when prompted"
echo "   - Wait for indexes to be 'Ready' before testing"
