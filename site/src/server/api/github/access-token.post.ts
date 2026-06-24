import { fetchGithubOAuth } from "../../utils/githubOAuth";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    client_id?: string;
    device_code?: string;
    grant_type?: string;
  }>(event);

  if (!body.client_id || !body.device_code) {
    throw createError({
      statusCode: 400,
      statusMessage: "GitHub OAuth client ID and device code are required."
    });
  }

  const params = new URLSearchParams({
    client_id: body.client_id,
    device_code: body.device_code,
    grant_type: body.grant_type ?? "urn:ietf:params:oauth:grant-type:device_code"
  });

  const response = await fetchGithubOAuth(
    "https://github.com/login/oauth/access_token",
    params
  );

  setResponseStatus(event, response.status);

  return await response.json();
});
