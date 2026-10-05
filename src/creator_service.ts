import { createServer } from "node:http";
import { z } from "zod";
import { creatorGateway, InfraiError } from "./infrai_rest.ts";
import { delivery, offboard, provision } from "./creator_workflow.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const gateway = creatorGateway(apiKey);
const tenantId = z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/);
const provisionBody = z.object({ tenantId });
const deliveryBody = z.object({
  tenantId,
  kind: z.enum(["digital_asset", "subscriber_update", "processed_content"]),
  assetId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  operation: z.enum(["get", "put"]),
  contentType: z.string().min(1).optional(),
}).refine(value => value.operation !== "put" || !!value.contentType,
  "contentType is required for uploads");
const offboardBody = z.object({ tenantId, credentialId: z.string().min(1) });

createServer(async (req, res) => {
  const respond = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.method !== "POST" || !["/provision", "/delivery", "/offboard"].includes(req.url ?? "")) {
      respond(404, { error: "Route not found" });
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body: unknown = JSON.parse(raw);
    if (req.url === "/provision") respond(200, await provision(gateway, provisionBody.parse(body).tenantId));
    if (req.url === "/delivery") respond(200, await delivery(gateway,
      deliveryBody.parse(body) as Parameters<typeof delivery>[1]));
    if (req.url === "/offboard") {
      const input = offboardBody.parse(body);
      const result = await offboard(gateway, input.tenantId, input.credentialId);
      respond(result.bucketDeleted && result.credentialRevoked ? 200 : 502, result);
    }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      respond(400, { error: "Invalid request body" });
    } else if (error instanceof InfraiError) {
      respond(error.status >= 400 && error.status < 500 ? error.status : 502,
        { error: error.code, message: error.message });
    } else {
      respond(502, { error: "Upstream request failed" });
    }
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Creator service listening on ${process.env.PORT ?? 3000}`);
});
