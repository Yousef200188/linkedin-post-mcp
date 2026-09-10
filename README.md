# linkedin-post-mcp

A **Model Context Protocol (MCP) server** that lets AI agents (Claude, Cursor, etc.) create and manage LinkedIn posts on your behalf via the LinkedIn REST API.

## Features

- 🔐 **OAuth 2.0 Authentication** — Secure 3-legged OAuth flow with automatic token refresh
- 📝 **Text Posts** — Create plain text posts on your personal profile or company page
- 🔗 **URL/Article Shares** — Share links with custom commentary
- 🗑️ **Delete Posts** — Remove posts programmatically
- 👤 **Profile Lookup** — Fetch your LinkedIn profile and URN
- 🏢 **Company Page Support** — Post as a company/organization page

## Prerequisites

1. **LinkedIn Developer App** — [Create one here](https://www.linkedin.com/developers/apps)
   - Enable the **"Share on LinkedIn"** product
   - Enable **"Sign In with LinkedIn using OpenID Connect"**
   - Add `http://localhost:8080/callback` as an authorized redirect URL
   - Copy your `CLIENT_ID` and `CLIENT_SECRET`

2. **npm account** — [Sign up at npmjs.com](https://www.npmjs.com/signup) (only needed to publish)

## Installation

```bash
npx linkedin-post-mcp@latest
```

Or install globally:
```bash
npm install -g linkedin-post-mcp
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "linkedin-post-mcp@latest"],
      "env": {
        "LINKEDIN_CLIENT_ID": "your_client_id_here",
        "LINKEDIN_CLIENT_SECRET": "your_client_secret_here",
        "LINKEDIN_REDIRECT_URI": "http://localhost:8080/callback"
      }
    }
  }
}
```

### Cursor / Other MCP Hosts

```json
{
  "linkedin-post-mcp": {
    "command": "npx",
    "args": ["-y", "linkedin-post-mcp@latest"],
    "env": {
      "LINKEDIN_CLIENT_ID": "your_client_id_here",
      "LINKEDIN_CLIENT_SECRET": "your_client_secret_here"
    }
  }
}
```

## Authentication Flow

On first use:

1. Ask the AI: **"Get the LinkedIn auth URL"**
2. Open the URL in your browser and authorize the app
3. LinkedIn redirects you to `http://localhost:8080/callback?code=XXX`
4. Copy the `code` value and tell the AI: **"Exchange this code: XXX"**
5. Done! Tokens are stored in `~/.linkedin-mcp-tokens.json`

## Available Tools

| Tool | Description |
|------|-------------|
| `linkedin_get_auth_url` | Generate the OAuth authorization URL |
| `linkedin_exchange_token` | Exchange auth code for access token |
| `linkedin_get_auth_status` | Check if you're authenticated and token expiry |
| `linkedin_logout` | Remove stored tokens |
| `linkedin_get_profile` | Fetch your name, email, and person URN |
| `linkedin_create_text_post` | Create a plain text LinkedIn post |
| `linkedin_create_post_with_url` | Create a post with a shared URL/article |
| `linkedin_delete_post` | Delete a post by its URN |

## Example Prompts

```
"Post on LinkedIn: Excited to announce our new product launch! #tech #startup"

"Share this article on LinkedIn with the comment 'Great read!': https://example.com/article"

"Create a LinkedIn post on behalf of our company page (org ID: 12345678): ..."

"Check my LinkedIn auth status"

"Delete my last LinkedIn post with URN urn:li:share:..."
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LINKEDIN_CLIENT_ID` | ✅ Yes | — | Your LinkedIn app's Client ID |
| `LINKEDIN_CLIENT_SECRET` | ✅ Yes | — | Your LinkedIn app's Client Secret |
| `LINKEDIN_REDIRECT_URI` | No | `http://localhost:8080/callback` | OAuth callback URL |

## Rate Limits

LinkedIn's API allows approximately **100 API calls per day per member** on standard access. The server does not implement rate limit tracking, so be mindful of how frequently you call the tools.

## License

MIT
