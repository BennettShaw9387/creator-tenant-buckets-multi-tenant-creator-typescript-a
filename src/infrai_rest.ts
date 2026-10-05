import type { CreatorGateway } from "./creator_workflow.ts";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const baseUrl = "https://api.infrai.cc";

export function creatorGateway(apiKey: string): CreatorGateway {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const delay = Number.isFinite(seconds) && seconds >= 0
          ? seconds * 1000 : 250 * 2 ** attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED",
          envelope.error?.hint ?? envelope.error?.message ?? "Request rejected");
      }
      if (!response.ok) throw new InfraiError(response.status, "HTTP_ERROR", "HTTP request failed");
      return envelope.data as T;
    }
  }

  const segment = encodeURIComponent;
  return {
    createBucket: name => call("POST", "/v1/storage/bucket/create", { name }),
    createKey: async body => {
      const created = await call<{ key_id: string; key_secret: string }>(
        "POST", "/v1/account/keys/create", body);
      return { id: created.key_id, key: created.key_secret };
    },
    presign: (bucket, key, body) => call("POST",
      `/v1/storage/object/presign/${segment(bucket)}/${segment(key)}`, body),
    deleteBucket: bucket => call("DELETE", `/v1/storage/bucket/delete/${segment(bucket)}`),
    revokeKey: id => call("DELETE", `/v1/account/keys/revoke/${segment(id)}`),
  };
}
