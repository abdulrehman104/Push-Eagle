import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SCOPES = process.env.SHOPIFY_SCOPES!;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const REDIRECT_URI = "https://1caaea172bc5.ngrok-free.app/api/shopify/callback";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const { hmac, ...rest } = params;

    const sortedParams = Object.keys(rest).sort().map((key) => `${key}=${rest[key]}`).join("&");
    const generatedHmac = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(sortedParams).digest("hex");

    if (generatedHmac !== hmac) {
      return NextResponse.json({ error: "HMAC validation failed" }, { status: 401 });
    }

    const shop = params.shop;
    const state = crypto.randomBytes(16).toString("hex");

    const response = NextResponse.redirect(
      `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${encodeURIComponent(
        SCOPES
      )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&grant_options[]=per-user`,
      302
    );
    response.cookies.set("shopify_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// https://25dceea76d90.ngrok-free.app/api/shopify/callback
// ?code=b90b1f6b3f17edb42b1092f0be518b86
// &hmac=c83f22032dd6c027c802ee6d0f10c32a81fa2f231f2952c1b2ab9caff7aa1c73
// &host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvcHVzaC1lYWdsZS10ZXN0MQ
// &shop=push-eagle-test1.myshopifycom
// &state=3b7c0d82dd917ad474addb4dbd35867b
// &timestamp=1754206894