/**
 * x-thread.mjs — Post a thread to @CLIRichard
 * Usage: node x-thread.mjs (reads TWEETS array from this file or pass JSON file as arg)
 */
import crypto from "crypto";
import https from "https";
import fs from "fs";
import path from "path";

const envPath = path.join(process.env.HOME || "$HOME", ".openclaw", ".env");
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

if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
  console.error("Missing X API credentials.");
  process.exit(1);
}

// Load tweets from JSON file arg or use inline TWEETS
let TWEETS;
if (process.argv[2] && fs.existsSync(process.argv[2])) {
  TWEETS = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
} else {
  console.error("Usage: node x-thread.mjs <tweets.json>");
  process.exit(1);
}

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function sign(method, url, params, consumerSecret, tokenSecret) {
  const paramString = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function buildAuthHeader(params) {
  return "OAuth " + Object.keys(params).sort().map((k) => `${percentEncode(k)}="${percentEncode(params[k])}"`).join(", ");
}

async function postTweet(text, replyToId = null) {
  const url = "https://api.x.com/2/tweets";
  const oauthParams = {
    oauth_consumer_key: API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  oauthParams.oauth_signature = sign("POST", url, oauthParams, API_SECRET, ACCESS_SECRET);
  const authHeader = buildAuthHeader(oauthParams);
  const payload = { text };
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postThread() {
  let prevId = null;
  const urls = [];
  for (let i = 0; i < TWEETS.length; i++) {
    const tweet = TWEETS[i];
    console.log(`\nPosting tweet ${i + 1}/${TWEETS.length}...`);
    const result = await postTweet(tweet, prevId);
    prevId = result.data.id;
    const tweetUrl = `https://x.com/CLIRichard/status/${prevId}`;
    urls.push(tweetUrl);
    console.log(i === 0 ? `Thread started: ${tweetUrl}` : `  ↳ Reply ${i + 1}: ${tweetUrl}`);
    if (i < TWEETS.length - 1) await sleep(1500); // small delay between posts
  }
  console.log(`\n✅ Thread complete. Root: ${urls[0]}`);
}

postThread().catch((e) => { console.error(e.message); process.exit(1); });
