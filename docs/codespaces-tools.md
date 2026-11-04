# Codespaces tools

What the Codespaces pilot installs, which MCP servers Claude Code loads from `.mcp.json`, and the secrets to add in GitHub → Settings → Codespaces → Secrets. Secret values stay in Codespaces. This repo stores names only.

## CLIs

`bash .devcontainer/post-create.sh` installs these. Each extra CLI is non-fatal: a failure prints `warn:` and the script continues.

| CLI | How it is installed | Command |
| --- | --- | --- |
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude` |
| GitHub Copilot CLI | `npm install -g @github/copilot` | `copilot` |
| Gemini CLI | `npm install -g @google/gemini-cli` | `gemini` |
| Vercel CLI | `npm install -g vercel` | `vercel` |
| Wrangler | `npm install -g wrangler` | `wrangler` |
| Sentry CLI | `npm install -g @sentry/cli` | `sentry-cli` |
| Datadog CI | `npm install -g @datadog/datadog-ci` | `datadog-ci` |
| Firebase CLI | `npm install -g firebase-tools` | `firebase` |
| cloudflared | Cloudflare bookworm apt repo | `cloudflared` |
| MongoDB Atlas CLI | MongoDB 8.0 bookworm apt repo (`mongodb-atlas-cli`) | `atlas` |
| mongosh | same repo (`mongodb-mongosh`) | `mongosh` |
| AWS CLI v2 | `https://awscli.amazonaws.com/v2/install.sh` (`--system`) | `aws` |
| Aider | `pipx install aider-chat` | `aider` |

Default Aider model, written to `~/.aider.conf.yml`: `openai/qwen2.5-coder:7b`. Aider reads `OPENAI_API_BASE` and `OPENAI_API_KEY` from the environment.

Gemini fallback (no key in the file): `aider --config .aider.gemini.yml`. That profile sets `model` and `weak-model` to `gemini/gemini-3.5-flash-lite`. Aider reads `GEMINI_API_KEY` from the environment. Create the key at [Google AI Studio](https://aistudio.google.com/apikey) and store it as the Codespaces secret.

## Camber (optional)

`pip install camber` is not on PyPI. The official installer is `.devcontainer/camber-install.sh`, and post-create runs it only when `INSTALL_CAMBER=1`.

Set the Codespaces secret `INSTALL_CAMBER` to `1`, and set `CAMBER_API_KEY` from [app.cambercloud.com](https://app.cambercloud.com) → Profile. Check with `camber me`.

The free tier includes about 5 hours per month on an L4 GPU. In Python: `import camber.stash`. Jobs: `camber.mpi.create_job(command=..., node_size="SMALL", with_gpu=True)`.

## MCP servers

Claude Code reads `.mcp.json` at the repo root. HTTP servers use `type: http`. Values use `${ENV}` references. No tokens are written in the file. URLs below were checked against each vendor's docs.

| Server | Config | Auth |
| --- | --- | --- |
| github | `https://api.githubcopilot.com/mcp/` | `Authorization: Bearer ${GITHUB_TOKEN}` (Codespaces provides `GITHUB_TOKEN`) |
| vercel | `https://mcp.vercel.com` | OAuth on first use |
| cloudflare | `https://mcp.cloudflare.com/mcp` | OAuth on first use |
| sentry | `https://mcp.sentry.dev/mcp` | OAuth on first use |
| linear | `https://mcp.linear.app/mcp` | OAuth on first use |
| notion | `https://mcp.notion.com/mcp` | OAuth on first use |
| mongodb | `npx -y mongodb-mcp-server` | env `MDB_MCP_CONNECTION_STRING` from `${MDB_MCP_CONNECTION_STRING}` |
| context7 | `https://mcp.context7.com/mcp` | none in this file (public endpoint) |

In a Codespace, run `claude`, approve the project MCP servers, then `/mcp` to finish OAuth for the remote servers.

## Codespaces secrets to add

Add these on the repo (or the account, scoped to this repo). Do not paste the values into git.

| Name | What it is |
| --- | --- |
| `OPENAI_API_BASE` | Gateway URL ending in `/p1/v1`. The host changes, so it lives only in this secret. |
| `OPENAI_API_KEY` | Bearer token for that gateway. |
| `GEMINI_API_KEY` | Google AI Studio key for the Aider Gemini fallback. |
| `CAMBER_API_KEY` | Camber profile key. Used when Camber is installed. |
| `MDB_MCP_CONNECTION_STRING` | MongoDB connection string for the MongoDB MCP server. |
| `INSTALL_CAMBER` | Set to `1` to install the Camber CLI. Not a credential. |

`GITHUB_TOKEN` is created by Codespaces. Do not copy it into a file. `ANTHROPIC_API_KEY` remains optional for Claude Code (otherwise run `claude` and log in once).

## Deepnote and GitHub

Do this in the Deepnote and GitHub UIs.

1. On [deepnote.com](https://deepnote.com), open or create a project. In the left panel, open Integrations → GitHub → "Add GitHub repositories".
2. On GitHub, install the [Deepnote App](https://github.com/apps/deepnote) on the Swissystem7 account. Choose "Only select repositories" and pick the repositories you want, including ScoutAI.
3. Back in Deepnote, pick the repo, then the branch and folder, and choose Create. The repo shows up in Files. Pull, and Commit & push, are in the menu.
4. To export notebooks: Version history → Connect Git repository → GitHub → path and an existing branch.

The Deepnote token lasts 1 hour and is scoped to the repo. Revoke access under GitHub Settings → Installations.

## Cloudflare named tunnel

Recorded plan (checked 3 Nov 2026, 19:10): the Cloudflare account had 0 zones and 0 named tunnels. Domain: `aviranswissa.me`.

1. Claim `aviranswissa.me` on NC.me (Student Pack, free year).
2. In Cloudflare, Add site, Free plan.
3. In NC.me, set the nameservers to the two Cloudflare nameservers shown for the site.
4. After the zone is Active: create a named tunnel `lenovo-gw` via the API. DNS CNAME `gw.aviranswissa.me` to `<tunnel-id>.cfargotunnel.com`. Ingress goes to `http://localhost:<gateway port>`.
5. The server admin installs the connector token on the lenovo machine. Aviran enters that token (for example from 1Password). Optional: put Cloudflare Access in front of the hostname. Keep the gateway bearer token.
6. When the named hostname works, update the `OPENAI_API_BASE` Codespaces secret so it uses that hostname instead of a trycloudflare URL. The value still ends in `/p1/v1`. Do not commit the URL.
