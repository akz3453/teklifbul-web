const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`);
  
  // Parse the URL to separate path from query parameters
  const parsedUrl = url.parse(req.url);
  let filePath = parsedUrl.pathname;
  
  // Handle root path
  if (filePath === '/') {
    filePath = '/bids.html';
  }
  
  // Resolve the file path - check both public folder and root
  let resolvedPath = path.join(__dirname, 'public', filePath);
  
  // If file doesn't exist in public, try root directory
  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = path.join(__dirname, filePath);
  }
  
  filePath = resolvedPath;
  
  // Get file extension
  const extname = path.extname(filePath);
  
  // Set content type based on extension
  let contentType = 'text/html';
  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.ico':
      contentType = 'image/x-icon';
      break;
    case '.json':
      contentType = 'application/json';
      break;
  }
  
  // Read the file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        // Server error
        res.writeHead(500);
        res.end('500 Internal Server Error');
      }
    } else {
      // Success
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});