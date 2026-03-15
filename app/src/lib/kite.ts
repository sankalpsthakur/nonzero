import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderParams {
  exchange: "NSE" | "BSE" | "NFO" | "CDS" | "BFO" | "MCX" | "BCD";
  tradingsymbol: string;
  transaction_type: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity: number;
  product: "CNC" | "MIS" | "NRML";
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  validity?: "DAY" | "IOC" | "TTL";
  tag?: string;
}

export interface KiteSessionResponse {
  accessToken: string;
  publicToken: string;
  userId: string;
  loginTime: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KITE_BASE_URL = "https://kite.zerodha.com";
const KITE_API_URL = "https://api.kite.trade";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the SHA-256 checksum required by Kite Connect for authentication.
 * checksum = SHA256(api_key + request_token + api_secret)
 */
function buildChecksum(
  apiKey: string,
  requestToken: string,
  apiSecret: string,
): string {
  return createHash("sha256")
    .update(apiKey + requestToken + apiSecret)
    .digest("hex");
}

/**
 * Standard headers for authenticated Kite API requests.
 */
function authHeaders(accessToken: string, apiKey: string) {
  return {
    "X-Kite-Version": "3",
    Authorization: `token ${apiKey}:${accessToken}`,
    "Content-Type": "application/x-www-form-urlencoded",
  } as const;
}

/**
 * Wrapper around fetch that throws on non-2xx responses with context.
 */
async function kiteFetch<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  const res = await fetch(url, init);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Kite API error [${label}]: ${res.status} ${res.statusText} – ${body}`,
    );
  }

  const json = await res.json();
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the Kite Connect login URL that the user should be redirected to.
 */
export function getLoginUrl(apiKey: string): string {
  return `${KITE_BASE_URL}/connect/login?api_key=${encodeURIComponent(apiKey)}&v=3`;
}

/**
 * Exchange a `request_token` (received after the user logs in) for an
 * `access_token` via a POST to the Kite session endpoint.
 *
 * See: https://kite.trade/docs/connect/v3/user/#login-flow
 */
export async function exchangeToken(
  apiKey: string,
  apiSecret: string,
  requestToken: string,
): Promise<KiteSessionResponse> {
  const checksum = buildChecksum(apiKey, requestToken, apiSecret);

  const body = new URLSearchParams({
    api_key: apiKey,
    request_token: requestToken,
    checksum,
  });

  const data = await kiteFetch<{
    access_token: string;
    public_token: string;
    user_id: string;
    login_time: string;
  }>(`${KITE_API_URL}/session/token`, {
    method: "POST",
    headers: {
      "X-Kite-Version": "3",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  }, "exchangeToken");

  return {
    accessToken: data.access_token,
    publicToken: data.public_token,
    userId: data.user_id,
    loginTime: data.login_time,
  };
}

/**
 * Fetch the list of positions (day + net) for the current trading session.
 */
export async function getPositions(
  accessToken: string,
  apiKey: string,
): Promise<{ net: unknown[]; day: unknown[] }> {
  return kiteFetch(
    `${KITE_API_URL}/portfolio/positions`,
    {
      method: "GET",
      headers: authHeaders(accessToken, apiKey),
    },
    "getPositions",
  );
}

/**
 * Fetch the list of orders placed during the current trading session.
 */
export async function getOrders(
  accessToken: string,
  apiKey: string,
): Promise<unknown[]> {
  return kiteFetch(
    `${KITE_API_URL}/orders`,
    {
      method: "GET",
      headers: authHeaders(accessToken, apiKey),
    },
    "getOrders",
  );
}

/**
 * Place a regular order on the exchange via Kite Connect.
 *
 * Returns the broker order id on success.
 */
export async function placeOrder(
  accessToken: string,
  apiKey: string,
  params: OrderParams,
): Promise<{ order_id: string }> {
  const body = new URLSearchParams();

  body.set("exchange", params.exchange);
  body.set("tradingsymbol", params.tradingsymbol);
  body.set("transaction_type", params.transaction_type);
  body.set("order_type", params.order_type);
  body.set("quantity", String(params.quantity));
  body.set("product", params.product);

  if (params.price !== undefined) body.set("price", String(params.price));
  if (params.trigger_price !== undefined)
    body.set("trigger_price", String(params.trigger_price));
  if (params.disclosed_quantity !== undefined)
    body.set("disclosed_quantity", String(params.disclosed_quantity));
  if (params.validity) body.set("validity", params.validity);
  if (params.tag) body.set("tag", params.tag);

  return kiteFetch(
    `${KITE_API_URL}/orders/regular`,
    {
      method: "POST",
      headers: authHeaders(accessToken, apiKey),
      body: body.toString(),
    },
    "placeOrder",
  );
}
