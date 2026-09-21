# ClicToPay hosted payments

Oralign uses ClicToPay's hosted payment page. Card details never pass through
the Oralign frontend or backend.

## Configuration

Set these values in the untracked deployment environment or secret manager:

```env
CLICTOPAY_API_URL=https://test.clictopay.com/payment/rest
CLICTOPAY_USERNAME=merchant-api-user
CLICTOPAY_PASSWORD=merchant-api-password
CLICTOPAY_CURRENCY=788
CLICTOPAY_RETURN_URL=http://localhost:3001/payment/return
CLICTOPAY_FAIL_URL=http://localhost:3001/payment/fail
CLICTOPAY_TIMEOUT_MS=15000
```

Use `https://ipay.clictopay.com/payment/rest` in production. Return/fail URLs
must use the public HTTPS frontend origin in production. Never prefix these
variables with `NEXT_PUBLIC_`.

## API flow

1. `POST /api/payments/clictopay/session`
   - Authenticated dentist/admin only.
   - Body: `orderId`, `purpose` (`installment` or `treatment_fee`), and
     `installmentId` for installment payments.
   - Header: `Idempotency-Key`.
   - The server resolves the amount from PostgreSQL, persists the attempt,
     calls `register.do`, and returns the hosted `paymentUrl`.
2. The frontend redirects the browser to `paymentUrl`.
3. ClicToPay returns the browser to `/payment/return` or `/payment/fail`.
4. The frontend calls `GET /api/payments/clictopay/:paymentId/status`.
5. The backend calls `getOrderStatusExtended.do`. Only provider
   `orderStatus = 2` transitions the ledger and business aggregate to paid.

The browser return URL, query string, and fail/return route are never treated
as proof of payment.

## Recovery and idempotency

- Registration is not automatically retried because a lost response can still
  mean ClicToPay created the order.
- A duplicate merchant reference is reconciled through the status endpoint;
  a second order is not created.
- Status calls use bounded retries for transient network/5xx failures.
- Network ambiguity is stored as `unknown`, not `failed`. The result page can
  safely recheck it later.
- Database row locks and partial unique indexes permit only one unresolved
  hosted attempt per installment or treatment fee.
- Repeated status-2 verification is idempotent. Installment unlock, order
  update, treatment-fee stamp, notifications, and invoice generation run once.

## Sandbox validation

1. Configure the test URL and merchant credentials.
2. Create a 10.000 TND session. Inspect the response only for a non-empty
   `paymentId` and a ClicToPay test-host `paymentUrl`.
3. Complete the official accepted-card case on the hosted page.
4. Open the return page and verify the backend reports success only after
   status `2` with amount `10000` and currency `788`.
5. Repeat with the official refused-card case and verify no business state is
   unlocked.
6. Open the return URL directly without paying. It must remain pending/unknown.
7. Retry the same create call with the same idempotency key. It must return the
   same attempt.
8. Simulate a provider outage. The attempt must remain recoverable as unknown.

Automated tests cover the provider contract, exact amount conversion, retry
policy, status mapping, mismatch protection, authorization, and idempotent
replay. Accepted/refused card entry still requires the provider-hosted browser
page because Oralign intentionally never handles card data.

## Production checklist

- Replace the test API URL with the production REST base.
- Store username/password in the deployment secret manager.
- Use public HTTPS return and fail URLs.
- Keep `ALLOW_MOCK_PAYMENTS=false`.
- Run `prisma migrate deploy` before starting the new application image.
- Verify ClicToPay merchant allowlists, production currency `788`, and return
  domains with the provider.
- Run one low-value production smoke payment and reconcile it in both ClicToPay
  monitoring and Oralign payment history.
- Alert on `unknown` attempts and provider data mismatches.
