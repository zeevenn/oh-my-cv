interface Env {
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://zeevenn.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const OAUTH_TARGETS = new Map([
  ["/device-code", "https://github.com/login/device/code"],
  ["/access-token", "https://github.com/login/oauth/access_token"],
  ["/github/device-code", "https://github.com/login/device/code"],
  ["/github/access-token", "https://github.com/login/oauth/access_token"]
]);

const getAllowedOrigins = (env: Env) => {
  const origins = env.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(origins?.length ? origins : DEFAULT_ALLOWED_ORIGINS);
};

const isAllowedOrigin = (request: Request, env: Env) => {
  const origin = request.headers.get("Origin");

  return !origin || getAllowedOrigins(env).has(origin);
};

const getCorsHeaders = (request: Request, env: Env) => {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "accept, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  });
  const origin = request.headers.get("Origin");

  if (origin && getAllowedOrigins(env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
};

const getTargetUrl = (request: Request) => {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  return OAUTH_TARGETS.get(pathname) ?? null;
};

const textResponse = (request: Request, env: Env, body: string, status: number) => {
  const headers = getCorsHeaders(request, env);

  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(body, { status, headers });
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: isAllowedOrigin(request, env) ? 204 : 403,
        headers: getCorsHeaders(request, env)
      });
    }

    if (!isAllowedOrigin(request, env)) {
      return textResponse(request, env, "Origin not allowed.", 403);
    }

    const targetUrl = getTargetUrl(request);

    if (!targetUrl || request.method !== "POST") {
      return textResponse(request, env, "Not found.", 404);
    }

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type":
            request.headers.get("Content-Type") ?? "application/x-www-form-urlencoded"
        },
        body: await request.text()
      });
      const headers = getCorsHeaders(request, env);

      headers.set(
        "Content-Type",
        response.headers.get("Content-Type") ?? "application/json; charset=utf-8"
      );
      headers.set("Cache-Control", "no-store");

      return new Response(await response.text(), {
        status: response.status,
        headers
      });
    } catch {
      return textResponse(request, env, "GitHub OAuth proxy failed.", 502);
    }
  }
} satisfies ExportedHandler<Env>;
