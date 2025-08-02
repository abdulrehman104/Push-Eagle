import crypto from "crypto";

export interface ShopifyShopData {
  username: string;
  name: string;
  storeURL: string;
  shopifyDomain: string;
  platform: string;
  accessToken: string;
}

export function isValidShopDomain(shop: string): boolean {
  // Basic validation for Shopify shop domain
  const shopifyDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  return shopifyDomainRegex.test(shop);
}

export function generateRandomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function verifyHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  // Remove hmac from params for verification
  const paramsWithoutHmac = new URLSearchParams(params);
  paramsWithoutHmac.delete("hmac");

  // Sort parameters alphabetically
  const sortedParams = Array.from(paramsWithoutHmac.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  // Create HMAC
  const calculatedHmac = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHmac, "hex"),
    Buffer.from(hmac, "hex")
  );
}

export function buildOAuthUrl(
  shop: string,
  apiKey: string,
  scopes: string,
  redirectUri: string,
  state: string
): string {
  return (
    `https://${shop}/admin/oauth/authorize?` +
    `client_id=${apiKey}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=${state}`
  );
}

export async function exchangeCodeForToken(
  shop: string,
  code: string,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code: code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to exchange code for token: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  return data.access_token;
}

export async function fetchShopData(
  shop: string,
  accessToken: string
): Promise<ShopifyShopData> {
  // Use GraphQL to fetch shop and current user data
  const graphqlEndpoint = `https://${shop}/admin/api/2024-01/graphql.json`;

  const query = `
    query {
      shop {
        id
        name
        email
        myshopifyDomain
        url
      }
      currentStaffMember {
        id
        email
        firstName
        lastName
        name
      }
    }
  `;

  const response = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch shop data: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const shopInfo = data.data.shop;
  const userInfo = data.data.currentStaffMember;

  return {
    username: userInfo?.email || shopInfo.email,
    name: shopInfo.name,
    storeURL: shopInfo.url,
    shopifyDomain: shop,
    platform: "Shopify",
    accessToken: accessToken,
  };
}
