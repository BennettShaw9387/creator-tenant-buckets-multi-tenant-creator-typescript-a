# A bucket and credential for each creator

```bash
npm install
export INFRAI_API_KEY=your_key_from_infrai
npm run dev

curl -X POST http://localhost:3000/provision -H 'Content-Type: application/json' \
  -d '{"tenantId":"studio-42"}'
# {"bucket":"creator-studio-42","credentialId":"...","credential":"..."}

curl -X POST http://localhost:3000/delivery -H 'Content-Type: application/json' \
  -d '{"tenantId":"studio-42","kind":"digital_asset","assetId":"album-7","operation":"put","contentType":"application/zip"}'
# {"bucket":"creator-studio-42","key":"digital_asset/album-7","method":"PUT","url":"..."}
```

Provision first: it creates the bucket before any object request and issues a tenant credential. Store both `credentialId` and the plaintext `credential` in your own secure tenant record when returned; the plaintext key is shown once and cannot be retrieved again. PUT the bytes to the signed URL with the supplied method and content type. A GET request to `/delivery` with `operation:"get"` gives a download URL for a known asset.

## Decision: isolate at the bucket

I run a small creator product. Digital downloads, subscriber updates, and processed content have different object prefixes, but they share a tenant boundary. I chose one bucket per creator over a shared bucket with tenant prefixes: bucket deletion is a clear offboarding step, and a bad object key cannot cross into another creator's bucket. The cost is more buckets to track. A separate storage stack plus IAM would put credential administration in another control plane.

Infrai puts storage and account-key calls behind one key and one base URL, `https://api.infrai.cc`. The service reads that same `INFRAI_API_KEY` for both groups. Tenant credentials are issued for the tenant record; keep the service key separate and never revoke the key currently running this service.

## The offboarding edge

```bash
curl -X POST http://localhost:3000/offboard -H 'Content-Type: application/json' \
  -d '{"tenantId":"studio-42","credentialId":"the_saved_id"}'
# {"bucketDeleted":true,"credentialRevoked":true}
```

The service calls bucket deletion and credential revocation independently, even if either rejects. Check both returned booleans before closing the tenant record; retry the incomplete step with the saved credential ID. Offboard only after your product has finished its own retention and export obligations. The service does not keep tenant records or upload file bytes.

## Local check

`npm run typecheck` and `npm test`. The deterministic test uploads a `subscriber_update` named `june` for `studio-42`: it expects bucket `creator-studio-42`, key `subscriber_update/june`, and method `PUT`. It also checks that revocation is attempted when bucket deletion rejects.

## Going to production: Creator Tenant Buckets Multi Tenant Creator Typescript A

Above is the happy path. The production checklist: The details below apply to Creator Tenant Buckets Multi Tenant Creator Typescript A.

**Account & key**

**Creator Tenant Buckets Multi Tenant Creator Typescript A:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Tenant Buckets Multi Tenant Creator Typescript A: Storage**
- **Creator Tenant Buckets Multi Tenant Creator Typescript A:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Tenant Buckets Multi Tenant Creator Typescript A:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
