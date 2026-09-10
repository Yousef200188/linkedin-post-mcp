/**
 * tools.ts — MCP tool schemas and handler logic
 *
 * All tool input validation uses Zod. Each tool maps to
 * functions in auth.ts and linkedin.ts.
 */

import { z } from "zod";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getValidAccessToken,
  clearTokens,
  loadTokens,
  DEFAULT_SCOPES,
} from "./auth.js";
import {
  getUserProfile,
  buildPersonUrn,
  buildOrganizationUrn,
  createTextPost,
  createUrlPost,
  deletePost,
} from "./linkedin.js";

// ─── Environment Config ───────────────────────────────────────────────────────

function getConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:8080/callback";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing required environment variables: LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET. " +
        "Set them in your MCP host configuration."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: "linkedin_get_auth_url",
    description:
      "Generate the LinkedIn OAuth 2.0 authorization URL. " +
      "Direct the user to open this URL in their browser to grant permission. " +
      "After granting, LinkedIn will redirect to the callback URL with a 'code' parameter. " +
      "Pass that code to the linkedin_exchange_token tool.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "linkedin_exchange_token",
    description:
      "Exchange the OAuth authorization code (from the LinkedIn callback URL) for an access token. " +
      "Run this after the user has visited the auth URL and been redirected. " +
      "The code is the 'code' query parameter in the callback URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "The authorization code from the LinkedIn OAuth callback URL",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "linkedin_get_profile",
    description:
      "Fetch the authenticated user's LinkedIn profile information, " +
      "including their name, person URN, and email. " +
      "The person URN is required for creating posts as the user.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "linkedin_create_text_post",
    description:
      "Create a plain text post on LinkedIn as the authenticated user. " +
      "The post will appear on the user's LinkedIn feed. " +
      "To post as a company page instead, provide the organization_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The text content of the LinkedIn post (max 3000 characters)",
        },
        visibility: {
          type: "string",
          enum: ["PUBLIC", "CONNECTIONS", "LOGGED_IN"],
          description:
            "Who can see the post. PUBLIC = anyone, CONNECTIONS = your connections only, " +
            "LOGGED_IN = all LinkedIn members. Defaults to PUBLIC.",
        },
        organization_id: {
          type: "string",
          description:
            "Optional. The numeric LinkedIn organization/company page ID. " +
            "If provided, the post will be made as the company page instead of the personal profile.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "linkedin_create_post_with_url",
    description:
      "Create a LinkedIn post that includes a URL/article share with optional commentary text. " +
      "LinkedIn will automatically fetch a preview for the URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "Commentary text for the post (max 3000 characters)",
        },
        url: {
          type: "string",
          description: "The URL to share (article, blog post, website, etc.)",
        },
        title: {
          type: "string",
          description: "Optional title override for the URL preview card",
        },
        description: {
          type: "string",
          description: "Optional description override for the URL preview card",
        },
        visibility: {
          type: "string",
          enum: ["PUBLIC", "CONNECTIONS", "LOGGED_IN"],
          description: "Who can see the post. Defaults to PUBLIC.",
        },
        organization_id: {
          type: "string",
          description:
            "Optional. Numeric LinkedIn organization/company page ID to post as.",
        },
      },
      required: ["text", "url"],
    },
  },
  {
    name: "linkedin_delete_post",
    description:
      "Delete a LinkedIn post by its post URN. " +
      "The URN is returned by the create post tools as 'postId'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        post_urn: {
          type: "string",
          description: "The post URN returned by linkedin_create_text_post or linkedin_create_post_with_url",
        },
      },
      required: ["post_urn"],
    },
  },
  {
    name: "linkedin_get_auth_status",
    description:
      "Check whether the server is currently authenticated with LinkedIn, " +
      "and when the current access token expires.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "linkedin_logout",
    description:
      "Remove stored LinkedIn tokens, effectively logging out. " +
      "You will need to re-authenticate using linkedin_get_auth_url.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
] as const;

// ─── Tool Schemas (Zod) ───────────────────────────────────────────────────────

const ExchangeTokenSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
});

const CreateTextPostSchema = z.object({
  text: z.string().min(1).max(3000),
  visibility: z.enum(["PUBLIC", "CONNECTIONS", "LOGGED_IN"]).default("PUBLIC"),
  organization_id: z.string().optional(),
});

const CreateUrlPostSchema = z.object({
  text: z.string().min(1).max(3000),
  url: z.string().url("Must be a valid URL"),
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: z.enum(["PUBLIC", "CONNECTIONS", "LOGGED_IN"]).default("PUBLIC"),
  organization_id: z.string().optional(),
});

const DeletePostSchema = z.object({
  post_urn: z.string().min(1),
});

