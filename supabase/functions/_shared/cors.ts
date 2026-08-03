// Cross-origin access for the web demo (HANDOFF §39). The app is served from
// https://bukit-pennies.netlify.app and POSTs straight to these functions, so
// the browser fires a CORS preflight (the Authorization header plus a JSON
// body both trigger one). Supabase's gateway does not add CORS headers for
// edge functions, so without this every browser call fails as "Failed to
// fetch" at the preflight step.
//
// `*` is the right value, not an echo of the request Origin: the credential in
// the Authorization header is the auth, not the referer, and a native client
// sends no Origin at all. The iOS Shortcut and the Android listener are
// unaffected either way.
export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey',
  'access-control-max-age': '86400',
};

/**
 * Returns a 204 preflight response, or null for a real request. Call before
 * any other method handling so OPTIONS is never answered with 405.
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}

/** JSON response carrying the CORS headers, so a browser can read the body. */
export function corsJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}
