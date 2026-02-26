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

// Parse args: x-post.mjs "text" [--reply <tweet_id>] [--quote <tweet_id>]
const args = process.argv.slice(2);
const text = args[0];
let replyToId = null;
let quoteTweetId = null;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--reply" && args[i + 1]) replyToId = args[++i];
  if (args[i] === "--quote" && args[i + 1]) quoteTweetId = args[++i];
}

if (!text) {
  console.error("Usage: node x-post.mjs \"tweet text\" [--reply <tweet_id>] [--quote <tweet_id>]");
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

async function post(tweetText) {
  const url = "https://api.x.com/2/tweets";
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

  const payload = { text: tweetText };
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };
  if (quoteTweetId) payload.quote_tweet_id = quoteTweetId;

  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const result = JSON.parse(data);
            const id = result.data.id;
            const url = `https://x.com/CLIRichard/status/${id}`;
            if (replyToId) console.log(`Replied: ${url}`);
            else if (quoteTweetId) console.log(`Quote tweeted: ${url}`);
            else console.log(`Posted: ${url}`);
            resolve(result);
          } else {
            console.error(`Error ${res.statusCode}: ${data}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

post(text).catch(() => process.exit(1));
