import assert from "node:assert/strict";
import { test } from "node:test";
import { delivery, offboard, type CreatorGateway } from "./creator_workflow.ts";

test("subscriber update upload stays in its tenant bucket; both offboarding actions run", async () => {
  const calls: string[] = [];
  const gateway: CreatorGateway = {
    createBucket: async () => undefined,
    createKey: async () => ({ id: "key-1", key: "once" }),
    presign: async (bucket, key, body) => {
      calls.push(`${bucket}/${key}:${body.op}`);
      return { url: "https://upload.example/signed" };
    },
    deleteBucket: async bucket => { calls.push(`delete:${bucket}`); throw Error("retry later"); },
    revokeKey: async id => { calls.push(`revoke:${id}`); },
  };
  const result = await delivery(gateway, {
    tenantId: "studio-42", kind: "subscriber_update", assetId: "june",
    operation: "put", contentType: "application/pdf",
  });
  assert.deepEqual(result, {
    bucket: "creator-studio-42", key: "subscriber_update/june", method: "PUT",
    url: "https://upload.example/signed",
  });
  assert.deepEqual(await offboard(gateway, "studio-42", "key-1"), {
    bucketDeleted: false, credentialRevoked: true,
  });
  assert.deepEqual(calls, ["creator-studio-42/subscriber_update/june:put",
    "delete:creator-studio-42", "revoke:key-1"]);
});
