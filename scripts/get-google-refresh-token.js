const { google } = require('googleapis');
const http = require('http');
const url = require('url');

// To run this script, ensure you have set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET
// either in your environment variables or in your .env.local file.

const fs = require('fs');
const path = require('path');

// Basic manual .env.local parsing for convenience
try {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#\s][^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  });
} catch (e) {
  // Ignore if .env.local doesn't exist
}

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Error: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set.");
  console.error("Please add them to your .env.local file or export them before running this script.");
  process.exit(1);
}

// OOB flow is deprecated. Use a local HTTP server callback instead.
// We use port 3001 to avoid conflicting with the Next.js dev server on 3000.
const redirectUri = 'http://localhost:3001/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

const scopes = [
  'https://www.googleapis.com/auth/drive.file'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // Force consent prompt to guarantee a refresh token is returned
  scope: scopes
});

console.log('1. Open the following URL in your browser:');
console.log(authUrl);
console.log('\n2. Authorize the application. It will redirect to localhost:3001.');
console.log('   (If you get a warning about the app being unverified, proceed to it anyway since it is your own app.)\n');
console.log('Waiting for authorization...\n');

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = url.parse(req.url, true);
    
    if (reqUrl.pathname === '/oauth2callback') {
      const code = reqUrl.query.code;
      if (code) {
        res.end('Authentication successful! Please return to the console.');
        server.close();
        
        const { tokens } = await oauth2Client.getToken(code);
        
        if (tokens.refresh_token) {
          console.log('\n✅ Successfully acquired Refresh Token!\n');
          console.log('Add the following line to your .env.local file:');
          console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
          console.log('⚠️  WARNING: Keep this refresh token secret. DO NOT commit it to version control.');
        } else {
          console.log('\n❌ No refresh token was returned.');
          console.log('This usually happens if you have already authorized this app previously.');
          console.log('To fix this, go to https://myaccount.google.com/permissions, remove access for this app, and run this script again.');
        }
      } else {
        res.end('Authentication failed! No code returned. Please try again.');
        server.close();
        console.error('\n❌ No authorization code was returned.');
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (error) {
    res.writeHead(500);
    res.end('Error occurred: ' + error.message);
    server.close();
    console.error('\n❌ Error retrieving tokens:', error.message);
  }
});

server.listen(3001, () => {
  // Started listening
});
