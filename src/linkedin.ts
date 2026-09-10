/**
 * linkedin.ts — LinkedIn REST API client
 *
 * Wraps the LinkedIn Posts API (/rest/posts) and User Info endpoint.
 * Uses the current stable API version (202609).
 *
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LinkedInProfile {
  sub: string;       // The LinkedIn person URN ID (e.g. "abc123xyz")
  name: string;
  given_name: string;
  family_name: string;
  email?: string;
  picture?: string;
}

export interface PostResult {
  postId: string;
  postUrl: string;
}

export type PostVisibility = "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";

export interface CreateTextPostOptions {
  accessToken: string;
  authorUrn: string;             // e.g. "urn:li:person:abc123" or "urn:li:organization:12345"
  text: string;
  visibility?: PostVisibility;
}

export interface CreateUrlPostOptions extends CreateTextPostOptions {
  url: string;
  title?: string;
  description?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202609";
const RESTLI_VERSION = "2.0.0";

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

async function linkedInFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": RESTLI_VERSION,
      ...options.headers,
    },
  });

  return response;
}

// ─── Profile ─────────────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's LinkedIn profile via OpenID Connect userinfo.
 */
export async function getUserProfile(accessToken: string): Promise<LinkedInProfile> {
  const response = await linkedInFetch("/v2/userinfo", accessToken);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch profile (${response.status}): ${err}`);
  }
  return response.json() as Promise<LinkedInProfile>;
}

/**
 * Build the full URN for a person from their sub (OIDC subject).
 */
export function buildPersonUrn(sub: string): string {
  return `urn:li:person:${sub}`;
}

/**
 * Build the full URN for an organization page.
 */
export function buildOrganizationUrn(orgId: string): string {
  return `urn:li:organization:${orgId}`;
}

// ─── Post Creation ────────────────────────────────────────────────────────────

/**
 * Create a plain-text post on LinkedIn.
 */
export async function createTextPost(opts: CreateTextPostOptions): Promise<PostResult> {
  const { accessToken, authorUrn, text, visibility = "PUBLIC" } = opts;

  const payload = {
    author: authorUrn,
    commentary: text,
    visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  const response = await linkedInFetch("/rest/posts", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create post (${response.status}): ${err}`);
  }

  // LinkedIn returns the post ID in the `x-restli-id` header
  const postId = response.headers.get("x-restli-id") ?? "unknown";
  const encodedPostId = encodeURIComponent(postId);

  return {
    postId,
    postUrl: `https://www.linkedin.com/feed/update/${encodedPostId}/`,
  };
}

/**
 * Create a post that includes an article/URL share.
 */
export async function createUrlPost(opts: CreateUrlPostOptions): Promise<PostResult> {
  const {
    accessToken,
    authorUrn,
    text,
    url,
    title,
    description,
    visibility = "PUBLIC",
  } = opts;

  const payload = {
    author: authorUrn,
    commentary: text,
    visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      article: {
        source: url,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
      },
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  const response = await linkedInFetch("/rest/posts", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create URL post (${response.status}): ${err}`);
  }

  const postId = response.headers.get("x-restli-id") ?? "unknown";
  const encodedPostId = encodeURIComponent(postId);

  return {
    postId,
    postUrl: `https://www.linkedin.com/feed/update/${encodedPostId}/`,
  };
}

/**
 * Delete a post by its URN.
 */
export async function deletePost(
  accessToken: string,
  postUrn: string
): Promise<void> {
  const encodedUrn = encodeURIComponent(postUrn);
  const response = await linkedInFetch(`/rest/posts/${encodedUrn}`, accessToken, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.text();
    throw new Error(`Failed to delete post (${response.status}): ${err}`);
  }
}