// ─── Tool Handlers ────────────────────────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const config = getConfig();

  switch (toolName) {
    // ── Auth ─────────────────────────────────────────────────────────────────

    case "linkedin_get_auth_url": {
      const { url, state } = getAuthUrl(
        config.clientId,
        config.redirectUri,
        crypto.randomUUID(),
        DEFAULT_SCOPES
      );
      return (
        `**LinkedIn Authorization URL**\n\n` +
        `Please open this URL in your browser to authorize the LinkedIn MCP server:\n\n` +
        `${url}\n\n` +
        `After authorizing, LinkedIn will redirect you to:\n` +
        `\`${config.redirectUri}?code=<CODE>&state=${state}\`\n\n` +
        `Copy the \`code\` value from the redirect URL and pass it to \`linkedin_exchange_token\`.`
      );
    }

    case "linkedin_exchange_token": {
      const { code } = ExchangeTokenSchema.parse(args);
      const tokens = await exchangeCodeForTokens(
        code,
        config.clientId,
        config.clientSecret,
        config.redirectUri
      );
      const expiresAt = new Date(tokens.expires_at).toLocaleString();
      return (
        `✅ **Authentication successful!**\n\n` +
        `- **Scopes granted:** ${tokens.scope}\n` +
        `- **Token expires:** ${expiresAt}\n` +
        `- **Token stored at:** ~/.linkedin-mcp-tokens.json\n\n` +
        `You can now use \`linkedin_create_text_post\` and other tools.`
      );
    }

    case "linkedin_get_auth_status": {
      const tokens = loadTokens();
      if (!tokens) {
        return (
          `❌ **Not authenticated.**\n\n` +
          `Use \`linkedin_get_auth_url\` to start the OAuth flow.`
        );
      }
      const expiresAt = new Date(tokens.expires_at).toLocaleString();
      const isExpired = tokens.expires_at < Date.now();
      const hasRefresh = Boolean(tokens.refresh_token);
      return (
        `${isExpired ? "⚠️ **Token expired**" : "✅ **Authenticated**"}\n\n` +
        `- **Scopes:** ${tokens.scope}\n` +
        `- **Expires at:** ${expiresAt}\n` +
        `- **Can auto-refresh:** ${hasRefresh ? "Yes" : "No"}`
      );
    }

    case "linkedin_logout": {
      clearTokens();
      return `✅ Logged out. Stored tokens have been removed.`;
    }

    // ── Profile ───────────────────────────────────────────────────────────────

    case "linkedin_get_profile": {
      const accessToken = await getValidAccessToken(
        config.clientId,
        config.clientSecret
      );
      const profile = await getUserProfile(accessToken);
      const personUrn = buildPersonUrn(profile.sub);
      return (
        `**LinkedIn Profile**\n\n` +
        `- **Name:** ${profile.name}\n` +
        `- **Email:** ${profile.email ?? "N/A"}\n` +
        `- **Person URN:** \`${personUrn}\`\n` +
        `- **Sub (ID):** \`${profile.sub}\`\n\n` +
        `Use the Person URN as the \`author_urn\` when creating posts as yourself.`
      );
    }

    // ── Posts ─────────────────────────────────────────────────────────────────

    case "linkedin_create_text_post": {
      const { text, visibility, organization_id } = CreateTextPostSchema.parse(args);
      const accessToken = await getValidAccessToken(
        config.clientId,
        config.clientSecret
      );

      let authorUrn: string;
      if (organization_id) {
        authorUrn = buildOrganizationUrn(organization_id);
      } else {
        const profile = await getUserProfile(accessToken);
        authorUrn = buildPersonUrn(profile.sub);
      }

      const result = await createTextPost({
        accessToken,
        authorUrn,
        text,
        visibility,
      });

      return (
        `✅ **Post created successfully!**\n\n` +
        `- **Post ID:** \`${result.postId}\`\n` +
        `- **Post URL:** ${result.postUrl}\n` +
        `- **Author:** ${authorUrn}\n` +
        `- **Visibility:** ${visibility}`
      );
    }

    case "linkedin_create_post_with_url": {
      const { text, url, title, description, visibility, organization_id } =
        CreateUrlPostSchema.parse(args);
      const accessToken = await getValidAccessToken(
        config.clientId,
        config.clientSecret
      );

      let authorUrn: string;
      if (organization_id) {
        authorUrn = buildOrganizationUrn(organization_id);
      } else {
        const profile = await getUserProfile(accessToken);
        authorUrn = buildPersonUrn(profile.sub);
      }

      const result = await createUrlPost({
        accessToken,
        authorUrn,
        text,
        url,
        title,
        description,
        visibility,
      });

      return (
        `✅ **Post with URL created successfully!**\n\n` +
        `- **Post ID:** \`${result.postId}\`\n` +
        `- **Post URL:** ${result.postUrl}\n` +
        `- **Shared URL:** ${url}\n` +
        `- **Author:** ${authorUrn}\n` +
        `- **Visibility:** ${visibility}`
      );
    }

    case "linkedin_delete_post": {
      const { post_urn } = DeletePostSchema.parse(args);
      const accessToken = await getValidAccessToken(
        config.clientId,
        config.clientSecret
      );
      await deletePost(accessToken, post_urn);
      return `✅ Post \`${post_urn}\` has been deleted.`;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
