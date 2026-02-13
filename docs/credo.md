Decentralized and auditable value promises, issued and cancelled using cryptographically signed messages.

## Terminology

Issuer (Alice) – the party who promises to pay
Recipient (Bob) – the party to whom the promise is made
Promise – a cryptographically signed commitment
Settlement – cryptographic cancellation of a promise by the recipient
Identity – Nostr keys (npub / nsec)

## Promise payload

Canonical JSON (signed payload)
{
"type": "promise",
"version": 1,
"issuer": "<alice_npub>",
"recipient": "<bob_npub>",
"amount": 1000,
"unit": "sat",
"nonce": "<32B hex>",
"expires_at": 1700000000,
"created_at": 1690000000
}

Promise ID
promise_id = SHA256(canonical_json)

Issuer signature
promise_signature = SchnorrSign(alice_nsec, promise_id)

Full promise message
{
"promise": { ... },
"promise_id": "...",
"issuer_sig": "..."
}

### Wire format for promise

- The message is transported as a string starting with the `credo` prefix.
- Recommended format: `credo` + `A` + `base64url(utf8(json))`
  - `A` denotes the wire-format version (currently `A` = v1)
  - `json` is the full promise message object (i.e. `{"promise":...,"promise_id":...,"issuer_sig":...}`)
  - `base64url` = URL-safe Base64 without `=` padding

### Promise validity

A promise is valid if:

- The issuer signature verifies
- now < expires_at
- no valid settlement confirmation exists

## Promise invalidation

- A promise is deactivated when a complete settlement confirmation exists.
- Data may be deleted when the promise is cryptographically invalid or expired.

## Settlement payload

{
"type": "settlement",
"version": 1,
"promise_id": "<promise_id>",
"recipient": "<bob_npub>",
"issuer": "<alice_npub>",
"settled_at": 1695000000
}

Settlement ID
settlement_id = SHA256(canonical_json)

Recipient signature
recipient_sig = SchnorrSign(
bob_nsec,
settlement_id
)

Full settlement message
{
"settlement": { ... },
"settlement_id": "...",
"recipient_sig": "..."
}

### Wire format for settlement

- Same as promise: `credoA` + `base64url(utf8(json))`
  - `json` is the full settlement message object (i.e. `{"settlement":...,"settlement_id":...,"recipient_sig":...}`)

### Notes

- Promise delivery/transport is out of scope for the protocol
- No central registry: both parties store the promise in their own DB and validate the counterparty signature

## Partial settlement

Allow a promise to be settled in multiple parts.

- The promise has the original `amount`.
- The recipient can issue multiple settlement messages, each with an `amount`.
- The promise is considered fully cancelled only when $\sum settlement.amount = promise.amount$ (or when there is an explicit `final=true` for $\sum = promise.amount$).

## Partial settlement payload

```json
{
  "type": "settlement",
  "version": 1,
  "promise_id": "<promise_id>",
  "recipient": "<bob_npub>",
  "issuer": "<alice_npub>",
  "amount": 250,
  "unit": "sat",
  "nonce": "<32B hex>",
  "settled_at": 1695000000
}
```

### Validation rules

- Each settlement must have a valid `recipient_sig` signature.
- All settlements for a given `promise_id` must have the same `recipient` and `issuer` as the promise (if you include those fields in the payload).
- All settlements must have the same `unit` as the promise.
- The sum of amounts across unique settlements (uniqueness via `settlement_id` or `nonce`) must not exceed `promise.amount`.
