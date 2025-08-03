#!/usr/bin/env node

/**
 * Simple test script for Shopify Login API
 * Usage: node test-shopify-api.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000';
const API_ENDPOINT = '/api/shopify/login';

// Test cases
const testCases = [
  {
    name: 'Missing shop parameter',
    url: `${BASE_URL}${API_ENDPOINT}`,
    expectedStatus: 400,
    expectedError: 'Shop parameter is required'
  },
  {
    name: 'Invalid shop domain',
    url: `${BASE_URL}${API_ENDPOINT}?shop=invalid-domain.com`,
    expectedStatus: 400,
    expectedError: 'Invalid shop domain'
  },
  {
    name: 'Valid shop domain (should redirect)',
    url: `${BASE_URL}${API_ENDPOINT}?shop=push-eagle-test1.myshopify.com`,
    expectedStatus: [302, 307],
    expectedRedirect: true
  },
  {
    name: 'Valid shop domain with https (should redirect)',
    url: `${BASE_URL}${API_ENDPOINT}?shop=https://push-eagle-test1.myshopify.com`,
    expectedStatus: [302, 307],
    expectedRedirect: true
  },
  {
    name: 'Valid shop domain with trailing slash (should redirect)',
    url: `${BASE_URL}${API_ENDPOINT}?shop=push-eagle-test1.myshopify.com/`,
    expectedStatus: [302, 307],
    expectedRedirect: true
  },
  {
    name: 'OAuth callback with invalid HMAC',
    url: `${BASE_URL}${API_ENDPOINT}?shop=push-eagle-test1.myshopify.com&code=test_code&state=test_state&hmac=invalid_hmac`,
    expectedStatus: [400, 500],
    expectedError: 'Invalid HMAC signature'
  },
  {
    name: 'Malformed URL with full shop URL',
    url: `${BASE_URL}${API_ENDPOINT}?https://push-eagle-test1.myshopify.com/`,
    expectedStatus: 400,
    expectedError: 'Shop parameter is required'
  }
];

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function runTests() {
  console.log('🧪 Testing Shopify Login API\n');
  console.log('Make sure your development server is running on http://localhost:3000\n');
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`🔗 URL: ${testCase.url}`);
    
    try {
      const response = await makeRequest(testCase.url);
      
      console.log(`📊 Status: ${response.statusCode}`);
      
      const expectedStatuses = Array.isArray(testCase.expectedStatus) 
        ? testCase.expectedStatus 
        : [testCase.expectedStatus];
      
      if (expectedStatuses.includes(response.statusCode)) {
        console.log('✅ Status code matches expected');
      } else {
        console.log(`❌ Expected ${expectedStatuses.join(' or ')}, got ${response.statusCode}`);
      }
      
      if (testCase.expectedRedirect && (response.statusCode === 302 || response.statusCode === 307)) {
        const location = response.headers.location;
        console.log(`🔄 Redirect location: ${location}`);
        
        if (location && location.includes('myshopify.com')) {
          console.log('✅ Redirects to Shopify OAuth page');
        } else {
          console.log('❌ Unexpected redirect location');
        }
      }
      
      if (response.data) {
        try {
          const jsonData = JSON.parse(response.data);
          if (jsonData.error) {
            console.log(`📝 Error message: ${jsonData.error}`);
            
            if (testCase.expectedError && jsonData.error.includes(testCase.expectedError)) {
              console.log('✅ Error message matches expected');
            } else {
              console.log('❌ Unexpected error message');
            }
          }
        } catch (e) {
          // Not JSON, that's okay
        }
      }
      
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
  }
  
  console.log('\n🎉 Test run completed!');
  console.log('\n💡 Next steps:');
  console.log('1. Set up your Shopify app with correct API credentials');
  console.log('2. Configure your .env.local file');
  console.log('3. Test the complete OAuth flow with a real Shopify store');
}

// Check if server is running
async function checkServer() {
  try {
    await makeRequest(BASE_URL);
    console.log('✅ Server is running');
    return true;
  } catch (error) {
    console.log('❌ Server is not running. Please start your development server:');
    console.log('   npm run dev');
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await runTests();
  }
}

main().catch(console.error); 