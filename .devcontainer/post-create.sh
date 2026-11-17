#!/usr/bin/env bash
# Installs the CLI agent tools from Notion INFRA-TOOLS (Codespaces pilot).
# No keys here: they come only from Codespaces secrets.
set -euo pipefail

if [ -f package.json ]; then npm ci || npm install; fi
npm install -g @anthropic-ai/claude-code @github/copilot @google/gemini-cli

# Extra CLIs. A failure warns and the script continues.
npm install -g vercel || echo "warn: vercel install failed"
npm install -g wrangler || echo "warn: wrangler install failed"
npm install -g @sentry/cli || echo "warn: @sentry/cli install failed"
npm install -g @datadog/datadog-ci || echo "warn: @datadog/datadog-ci install failed"
npm install -g firebase-tools || echo "warn: firebase-tools install failed"

install_cloudflared() {
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main' | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y cloudflared
}
install_cloudflared || echo "warn: cloudflared install failed"

install_mongodb_clis() {
  sudo rm -f /usr/share/keyrings/mongodb-server-8.0.gpg
  curl -fsSL https://pgp.mongodb.com/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
  echo 'deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main' | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mongodb-atlas-cli mongodb-mongosh
}
install_mongodb_clis || echo "warn: mongodb-atlas-cli or mongosh install failed"

install_aws_cli() {
  curl -fsSL https://awscli.amazonaws.com/v2/install.sh | sudo bash -s -- --system
}
install_aws_cli || echo "warn: aws cli v2 install failed"

python3 -m pip install --user --upgrade pipx
python3 -m pipx ensurepath
python3 -m pipx install aider-chat
# Aider -> OpenAI-compatible gateway.
# Endpoint and bearer token come only from the OPENAI_API_BASE and OPENAI_API_KEY Codespaces secrets.
cat > "$HOME/.aider.conf.yml" <<'CONF'
model: "openai/qwen2.5-coder:7b"
CONF

# Optional. camber-install.sh exits 0 unless INSTALL_CAMBER=1.
bash .devcontainer/camber-install.sh || echo "warn: camber install failed"

echo "Done. One-time logins: run 'claude', 'copilot', 'gemini'. Aider reads \$OPENAI_API_BASE and \$OPENAI_API_KEY. Gemini fallback: aider --config .aider.gemini.yml (reads \$GEMINI_API_KEY)."
