/**
 * auth.ts — LinkedIn OAuth 2.0 helper
 *
 * Handles the 3-legged OAuth flow required by LinkedIn:
 *  1. Generate an authorization URL for the user to visit.
 *  2. Exchange the returned code for access + refresh tokens.
 *  3. Persist tokens to disk and refresh them when expired.
 *
 * Tokens are stored in: ~/.linkedin-mcp-tokens.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LinkedInTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;       // Unix timestamp (ms) when access_token expires
  token_type: string;
  scope: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TOKENS_FILE = path.join(os.homedir(), ".linkedin-mcp-tokens.json");
const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

export const DEFAULT_SCOPES = [
  "openid",
  "profile",
  "email",
  "w_member_social",
].join(" ");

// ─── Token Storage ────────────────────────────────────────────────────────────

export function loadTokens(): LinkedInTokens | null {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return null;
    const raw = fs.readFileSync(TOKENS_FILE, "utf-8");
    return JSON.parse(raw) as LinkedInTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: LinkedInTokens): void {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600, // owner read/write only — keep tokens private
  });
}

export function clearTokens(): void {
  if (fs.existsSync(TOKENS_FILE)) {
    fs.unlinkSync(TOKENS_FILE);
  }
}

// ─── OAuth Helpers ────────────────────────────────────────────────────────────

/**
 * Build the LinkedIn authorization URL.
 * Direct users here to start the OAuth flow.
 */
export function getAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string = crypto.randomUUID(),
  scopes: string = DEFAULT_SCOPES
): { url: string; state: string } {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });
  return {
    url: `${AUTH_URL}?${params.toString()}`,
    state,
  };
}

/**
 * Exchange an authorization code (from the OAuth callback) for tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<LinkedInTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    token_type: string;
    scope: string;
  };

  const tokens: LinkedInTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };

  saveTokens(tokens);
  return tokens;
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string
): Promise<LinkedInTokens> {
  const stored = loadTokens();
  if (!stored?.refresh_token) {
    throw new Error(
      "No refresh token available. Please re-authenticate using linkedin_get_auth_url."
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    token_type: string;
    scope: string;
  };

  const tokens: LinkedInTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? stored.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };

  saveTokens(tokens);
  return tokens;
}

/**
 * Get a valid access token, refreshing it if necessary.
 * Throws if not authenticated at all.
 */
export async function getValidAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error(
      "Not authenticated. Use the linkedin_get_auth_url tool to start the OAuth flow."
    );
  }

  // Refresh 5 minutes before expiry
  const isExpiringSoon = tokens.expires_at - Date.now() < 5 * 60 * 1000;
  if (isExpiringSoon) {
    const refreshed = await refreshAccessToken(clientId, clientSecret);
    return refreshed.access_token;
  }

  return tokens.access_token;
}
