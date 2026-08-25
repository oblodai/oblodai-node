#!/usr/bin/env node
// Generates src/contract/{routes,enums,requests,version}.ts from contract/contract.json (exported by
// the core's TestSDKContract_Export) and contract/descriptions.en.json (English field docs).
// Nothing in the generated files is edited by hand. Run: npm run codegen. CI: scripts/check-drift.mjs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requestOverrides } from "./schema-overrides.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "contract", "contract.json"));
const contract = JSON.parse(raw.toString("utf8"));
const outDir = join(root, "src", "contract");
mkdirSync(outDir, { recursive: true });

const descPath = join(root, "contract", "descriptions.en.json");
const descriptions = existsSync(descPath)
  ? JSON.parse(readFileSync(descPath, "utf8"))
  : { request: {}, response: {} };
const missingDescriptions = [];

const HEADER = `// GENERATED FILE — do not edit. Source: contract/contract.json (core ${contract.core_commit.slice(0, 12)}).\n// Regenerate with: npm run codegen\n`;

// Read-only routes: a transport failure may be retried without risking a duplicate side effect.
const SAFE_SUFFIX = /\/(info|history|list|calculate|validate|services|get|balance|qr|deliveries)$/;
// Paths that look read-only but whose body can mutate state.
const NOT_SAFE = new Set(["POST /v1/vrcs"]);
function isSafe(r) {
  if (NOT_SAFE.has(`${r.method} ${r.path}`)) return false;
  return r.method === "GET" || SAFE_SUFFIX.test(r.path);
}

// --- routes.ts -------------------------------------------------------------------------------
const routes = contract.routes
  .filter((r) => !/^\/(healthz|readyz|docs|openapi\.json|internal)/.test(r.path))
  .sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );

let routesTs = `${HEADER}import type { RouteSpec } from "./types.js";\n\n`;
routesTs += `/** Every merchant-facing route the core declares, keyed exactly as its conformance table keys them. */\n`;
routesTs += `// prettier-ignore\nexport const ROUTES = {\n`;
for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  const fields = [
    `method: "${r.method}"`,
    `path: "${r.path}"`,
    `auth: "${r.auth}"`,
    `idempotent: ${r.idempotent}`,
    `safe: ${isSafe(r)}`,
    `bare: ${r.bare}`,
  ];
  if (r.list) fields.push(`list: "${r.list}"`);
  routesTs += `  "${key}": { ${fields.join(", ")} },\n`;
}
routesTs += `} as const satisfies Record<string, RouteSpec>;\n\nexport type RouteKey = keyof typeof ROUTES;\n`;
writeFileSync(join(outDir, "routes.ts"), routesTs);

// --- enums.ts --------------------------------------------------------------------------------
const ENUM_NAMES = {
  payment_status: "PaymentStatus",
  payout_status: "PayoutStatus",
  payout_link_status: "PayoutLinkStatus",
  delivery_status: "DeliveryStatus",
  network: "Network",
  fee_bearer: "FeeBearer",
  fee_bearer_result: "FeeBearerResult",
  batch_on_error: "BatchOnError",
  webhook_kind: "WebhookKind",
  error_kind: "ErrorKind",
};
// Vocabularies the core does not export as enums yet; pinned here from its handlers.
const LOCAL_ENUMS = { amount_mode: ["fixed", "open", "range"] };
let enumsTs = `${HEADER}\n`;
const emitEnum = (name, values) => {
  const constName =
    name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase() + (name.endsWith("s") ? "ES" : "S");
  enumsTs += `export const ${constName} = [${values.map((v) => JSON.stringify(v)).join(", ")}] as const;\n`;
  enumsTs += `export type ${name} = (typeof ${constName})[number];\n\n`;
};
for (const [key, name] of Object.entries(ENUM_NAMES)) {
  const values = contract.enums[key];
  if (!values) throw new Error(`enum ${key} missing from contract.json`);
  emitEnum(name, values);
}
emitEnum("AmountMode", LOCAL_ENUMS.amount_mode);
enumsTs += `/** Webhook event types: \`invoice.<status>\`, \`payout.<status>\`, \`wallet.paid\`. */\n`;
enumsTs += `export const EVENT_TYPES = [${contract.event_types.map((v) => JSON.stringify(v)).join(", ")}] as const;\n`;
enumsTs += `export type EventType = (typeof EVENT_TYPES)[number];\n\n`;
enumsTs += `/** Every error code the core source can emit (\`family.reason\`). */\n`;
const codeLines = [];
for (let i = 0; i < contract.error_codes.length; i += 4) {
  codeLines.push(
    `  ${contract.error_codes
      .slice(i, i + 4)
      .map((c) => JSON.stringify(c))
      .join(", ")},`,
  );
}
enumsTs += `// prettier-ignore\nexport const ERROR_CODES = [\n${codeLines.join("\n")}\n] as const;\n`;
enumsTs += `export type ErrorCode = (typeof ERROR_CODES)[number];\n`;
writeFileSync(join(outDir, "enums.ts"), enumsTs);

