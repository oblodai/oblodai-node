/**
 * `defineKeys<T>()("a", "b", …)` builds a runtime tuple of T's field names that the compiler
 * checks for completeness: omit a key and the call fails to type-check naming what is missing.
 * The tuples feed the contract tests, which compare them with the golden response bodies the core
 * recorded — so a field can neither vanish from the wire nor appear on it unnoticed.
 */
type Missing<T, K extends readonly PropertyKey[]> = Exclude<keyof T, K[number]>;

export function defineKeys<T>() {
  return <const K extends readonly (keyof T & string)[]>(
    ...keys: K & ([Missing<T, K>] extends [never] ? K : { readonly __missingKeys: Missing<T, K> })
  ): K => keys as K;
}
