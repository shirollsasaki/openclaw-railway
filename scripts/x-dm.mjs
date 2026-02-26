import crypto from "crypto";
import https from "https";
import fs from "fs";
import path from "path";

const envPath = process.env.OPENCLAW_ENV_PATH || path.join(process.env.HOME || "$HOME", ".openclaw", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx);
        const val = trimmed.slice(eqIdx + 1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

const API_KEY = process.env.X_RICHARD_API_KEY;
const API_SECRET = process.env.X_RICHARD_API_SECRET;
const ACCESS_TOKEN = process.env.X_RICHARD_ACCESS_TOKEN;
const ACCESS_SECRET = process.env.X_RICHARD_ACCESS_SECRET;

// Parse args: x-dm.mjs "@username" "message text"
const args = process.argv.slice(2);
const username = args[0];
const messageText = args[1];

if (!username || !messageText) {
  console.error("Usage: node x-dm.mjs \"@username\" \"message text\"");
  console.error("Example: node x-dm.mjs \"@thedefiedge\" \"Hey, saw you're running...\"");
  process.exit(1);
}

if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
  console.error("Missing X API credentials. Need: X_RICHARD_API_KEY, X_RICHARD_API_SECRET, X_RICHARD_ACCESS_TOKEN, X_RICHARD_ACCESS_SECRET");
  process.exit(1);
}

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function sign(method, url, params, consumerSecret, tokenSecret) {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function buildAuthHeader(params) {
  return (
    "OAuth " +
    Object.keys(params)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(params[k])}"`)
      .join(", ")
  );
}

async function getUserId(username) {
  const cleanUsername = username.replace(/^@/, "");
  const url = `https://api.x.com/2/users/by/username/${cleanUsername}`;
  const method = "GET";

  const oauthParams = {
    oauth_consumer_key: API_KEY,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  const signature = sign(method, url, oauthParams, API_SECRET, ACCESS_SECRET);
  oauthParams.oauth_signature = signature;

  const authHeader = buildAuthHeader(oauthParams);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        Authorization: authHeader,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const result = JSON.parse(data);
          resolve(result.data.id);
        } else {
          console.error(`Error getting user ID: ${res.statusCode}: ${data}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function sendDM(participantId, text) {
  const url = "https://api.x.com/2/dm_conversations/with/:participant_id/messages".replace(":participant_id", participantId);
  const method = "POST";

  const oauthParams = {
    oauth_consumer_key: API_KEY,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  const signature = sign(method, url, oauthParams, API_SECRET, ACCESS_SECRET);
  oauthParams.oauth_signature = signature;

  const authHeader = buildAuthHeader(oauthParams);

  const payload = { text };
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const result = JSON.parse(data);
          console.log(`✅ DM sent to ${username}`);
          console.log(`Message ID: ${result.data.dm_event_id}`);
          resolve(result);
        } else {
          console.error(`Error ${res.statusCode}: ${data}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    console.log(`Looking up user: ${username}`);
    const userId = await getUserId(username);
    console.log(`Found user ID: ${userId}`);
    await sendDM(userId, messageText);
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
})();
