import { fetchGithubOAuth } from "../../utils/githubOAuth";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    client_id?: string;
    scope?: string;
  }>(event);

  if (!body.client_id) {
    throw createError({
      statusCode: 400,
      statusMessage: "GitHub OAuth client ID is required."
    });
  }

  const params = new URLSearchParams({
    client_id: body.client_id,
    scope: body.scope ?? "gist"
  });

  const response = await fetchGithubOAuth("https://github.com/login/device/code", params);

  setResponseStatus(event, response.status);

  return await response.json();
});
