#!/bin/bash
set -e

export OPENCLAW_HOME="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_HOME/openclaw.json"

echo "=== OpenClaw Railway Entrypoint ==="
echo "OPENCLAW_HOME: $OPENCLAW_HOME"

mkdir -p "$OPENCLAW_HOME"
mkdir -p "$OPENCLAW_HOME/cron/runs"
mkdir -p "$OPENCLAW_HOME/logs"

# Seed volume from GitHub tarball if not yet initialized
if [ ! -f "$OPENCLAW_HOME/openclaw.json" ]; then
  echo "Volume is empty — seeding from GitHub tarball..."
  curl -L -o /tmp/seed.tar.gz https://github.com/shirollsasaki/openclaw-railway/raw/main/seed.tar.gz
  tar -xzf /tmp/seed.tar.gz -C "$OPENCLAW_HOME/"
  rm /tmp/seed.tar.gz
  echo "Seed complete. Files:"
  ls "$OPENCLAW_HOME/"
fi

# Write Anthropic auth profile from env var
if [ -n "$ANTHROPIC_API_KEY" ]; then
  AUTH_DIR="$OPENCLAW_HOME/agents/main/agent"
  mkdir -p "$AUTH_DIR"
  if [ ! -f "$AUTH_DIR/auth-profiles.json" ]; then
    echo "Writing Anthropic auth profile..."
    cat > "$AUTH_DIR/auth-profiles.json" <<EOF
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "$ANTHROPIC_API_KEY"
    }
  },
  "lastGood": {
    "anthropic": "anthropic:default"
  }
}
EOF
  fi
fi
if [ ! -f "$OPENCLAW_HOME/scripts/x-post.mjs" ]; then
  echo "Copying scripts to volume..."
  cp -r /app/scripts/. "$OPENCLAW_HOME/scripts/"
fi

if [ ! -f "$OPENCLAW_HOME/.env" ]; then
  echo "Creating .env from environment variables..."
  env | grep -E '^(DISCORD_|X_RICHARD|X_PERSONAL|OPENCLAW_GATEWAY_TOKEN|GITHUB_TOKEN|KOO_API_KEY)' > "$OPENCLAW_HOME/.env"
  chmod 600 "$OPENCLAW_HOME/.env"
fi

for agent in jared monica; do
  SKILL_DIR="$OPENCLAW_HOME/$agent/skills/x-writing-system"
  if [ -d "$SKILL_DIR" ] && [ ! -d "$SKILL_DIR/node_modules" ]; then
    echo "Installing x-writing-system deps for $agent..."
    (cd "$SKILL_DIR" && bun install --frozen-lockfile 2>/dev/null || bun install) || true
  fi
done

pip3 install requests --quiet 2>/dev/null || true

echo "Starting Monitor API on port 3001..."
OPENCLAW_HOME="$OPENCLAW_HOME" PORT=3001 node /app/monitor-api/server.js &
MONITOR_PID=$!
echo "Monitor API PID: $MONITOR_PID"

sleep 2

echo "Starting OpenClaw Gateway on port 8080..."
exec openclaw gateway --port 8080 --bind lan
