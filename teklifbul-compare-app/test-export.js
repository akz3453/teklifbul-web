const axios = require('axios');

async function testExport() {
  try {
    console.log('🧪 Testing Excel export endpoint...');
    
    // Test the export endpoint
    const response = await axios.get('http://localhost:3001/api/export/compare', {
      params: {
        requestId: 'PR-2025-001',
        membership: 'standard'
      },
      responseType: 'arraybuffer'
    });
    
    console.log('✅ Export successful!');
    console.log('📊 Response status:', response.status);
    console.log('📁 Content type:', response.headers['content-type']);
    console.log('📏 File size:', response.data.length, 'bytes');
    
    // Save the file for testing
    const fs = require('fs');
    fs.writeFileSync('test-export.xlsx', response.data);
    console.log('💾 Test file saved as test-export.xlsx');
    
  } catch (error) {
    console.error('❌ Export test failed:', error.response?.data || error.message);
  }
}

// Wait a bit for server to start, then test
setTimeout(testExport, 3000);
