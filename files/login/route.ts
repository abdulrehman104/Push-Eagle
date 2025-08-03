import crypto from "crypto";
import { NextResponse } from "next/server";

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url);

  const shop = searchParams.get("shop");
  if (!shop) {
    return NextResponse.json(
      { error: "Missing shop parameter" },
      { status: 400 }
    );
  }

  // generate a nonce to protect against CSRF
  const state = crypto.randomBytes(16).toString("hex");
  // store `state` in a cookie (or your session store) so you can verify it in the callback
  const res = NextResponse.redirect(
    `https://${shop}/admin/oauth/authorize` +
      `?client_id=${process.env.SHOPIFY_API_KEY}` +
      `&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES!)}` +
      `&redirect_uri=${encodeURIComponent(
        process.env.APP_HOST + "/api/shopify/callback"
      )}` +
      `&state=${state}`
  );
  // set cookie for later verification
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
  });
  return res;
};
