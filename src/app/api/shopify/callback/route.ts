import crypto from "crypto";
import db from "@/lib/prismaClient";
import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_API_VERSION = "2025-07";
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const APP_UI_URL = "https://6a367e233aa9.ngrok-free.app/login";

function isValidShopDomain(shop: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const { hmac, code, shop, state } = params;

    const cookieState = request.cookies.get("shopify_oauth_state")?.value;
    if (!state || !cookieState || state !== cookieState) {
      return NextResponse.json({ error: "Invalid state parameter" }, { status: 400 });
    }

    const { hmac: _hmac, ...rest } = params;
    const sortedParams = Object.keys(rest).sort().map((key) => `${key}=${rest[key]}`).join("&");
    const generatedHmac = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(sortedParams).digest("hex");

    if (generatedHmac !== hmac) {
      return NextResponse.json({ error: "HMAC validation failed" }, { status: 401 });
    }

    if (!shop || !isValidShopDomain(shop)) {
      return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
    }

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
      const errorText = await tokenRes.text();
      console.error("Token request failed:", tokenRes.status, errorText);
      return NextResponse.json({ error: "Failed to get access token" }, { status: 401 });
    }
    
    const tokenData = await tokenRes.json();
    const { access_token, scope: grantedScopes, associated_user } = tokenData;
    

    // Fetch store details via Admin GraphQL API
    const graphqlQuery = {
      query: `
        query {
          shop {
            name
            myshopifyDomain
            primaryDomain { 
              url 
              host 
            }
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
          "X-Shopify-Access-Token": access_token,
        },
        body: JSON.stringify(graphqlQuery),
      }
    );

    if (!storeRes.ok) {
      const errorText = await storeRes.text();
      console.error("GraphQL request failed:", storeRes.status, storeRes.statusText, errorText);
      throw new Error(`GraphQL fetch failed: ${errorText}`);
    }

    const storeJson = await storeRes.json();
    
    if (storeJson.errors) {
      console.error("GraphQL errors:", storeJson.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(storeJson.errors)}`);
    }
    
    const shopData = storeJson.data?.shop;

    console.log("Shop data:", shopData);
    
    if (!shopData) {
      console.error("No shop data in response:", storeJson);
      throw new Error("No shop data received from GraphQL API");
    }

    // Extract required fields
    const storeName = shopData.name;
    const storeUrl = shopData.primaryDomain?.url || '';
    const storeSubdomain = shopData.myshopifyDomain;
    
    const fullEmail = associated_user?.email || '';
    const storeUsername = fullEmail.split('@')[0] || '';
    
    // Add Data to the database
    await db.merchant.create({
      data: {
        accessToken: access_token,
        Username: storeUsername,
        StoreName: storeName,
        storeUrl: storeUrl,
        subdomain: storeSubdomain,
      }
    });

    // 9. Redirect to your app UI
    return NextResponse.redirect(APP_UI_URL, 302);
  } catch (error: any) {
    console.error("Error during Shopify OAuth callback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}