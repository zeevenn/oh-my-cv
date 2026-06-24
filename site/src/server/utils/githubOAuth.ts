import { ProxyAgent } from "undici";

const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export const fetchGithubOAuth = async (
  url: string,
  params: URLSearchParams
): Promise<Response> => {
  return await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString(),
    dispatcher
  } as RequestInit);
};
