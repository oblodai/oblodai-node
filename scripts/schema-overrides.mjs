// Request schemas for routes whose core DTO is not declared in docsapi (kept to one place so a
// future undocumented route has somewhere to go; remove an entry once the core documents it).
const s = (t, extra = {}) => ({ type: t, ...extra });
const obj = (properties, required = []) => ({ type: "object", properties, required });

export const requestOverrides = {
  "POST /v1/merchants": obj(
    {
      email: s("string", { example: "owner@shop.example" }),
      name: s("string", { example: "Acme" }),
    },
    ["email"],
  ),
};
