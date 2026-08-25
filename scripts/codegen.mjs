#!/usr/bin/env node
// Generates src/contract/{routes,enums,requests,version}.ts from contract/contract.json.
// The snapshot is exported by the core's TestSDKContract_Export; nothing in src/contract is edited
// by hand. Run: npm run codegen. CI runs it and fails on any diff (scripts/check-drift.mjs).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requestOverrides } from "./schema-overrides.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "contract", "contract.json"));
const contract = JSON.parse(raw.toString("utf8"));
const outDir = join(root, "src", "contract");
mkdirSync(outDir, { recursive: true });

const HEADER = `// GENERATED FILE — do not edit. Source: contract/contract.json (core ${contract.core_commit.slice(0, 12)}).\n// Regenerate with: npm run codegen\n`;

// Read-only routes: a transport failure may be retried without risking a duplicate side effect.
const SAFE_SUFFIX =
  /\/(info|history|list|calculate|validate|services|get|balance|vrcs|qr|deliveries)$/;
function isSafe(r) {
  return r.method === "GET" || SAFE_SUFFIX.test(r.path);
}

// --- routes.ts -------------------------------------------------------------------------------
const routes = contract.routes
  .filter(
    (r) => r.auth !== "onboard" && !/^\/(healthz|readyz|docs|openapi\.json|internal)/.test(r.path),
  )
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
let enumsTs = `${HEADER}\n`;
for (const [key, name] of Object.entries(ENUM_NAMES)) {
  const values = contract.enums[key];
  if (!values) throw new Error(`enum ${key} missing from contract.json`);
  const constName =
    name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase() + (name.endsWith("s") ? "ES" : "S");
  enumsTs += `export const ${constName} = [${values.map((v) => JSON.stringify(v)).join(", ")}] as const;\n`;
  enumsTs += `export type ${name} = (typeof ${constName})[number];\n\n`;
}
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
function tsType(schema, indent) {
  if (!schema || typeof schema !== "object") return "unknown";
  switch (schema.type) {
    case "string":
      return schema.format === "date-time" ? "string" : "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `Array<${tsType(schema.items, indent)}>`;
    case "object": {
      if (schema.properties) return objectType(schema, indent);
      if (schema.additionalProperties)
        return `Record<string, ${tsType(schema.additionalProperties, indent)}>`;
      return "Record<string, unknown>";
    }
    default:
      return "unknown";
  }
}
function objectType(schema, indent) {
  const req = new Set(schema.required ?? []);
  const pad = "  ".repeat(indent + 1);
  const names = Object.keys(schema.properties).sort();
  if (names.length === 0) return "Record<string, never>";
  const lines = names.map((n) => {
    const p = schema.properties[n];
    const ex = p.example !== undefined ? `${pad}/** e.g. ${JSON.stringify(p.example)} */\n` : "";
    return `${ex}${pad}${n}${req.has(n) ? "" : "?"}: ${tsType(p, indent + 1)};`;
  });
  return `{\n${lines.join("\n")}\n${"  ".repeat(indent)}}`;
}
let reqTs = `${HEADER}\n/** Request bodies by route, generated from the core's documented DTOs (field names, required flags, examples). */\nexport interface RequestBodies {\n`;
for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  const schema = r.request_schema ?? requestOverrides[key];
  if (!schema) continue;
  reqTs += `  "${key}": ${tsType(schema, 1)};\n`;
}
reqTs += `}\n\nexport type RequestBodyOf<K extends keyof RequestBodies> = RequestBodies[K];\n`;
writeFileSync(join(outDir, "requests.ts"), reqTs);

// --- version.ts ------------------------------------------------------------------------------
const hash = createHash("sha256").update(raw).digest("hex");
writeFileSync(
  join(outDir, "version.ts"),
  `${HEADER}\nexport const CONTRACT_CORE_COMMIT = "${contract.core_commit}";\nexport const CONTRACT_EXPORTED_AT = "${contract.exported_at}";\nexport const CONTRACT_HASH = "${hash}";\n`,
);

console.log(
  `codegen: ${routes.length} routes, ${contract.error_codes.length} error codes, contract ${hash.slice(0, 12)}`,
);
