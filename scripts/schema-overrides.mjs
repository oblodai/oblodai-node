// Request schemas for routes whose core DTO is not yet declared in docsapi (the handler decodes an
// inline struct). Mirrors the handler's json tags; remove an entry as soon as the core documents
// the DTO (the export then carries request_schema and this override is ignored).
const s = (t, extra = {}) => ({ type: t, ...extra });
const obj = (properties, required = []) => ({ type: "object", properties, required });
const page = { limit: s("integer", { example: 50 }), offset: s("integer", { example: 0 }) };

export const requestOverrides = {
  "POST /v1/payment/history": obj({ ...page, status: s("string") }),
  "POST /v1/payout/history": obj({ ...page, status: s("string") }),
  "POST /v1/payment/services": obj({}),
  "POST /v1/payout/services": obj({}),
  "POST /v1/payout/calculate": obj(
    {
      amount: s("string", { example: "10" }),
      currency: s("string", { example: "USDT" }),
      network: s("string", { example: "tron" }),
      is_subtract: s("boolean"),
    },
    ["amount", "currency"],
  ),
  "POST /v1/webhooks/deliveries": obj(page),
  "POST /v1/payment/link/list": obj(page),
  "POST /v1/payment/link/info": obj({ link_id: s("string") }, ["link_id"]),
  "POST /v1/payment/link/toggle": obj({ link_id: s("string"), active: s("boolean") }, [
    "link_id",
    "active",
  ]),
  "POST /v1/split/rule/list": obj(page),
  "POST /v1/split/rule/delete": obj({ rule_id: s("string") }, ["rule_id"]),
  "POST /v1/payment/discount/list": obj(page),
  "POST /v1/payment/accepted/list": obj(page),
  "POST /v1/payment/accepted/set": obj(
    {
      accepted: {
        type: "array",
        items: obj({ currency: s("string"), network: s("string") }, ["currency", "network"]),
      },
    },
    ["accepted"],
  ),
  "POST /v1/auto-withdraw/set": obj(
    {
      currency: s("string", { example: "USDT" }),
      network: s("string", { example: "tron" }),
      address: s("string"),
      min_amount: s("string", { example: "100" }),
    },
    ["currency", "network", "address"],
  ),
  "POST /v1/auto-withdraw/delete": obj({ currency: s("string", { example: "USDT" }) }, [
    "currency",
  ]),
  "POST /v1/api-allowlist/add": obj({ cidr: s("string", { example: "203.0.113.0/24" }) }, ["cidr"]),
  "POST /v1/api-allowlist/remove": obj({ cidr: s("string", { example: "203.0.113.0/24" }) }, [
    "cidr",
  ]),
  "POST /v1/api-allowlist/enable": obj({ enabled: s("boolean") }, ["enabled"]),
};
