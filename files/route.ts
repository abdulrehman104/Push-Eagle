import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import {
  isValidShopDomain,
  generateRandomString,
  verifyHmac,
  buildOAuthUrl,
  exchangeCodeForToken,
  fetchShopData,
  type ShopifyShopData,
} from "@/lib/shopify";

const prisma = new PrismaClient();

// Shopify app configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES ||
  "read_products,write_products,read_orders,write_orders,read_customers,write_customers";
const SHOPIFY_REDIRECT_URI =
  process.env.SHOPIFY_REDIRECT_URI || "http://localhost:3000/api/shopify/login";
const DASHBOARD_URL =
  process.env.DASHBOARD_URL || "http://localhost:3000/dashboard";

export async function GET(request: NextRequest) {
  try {
    console.log("🔍 Shopify login request URL:", request.url);
    
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get("shop");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    console.log("📋 Request parameters:", { shop, code, state });

    // If no shop parameter, this is the initial installation request
    if (!shop) {
      console.log("❌ No shop parameter provided");
      return NextResponse.json(
        { error: "Shop parameter is required" },
        { status: 400 }
      );
    }

    // Clean up shop parameter - remove protocol and trailing slash if present
    let cleanShop = shop;
    if (cleanShop.startsWith('https://')) {
      cleanShop = cleanShop.replace('https://', '');
    }
    if (cleanShop.startsWith('http://')) {
      cleanShop = cleanShop.replace('http://', '');
    }
    if (cleanShop.endsWith('/')) {
      cleanShop = cleanShop.slice(0, -1);
    }

    console.log("🧹 Cleaned shop parameter:", cleanShop);

    // Validate shop domain
    if (!isValidShopDomain(cleanShop)) {
      console.log("❌ Invalid shop domain:", cleanShop);
      return NextResponse.json(
        { error: "Invalid shop domain" },
        { status: 400 }
      );
    }

    console.log("✅ Valid shop domain:", cleanShop);

    // If no code parameter, this is the initial OAuth request
    if (!code) {
      console.log("🔄 Starting OAuth flow for shop:", cleanShop);
      return handleInitialOAuth(cleanShop);
    }

    // If we have a code, this is the OAuth callback
    console.log("🔄 Processing OAuth callback for shop:", cleanShop);
    return await handleOAuthCallback(cleanShop, code, state, searchParams);
  } catch (error) {
    console.error("❌ Shopify login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleInitialOAuth(shop: string) {
  // Generate state parameter for security
  const state = generateRandomString(32);

  // Build OAuth URL
  const oauthUrl = buildOAuthUrl(
    shop,
    SHOPIFY_API_KEY,
    SHOPIFY_SCOPES,
    SHOPIFY_REDIRECT_URI,
    state
  );

  return NextResponse.redirect(oauthUrl);
}

async function handleOAuthCallback(
  shop: string,
  code: string,
  state: string | null,
  searchParams: URLSearchParams
) {
  try {
    // Verify HMAC for security
    if (!verifyHmac(searchParams, SHOPIFY_API_SECRET)) {
      return NextResponse.json(
        { error: "Invalid HMAC signature" },
        { status: 400 }
      );
    }

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(
      shop,
      code,
      SHOPIFY_API_KEY,
      SHOPIFY_API_SECRET
    );

    // Fetch shop data using GraphQL
    const shopData = await fetchShopData(shop, accessToken);

    // Save shop data to database
    await saveShopData(shopData);

    // Redirect to dashboard
    const dashboardUrl = `${DASHBOARD_URL}?shop=${encodeURIComponent(shop)}`;
    return NextResponse.redirect(dashboardUrl);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json(
      { error: "Failed to complete OAuth flow" },
      { status: 500 }
    );
  }
}

async function saveShopData(shopData: ShopifyShopData) {
  try {
    // Check if store already exists
    const existingStore = await prisma.store.findUnique({
      where: { shopifyDomain: shopData.shopifyDomain },
    });

    if (existingStore) {
      // Update existing store
      await prisma.store.update({
        where: { shopifyDomain: shopData.shopifyDomain },
        data: {
          username: shopData.username,
          name: shopData.name,
          storeURL: shopData.storeURL,
          platform: shopData.platform,
          accessToken: shopData.accessToken,
        },
      });
      console.log(`Updated existing store: ${shopData.shopifyDomain}`);
    } else {
      // Create new store
      await prisma.store.create({
        data: {
          username: shopData.username,
          name: shopData.name,
          storeURL: shopData.storeURL,
          shopifyDomain: shopData.shopifyDomain,
          platform: shopData.platform,
          accessToken: shopData.accessToken,
        },
      });
      console.log(`Created new store: ${shopData.shopifyDomain}`);
    }
  } catch (error) {
    console.error("Database error:", error);
    throw new Error("Failed to save shop data to database");
  }
}
