// app/api/shopify/callback/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const SHOPIFY_API_VERSION = "2025-07";
const APP_UI_URL = "https://25dceea76d90.ngrok-free.app/dashboard";

function isValidShopDomain(shop: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop);
}

export async function GET(request: NextRequest) {
  try {
    // 1. Parse and validate OAuth callback params
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const { hmac, code, shop, state } = params;

    // 2. Verify state parameter against cookie
    const cookieState = request.cookies.get("shopify_oauth_state")?.value;
    if (!state || !cookieState || state !== cookieState) {
      return NextResponse.json({ error: "Invalid state parameter" }, { status: 400 });
    }

    // 3. Validate HMAC
    const { hmac: _hmac, ...rest } = params;
    const sortedParams = Object.keys(rest)
      .sort()
      .map((key) => `${key}=${rest[key]}`)
      .join("&");
    const generatedHmac = crypto
      .createHmac("sha256", SHOPIFY_API_SECRET)
      .update(sortedParams)
      .digest("hex");

    if (generatedHmac !== hmac) {
      return NextResponse.json({ error: "HMAC validation failed" }, { status: 401 });
    }

    // 4. Validate shop domain
    if (!shop || !isValidShopDomain(shop)) {
      return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
    }

    // 5. Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.json({ error: "Failed to get access token" }, { status: 401 });
    }

    const tokenData = await tokenRes.json();
    const { access_token, scope: grantedScopes, associated_user } = tokenData;
    console.log("Access Token:", access_token);

    // 6. Fetch store details via Admin GraphQL API
    const graphqlQuery = {
      query: `
        query {
          shop {
            name
            myshopifyDomain
            primaryDomain { url host }
          }
        }
      `,
    };
    const storeRes = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify(graphqlQuery),
      }
    );

    if (!storeRes.ok) {
      const errorText = await storeRes.text();
      throw new Error(`GraphQL fetch failed: ${errorText}`);
    }

    const storeJson = await storeRes.json();
    const shopData = storeJson.data.shop;

    // 7. Extract required fields
    const storeUsername = associated_user?.email || '';
    const storeName = shopData.name;
    const storeUrl = shopData.primaryDomain.url;
    const storeSubdomain = shopData.myshopifyDomain;

    // 8. TODO: Persist shop info + access_token in DB
    // await saveShopToDatabase({ shop, access_token, storeUsername, storeName, storeUrl, storeSubdomain, grantedScopes, associated_user });

    // 9. Redirect merchant to your dashboard
    return NextResponse.redirect(APP_UI_URL, 302);
  } catch (error: any) {
    console.error("Error during Shopify OAuth callback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
