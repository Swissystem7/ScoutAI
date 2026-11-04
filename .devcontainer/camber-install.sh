#!/usr/bin/env bash
# Optional: Camber CLI in devcontainer (call from post-create.sh if INSTALL_CAMBER=1)
set -e
[ "${INSTALL_CAMBER:-0}" = "1" ] || exit 0
curl -sL https://cli.cambercloud.com/install-v2.sh | bash
echo 'export PATH="$HOME/.camber/bin:$PATH"' >> ~/.bashrc
# Auth: Aviran adds Codespaces secret CAMBER_API_KEY (from app.cambercloud.com profile). Verify: camber me
