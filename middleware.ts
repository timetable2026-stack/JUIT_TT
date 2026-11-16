// Routes each extra space's API (<portal>/api/...) to the shared /api handlers,
// tagging the request with the space. The original site's URLs are untouched.
import { NextResponse, type NextRequest } from "next/server";
import { SPACES, SPACE_HEADER } from "./lib/space";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  for (const s of SPACES) {
    if (!s.portal || !pathname.startsWith(`${s.portal}/api/`)) continue;
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(s.portal.length);
    const headers = new Headers(req.headers);
    headers.set(SPACE_HEADER, s.id);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/2026/api/:path*"] };
