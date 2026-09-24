/**
 * ClicToPay acceptance run (cahier de recettes).
 *
 * Copy it into the running backend container and execute it there, e.g.
 *   docker cp scripts/clictopay-acceptance.js oralign-backend:/app/
 *   docker exec oralign-backend node /app/clictopay-acceptance.js register ORA-RECETTE-01
 *
 * Runs INSIDE the ORALIGN backend container and drives the application's
 * own ClicToPayClient — same class, same configuration, same logger as
 * production traffic. The raw provider JSON lands in the backend logs
 * (ClicToPayClient.logExchange); this script prints what the client
 * returned so each case can be matched to its log line.
 *
 * Usage: node clictopay-acceptance.js <case> [arg]
 *   register <ref>      register.do with the workbook parameters
 *   status <orderId>    getOrderStatusExtended.do
 *   missing-amount      register.do without the amount field (CTP-06)
 *   duplicate           the same orderNumber twice (CTP-07)
 */
const { ClicToPayClient } = require('/app/dist/src/payments/clictopay/clictopay.client');

const client = new ClicToPayClient();
const RETURN_URL = process.env.CLICTOPAY_RETURN_URL;
const FAIL_URL = process.env.CLICTOPAY_FAIL_URL;

const out = (label, payload) =>
  console.log(`\n##${label}## ${JSON.stringify(payload, null, 2)}`);

const describeError = (error) => ({
  kind: error.kind,
  safeCode: error.safeCode,
  message: error.message,
  providerCode: error.providerCode,
});

async function register(orderNumber, amount = 10000) {
  try {
    const result = await client.register({
      orderNumber,
      amount,
      returnUrl: `${RETURN_URL}?ref=${encodeURIComponent(orderNumber)}`,
      failUrl: `${FAIL_URL}?ref=${encodeURIComponent(orderNumber)}`,
      language: 'fr',
      pageView: 'DESKTOP',
    });
    out('REGISTER_OK', { orderNumber, ...result });
    return result;
  } catch (error) {
    out('REGISTER_ERROR', { orderNumber, ...describeError(error) });
    return null;
  }
}

async function status(orderId) {
  try {
    const result = await client.getStatus({ orderId });
    out('STATUS_OK', { orderId, ...result });
    return result;
  } catch (error) {
    out('STATUS_ERROR', { orderId, ...describeError(error) });
    return null;
  }
}

/** CTP-06: the application's own client, driven without `amount`. */
async function missingAmount() {
  const body = client.credentials();
  body.set('orderNumber', `ORA-RECETTE-06-${Date.now().toString(36).toUpperCase()}`);
  body.set('currency', process.env.CLICTOPAY_CURRENCY || '788');
  body.set('returnUrl', RETURN_URL);
  body.set('failUrl', FAIL_URL);
  try {
    const data = await client.post('register.do', body, false);
    client.throwProviderError(data, 'PAYMENT_REGISTRATION_REJECTED');
    out('MISSING_AMOUNT_UNEXPECTED_OK', data);
  } catch (error) {
    out('MISSING_AMOUNT_ERROR', describeError(error));
  }
}

async function duplicate() {
  const orderNumber = 'ORDER-DUP-TEST';
  const first = await register(orderNumber);
  const second = await register(orderNumber);
  out('DUPLICATE_SUMMARY', {
    orderNumber,
    first: first && first.orderId,
    secondAccepted: Boolean(second),
  });
}

async function main() {
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'register') await register(arg);
  else if (mode === 'status') await status(arg);
  else if (mode === 'missing-amount') await missingAmount();
  else if (mode === 'duplicate') await duplicate();
  else throw new Error(`unknown case: ${mode}`);
}

main().catch((error) => {
  console.error('RUNNER_FAILURE', error);
  process.exit(1);
});
