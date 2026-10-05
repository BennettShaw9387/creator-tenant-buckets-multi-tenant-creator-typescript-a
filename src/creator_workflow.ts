export type AssetKind = "digital_asset" | "subscriber_update" | "processed_content";

export function bucketFor(tenantId: string): string {
  return `creator-${tenantId}`;
}

export function objectKey(kind: AssetKind, assetId: string): string {
  return `${kind}/${assetId}`;
}

export interface CreatorGateway {
  createBucket(name: string): Promise<unknown>;
  createKey(body: { name: string; idempotency_key: string }): Promise<{ id: string; key: string }>;
  presign(bucket: string, key: string, body: {
    op: "get" | "put"; expires_seconds: number; content_type?: string;
    idempotency_key?: string;
  }): Promise<{ url: string }>;
  deleteBucket(bucket: string): Promise<unknown>;
  revokeKey(id: string): Promise<unknown>;
}

export async function provision(gateway: CreatorGateway, tenantId: string) {
  const bucket = bucketFor(tenantId);
  await gateway.createBucket(bucket);
  const credential = await gateway.createKey({
    name: `creator-${tenantId}`,
    idempotency_key: `credential-${tenantId}`,
  });
  return { bucket, credentialId: credential.id, credential: credential.key };
}

export async function delivery(gateway: CreatorGateway, input: {
  tenantId: string; kind: AssetKind; assetId: string; operation: "get" | "put";
  contentType?: string;
}) {
  const bucket = bucketFor(input.tenantId);
  const key = objectKey(input.kind, input.assetId);
  const signed = await gateway.presign(bucket, key, {
    op: input.operation,
    expires_seconds: 600,
    ...(input.operation === "put" ? {
      content_type: input.contentType,
      idempotency_key: `upload-${input.tenantId}-${input.kind}-${input.assetId}`,
    } : {}),
  });
  return { bucket, key, method: input.operation === "put" ? "PUT" : "GET", url: signed.url };
}

export async function offboard(gateway: CreatorGateway, tenantId: string, credentialId: string) {
  const [bucket, credential] = await Promise.allSettled([
    gateway.deleteBucket(bucketFor(tenantId)), gateway.revokeKey(credentialId),
  ]);
  return {
    bucketDeleted: bucket.status === "fulfilled",
    credentialRevoked: credential.status === "fulfilled",
  };
}
