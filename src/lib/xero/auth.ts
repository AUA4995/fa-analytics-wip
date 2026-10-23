import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { XERO_CONNECTIONS_URL, XERO_SCOPES, XERO_TOKEN_URL, assertReadOnlyScopes, xeroEnv } from "./config";

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  idToken?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  id_token?: string;
  token_type: string;
}

export interface XeroTenant {
  id: string; // connection id
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

function basicAuth(): string {
  const { clientId, clientSecret } = xeroEnv();
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xero token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    idToken: json.id_token,
  };
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  assertReadOnlyScopes(XERO_SCOPES);
  const { redirectUri } = xeroEnv();
  return tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  );
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

export async function listTenants(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Xero /connections failed (${res.status})`);
  return (await res.json()) as XeroTenant[];
}

/** Persist the (single) connection. Tokens are encrypted at rest. */
export async function saveConnection(tenant: XeroTenant, tokens: TokenSet) {
  // One organisation at a time: replace any existing connection.
  await prisma.xeroConnection.deleteMany({ where: { tenantId: { not: tenant.tenantId } } });
  return prisma.xeroConnection.upsert({
    where: { tenantId: tenant.tenantId },
    create: {
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scope,
    },
    update: {
      tenantName: tenant.tenantName,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scope,
    },
  });
}

export async function getConnection() {
  return prisma.xeroConnection.findFirst({ orderBy: { createdAt: "desc" } });
}

/**
 * Returns a valid access token + tenant id, refreshing (and persisting the rotated
 * refresh token) when the current one expires within 2 minutes.
 */
export async function getAccessToken(): Promise<{ accessToken: string; tenantId: string; tenantName: string }> {
  const conn = await getConnection();
  if (!conn) throw new Error("Xero is not connected — go to Settings → Company → Connect Xero.");

  const expiresSoon = conn.expiresAt.getTime() - Date.now() < 2 * 60 * 1000;
  if (!expiresSoon) {
    return { accessToken: decrypt(conn.accessToken), tenantId: conn.tenantId, tenantName: conn.tenantName };
  }

  const fresh = await refreshTokens(decrypt(conn.refreshToken));
  await prisma.xeroConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: encrypt(fresh.accessToken),
      refreshToken: encrypt(fresh.refreshToken),
      expiresAt: fresh.expiresAt,
      scopes: fresh.scope,
    },
  });
  return { accessToken: fresh.accessToken, tenantId: conn.tenantId, tenantName: conn.tenantName };
}

export async function disconnect(): Promise<void> {
  await prisma.xeroConnection.deleteMany({});
}
