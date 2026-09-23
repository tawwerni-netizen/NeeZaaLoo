# Nizalo Payment Receiver (Android)

Operator tool that reads Vodafone Cash and InstaPay payment SMS on the phone that
receives them, and reports them to the Nizalo backend. The backend decides every
credit and debit. The phone never marks money as received or sent on its own.

```
SMS -> SmsReceiver -> MessageParser (:parser) -> duplicate check (fingerprint)
    -> encrypted Room DB -> sync_queue -> POST /v1/payment-receiver/transactions
    -> backend re-reads the SMS, matches exactly one deposit intent, credits
```

## Build

Requires JDK 17 and the Android SDK (API 34).

| Flavor    | Backend                           | Plain HTTP | Mock backend       |
|-----------|-----------------------------------|------------|--------------------|
| `dev`     | configurable, or in-app mock      | allowed    | compiled in        |
| `staging` | configurable                      | refused    | not compiled in    |
| `prod`    | configurable                      | refused    | not compiled in    |

```bash
./gradlew :parser:test :app:testDevDebugUnitTest   # all tests
./gradlew :app:assembleProdRelease                   # production APK
```

Release signing reads `keystore.properties` (git-ignored; see
`keystore.properties.example`). Keep the keystore and its passwords outside the
repository and backed up: without them, installed phones cannot be updated.

## Operator setup

1. Admin console: **Local payments -> Devices -> Issue key**. The key is shown once.
2. In the app: **Settings** -> website URL (`https://…`) and the key as
   *Connection Token*. The token is stored encrypted with the Android Keystore and
   is never shown or logged unless the operator taps *Show*.
3. **Load numbers from server** and tick the receiving numbers this phone's SIMs
   serve (a provider with one active number is pre-selected).
4. Grant SMS and notification permissions from the dashboard card.
5. **Test connection** must show `✓ الاتصال يعمل` with the device name.

## Backend contract

All routes authenticate with the `x-device-api-key` header and are rate-limited
per device (`packages/api/src/server.mjs`).

| Route | Purpose |
|---|---|
| `GET  /v1/payment-receiver/health` | Validates the token; `server: ONLINE` + device label |
| `GET  /v1/payment-receiver/statistics` | Today's counts for this device (Cairo day) |
| `POST /v1/payment-receiver/transactions` | Report one receipt (see outcomes below) |
| `GET  /v1/payment-receiver/transactions?ids=` | Current status of this device's reports |
| `GET  /v1/payment-receiver/withdrawals` | Payouts awaiting manual transfer |
| `GET  /v1/payment-receiver/withdrawals/:id` | One payout, with the EGP amount to send |
| `POST /v1/payment-receiver/withdrawals/:id/confirm` | Record the manual transfer; body `{idempotencyKey, reference?}` |
| `GET  /v1/payments/local-rails` | Receiving numbers (public) |

Report outcomes: `SUCCESS` (credited), `NEEDS_REVIEW` (recorded, awaiting an
admin), `DUPLICATE` (receipt already on file), `ALREADY_PROCESSED` (this device's
own retry). Errors: `401` bad token, `403` device disabled, `422` unknown
receiving number, `400` with an error code for invalid input, `429` rate limit.

The legacy routes used by app 1.x (`POST /transfers`, `POST /withdrawals/:id/complete`)
still work and share the same duplicate and trust rules.

## Money-safety rules

- **One report, one credit.** Every receipt carries a client key generated once on
  the phone; the backend stores `(device, key)` unique and also fingerprints the
  receipt text. Retries, lost responses, reinstalls and double SMS deliveries
  cannot credit twice (`db/migrations/0072_payment_receiver_integrity.sql`).
- **The backend reads the receipt itself.** Device-extracted fields are advisory;
  a receipt the server cannot read is recorded for review, never credited.
- **Forged receipts are not credited.** Providers send from alphanumeric sender IDs
  or short codes. A "receipt" from an ordinary mobile number is held on the phone
  and, if sent anyway, recorded by the backend as `UNTRUSTED_SENDER`.
- **One payout, one debit.** Confirming a withdrawal sends a key that is saved
  before the request leaves the phone and reused on every retry;
  `device_confirm_local_withdrawal()` answers `ALREADY_PROCESSED` to any repeat.
- **Nothing is lost offline.** Receipts are queued in the encrypted database and
  retried (30 s, 1 m, 2 m, 5 m … capped at 6 h) until the backend answers. A
  48-hour inbox scan recovers receipts that arrived while the app was stopped.

## Security

HTTPS only outside dev, system CAs only (user-installed CAs are not trusted),
SQLCipher-encrypted database with a Keystore-protected key, token in the
Keystore, no HTTP logging, `FLAG_SECURE` on all screens, backups disabled,
root indicators reported to the operator and the audit log.