// --- requests.ts -----------------------------------------------------------------------------
// Request fields drawn from a generated enum: emitted as `Enum | (string & {})` so the editor
// autocompletes the vocabulary while a value newer than this snapshot still type-checks.
const FIELD_ENUMS = {
  network: "Network",
  pinned_network: "Network",
  on_error: "BatchOnError",
  fee_bearer: "FeeBearer",
  amount_mode: "AmountMode",
};
const ROUTE_FIELD_ENUMS = {
  "POST /v1/payment/history#status": "PaymentStatus",
  "POST /v1/payout/history#status": "PayoutStatus",
  "POST /v1/payout/history#kind": '"payout" | "refund"',
  "POST /v1/payment/resolve#action": '"accept" | "refund"',
  "POST /v1/test-webhook/payment#status": "PaymentStatus",
  "POST /v1/test-webhook/payout#status": "PayoutStatus",
  "POST /v1/test-webhook/wallet#status": '"paid"',
  "POST /v1/payment/testing-webhook#status": "PaymentStatus",
};
const MONEY_FIELD = /(^|_)(amount|min_amount|max_amount|amount_fixed)$/;
// Fields the handler requires although the shared DTO marks them optional (batch items reuse the
// single-create DTO, where the core backfills the key from the Idempotency-Key header).
const REQUIRED_OVERRIDES = {
  "POST /v1/payment/batch": ["payments.order_id"],
  "POST /v1/payout/batch": ["payouts.order_id"],
  "POST /v1/refund/batch": ["refunds.reference"],
  "POST /v1/transfer/batch": ["transfers.order_id", "transfers.amount", "transfers.currency"],
  "POST /v1/payout/link/batch": ["items.reference"],
  "POST /v1/transfer/to-user": ["amount", "currency"],
  "POST /v1/claim/{token}": ["address"],
};

function tsType(schema, indent, ctx) {
  if (!schema || typeof schema !== "object") return "unknown";
  switch (schema.type) {
    case "string": {
      const e = ROUTE_FIELD_ENUMS[`${ctx.route}#${ctx.field}`] ?? FIELD_ENUMS[ctx.field];
      if (e) return `${e} | (string & {})`;
      if (ctx.field && MONEY_FIELD.test(ctx.field)) return "Money";
      return "string";
    }
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `Array<${tsType(schema.items, indent, { ...ctx, prefix: `${ctx.prefix}${ctx.field}.`, field: "" })}>`;
    case "object": {
      if (schema.properties) return objectType(schema, indent, ctx);
      if (schema.additionalProperties)
        return `Record<string, ${tsType(schema.additionalProperties, indent, ctx)}>`;
      return "Record<string, unknown>";
    }
    default:
      return "unknown";
  }
}
function objectType(schema, indent, ctx) {
  const req = new Set(schema.required ?? []);
  for (const f of REQUIRED_OVERRIDES[ctx.route] ?? []) {
    if (f.startsWith(ctx.prefix) && !f.slice(ctx.prefix.length).includes("."))
      req.add(f.slice(ctx.prefix.length));
  }
  const pad = "  ".repeat(indent + 1);
  const names = Object.keys(schema.properties).sort();
  if (names.length === 0) return "Record<string, never>";
  const lines = names.map((n) => {
    const p = schema.properties[n];
    const key = `${ctx.prefix}${n}`;
    const desc = descriptions.request?.[ctx.route]?.[key];
    if (!desc && p.description) missingDescriptions.push(`${ctx.route}#${key}`);
    const ex = p.example !== undefined ? ` Example: ${JSON.stringify(p.example)}.` : "";
    const doc = desc || ex ? `${pad}/** ${desc ?? ""}${ex} */\n` : "";
    return `${doc}${pad}${n}${req.has(n) ? "" : "?"}: ${tsType(p, indent + 1, { ...ctx, field: n })};`;
  });
  return `{\n${lines.join("\n")}\n${"  ".repeat(indent)}}`;
}
let reqTs = `${HEADER}import type { AmountMode, BatchOnError, FeeBearer, Network, PaymentStatus, PayoutStatus } from "./enums.js";\nimport type { Money } from "./models/common.js";\n\n`;
reqTs += `/** Request bodies by route, generated from the core's documented DTOs (names, required flags, descriptions, examples). */\nexport interface RequestBodies {\n`;
for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  const schema = r.request_schema ?? requestOverrides[key];
  if (!schema) continue;
  reqTs += `  "${key}": ${tsType(schema, 1, { route: key, prefix: "", field: "" })};\n`;
}
reqTs += `}\n\nexport type RequestBodyOf<K extends keyof RequestBodies> = RequestBodies[K];\n`;
writeFileSync(join(outDir, "requests.ts"), reqTs);

// --- version.ts ------------------------------------------------------------------------------
const hash = createHash("sha256").update(raw).digest("hex");
writeFileSync(
  join(outDir, "version.ts"),
  `${HEADER}\nexport const CONTRACT_CORE_COMMIT = "${contract.core_commit}";\nexport const CONTRACT_EXPORTED_AT = "${contract.exported_at}";\nexport const CONTRACT_HASH = "${hash}";\n`,
);

if (missingDescriptions.length) {
  console.warn(
    `codegen: ${missingDescriptions.length} request fields lack an English description in contract/descriptions.en.json:\n  ${missingDescriptions.join("\n  ")}`,
  );
}
console.log(
  `codegen: ${routes.length} routes, ${contract.error_codes.length} error codes, contract ${hash.slice(0, 12)}`,
);
