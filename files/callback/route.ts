import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

interface CallbackParams {
  code: string;
  shop: string;
  state: string;
  hmac: string;
  timestamp: string;
}

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url);
  // extract all expected params
  const params = ["code", "shop", "state", "hmac", "timestamp"].reduce(
    (acc, key) => ({ ...acc, [key]: searchParams.get(key) }),
    {}
  ) as Record<string, string | null>;

  // 1. CSRF/state check
  const cookieStore = cookies();
  const stored = cookieStore.get("shopify_oauth_state")?.value;
  if (!params.state || params.state !== stored) {
    return NextResponse.json({ error: "Invalid state" }, { status: 403 });
  }

  // 2. HMAC verification
  const { hmac, ...hmacData } = params;
  const message = Object.keys(hmacData)
    .sort()
    .map((key) => `${key}=${hmacData[key]}`)
    .join("&");
  const generated = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(message)
    .digest("hex");
  if (generated !== hmac) {
    return NextResponse.json(
      { error: "HMAC validation failed" },
      { status: 400 }
    );
  }

  // 3. Exchange code for access token
  const tokenRes = await fetch(
    `https://${params.shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code: params.code,
      }),
    }
  );
  const { access_token } = await tokenRes.json();

  // 4. Fetch and sync store data
  // Example: fetch basic shop info
  const shopInfoRes = await fetch(
    `https://${params.shop}/admin/api/2025-04/shop.json`,
    {
      headers: { "X-Shopify-Access-Token": access_token },
    }
  );
  const shopData = await shopInfoRes.json();
  // TODO: You can also fetch products, orders, customers, etc.
  // Example: call your own service to persist
  if (params.shop) {
    await syncStoreData(params.shop, access_token, shopData);
  }

  // 5. Redirect into your dashboard
  const dashboardUrl = `${
    process.env.APP_HOST
  }/dashboard?shop=${encodeURIComponent(params.shop || "")}`;
  return NextResponse.redirect(dashboardUrl);
};

// placeholder – replace with your real DB/API integration
async function syncStoreData(shopDomain: string, token: string, shopData: any) {
  // e.g. your ORM or fetch to your backend
  console.log("Syncing store:", shopDomain, shopData);
  // await prisma.store.upsert({ … })
}
