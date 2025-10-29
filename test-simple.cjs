const axios = require('axios');

async function test() {
  try {
    console.log('Testing server...');
    const response = await axios.get('http://localhost:4000/health');
    console.log('✅ Server is running:', response.data);
  } catch (error) {
    console.log('❌ Server not running:', error.message);
  }
}

test();
