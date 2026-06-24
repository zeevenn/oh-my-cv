import type {
  GithubDeviceCodeResponse,
  GithubDeviceTokenResponse,
  GithubGist,
  GithubGistFile,
  GithubUser
} from "./types";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

const toFormBody = (data: Record<string, string>) => {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(data)) body.set(key, value);

  return body;
};

export class GithubApiError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class GithubDeviceFlowClient {
  constructor(
    private _clientId: string,
    private _proxyBase: string
  ) {}

  private _url(path: string) {
    return `${this._proxyBase.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }

  public async requestDeviceCode(): Promise<GithubDeviceCodeResponse> {
    const res = await fetch(this._url("device-code"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: toFormBody({
        client_id: this._clientId,
        scope: "gist"
      })
    });

    if (!res.ok) {
      throw new GithubApiError(res.status, "Failed to start GitHub login.");
    }

    return await res.json();
  }

  public async pollToken(deviceCode: string): Promise<GithubDeviceTokenResponse> {
    const res = await fetch(this._url("access-token"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: toFormBody({
        client_id: this._clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });

    if (!res.ok) {
      throw new GithubApiError(res.status, "Failed to finish GitHub login.");
    }

    return await res.json();
  }
}

export class GithubGistClient {
  constructor(private _token: string) {}

  private async _request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this._token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(init.headers ?? {})
      }
    });

    if (!res.ok) {
      let message = "GitHub API request failed.";

      try {
        const body = await res.json();
        if (typeof body?.message === "string") message = body.message;
      } catch {}

      throw new GithubApiError(res.status, message);
    }

    if (res.status === 204) return null as T;

    return await res.json();
  }

  public async getUser() {
    return await this._request<GithubUser>("/user");
  }

  public async listGists() {
    return await this._request<GithubGist[]>("/gists?per_page=100");
  }

  public async getGist(id: string) {
    return await this._request<GithubGist>(`/gists/${id}`);
  }

  public async createGist(data: {
    description: string;
    files: Record<string, { content: string }>;
  }) {
    return await this._request<GithubGist>("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: data.description,
        public: false,
        files: data.files
      })
    });
  }

  public async updateGist(
    id: string,
    data: {
      description: string;
      files: Record<string, { content: string } | null>;
    }
  ) {
    return await this._request<GithubGist>(`/gists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  }
}

export const readGistFile = async (file?: GithubGistFile) => {
  if (!file) return null;
  if (!file.truncated && typeof file.content === "string") return file.content;
  if (!file.raw_url) return null;

  const res = await fetch(file.raw_url);
  if (!res.ok) return null;

  return await res.text();
};
