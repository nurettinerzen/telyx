import Stripe from 'stripe';

const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();

if (!secretKey) {
  console.error('Missing STRIPE_SECRET_KEY. Export a live key before running this script.');
  process.exit(1);
}

if (!secretKey.startsWith('sk_live_')) {
  console.error('This script is intended for live mode. Provide an sk_live_ key.');
  process.exit(1);
}

const stripe = new Stripe(secretKey);

const CATALOG_VERSION = '2026-04-live-v1';

const PLAN_CATALOG = [
  {
    planId: 'STARTER',
    productName: 'Telyx Starter',
    productDescription: 'Starter monthly subscription for written channels.',
    prices: [
      { currency: 'usd', amountMajor: 55, envName: 'STRIPE_STARTER_PRICE_ID' },
      { currency: 'try', amountMajor: 2499, envName: 'STRIPE_STARTER_PRICE_ID_TRY' },
    ],
  },
  {
    planId: 'PRO',
    productName: 'Telyx Pro',
    productDescription: 'Pro monthly subscription with voice minutes and advanced features.',
    prices: [
      { currency: 'usd', amountMajor: 167, envName: 'STRIPE_PRO_PRICE_ID' },
      { currency: 'try', amountMajor: 7499, envName: 'STRIPE_PRO_PRICE_ID_TRY' },
    ],
  },
];

function toMinorUnits(currency, amountMajor) {
  const zeroDecimalCurrencies = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg',
    'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
  ]);

  return zeroDecimalCurrencies.has(currency.toLowerCase())
    ? Math.round(amountMajor)
    : Math.round(amountMajor * 100);
}

async function findExistingProduct(planId) {
  let startingAfter;

  while (true) {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      starting_after: startingAfter,
    });

    const match = page.data.find((product) => (
      product.metadata?.telyx_plan === planId &&
      product.metadata?.telyx_catalog_version === CATALOG_VERSION
    ));

    if (match) return match;
    if (!page.has_more) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
}

async function ensureProduct(plan) {
  const existing = await findExistingProduct(plan.planId);
  if (existing) return existing;

  return stripe.products.create({
    name: plan.productName,
    description: plan.productDescription,
    metadata: {
      telyx_plan: plan.planId,
      telyx_catalog_version: CATALOG_VERSION,
    },
  });
}

async function findExistingPrice(productId, currency, unitAmount) {
  let startingAfter;

  while (true) {
    const page = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100,
      starting_after: startingAfter,
    });

    const match = page.data.find((price) => (
      price.currency === currency &&
      price.unit_amount === unitAmount &&
      price.type === 'recurring' &&
      price.recurring?.interval === 'month'
    ));

    if (match) return match;
    if (!page.has_more) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
}

async function ensurePrice(plan, product, priceConfig) {
  const unitAmount = toMinorUnits(priceConfig.currency, priceConfig.amountMajor);
  const existing = await findExistingPrice(product.id, priceConfig.currency, unitAmount);
  if (existing) return existing;

  return stripe.prices.create({
    product: product.id,
    currency: priceConfig.currency,
    unit_amount: unitAmount,
    recurring: {
      interval: 'month',
    },
    nickname: `${plan.planId} ${priceConfig.currency.toUpperCase()} Monthly`,
    metadata: {
      telyx_plan: plan.planId,
      telyx_catalog_version: CATALOG_VERSION,
      env_name: priceConfig.envName,
    },
  });
}

async function main() {
  const output = {};

  for (const plan of PLAN_CATALOG) {
    const product = await ensureProduct(plan);
    console.log(`Product ready: ${plan.planId} -> ${product.id}`);

    for (const priceConfig of plan.prices) {
      const price = await ensurePrice(plan, product, priceConfig);
      output[priceConfig.envName] = price.id;
      console.log(
        `  Price ready: ${priceConfig.envName} -> ${price.id} (${priceConfig.currency.toUpperCase()} ${priceConfig.amountMajor}/month)`
      );
    }
  }

  console.log('\nRender production env values:\n');
  for (const [envName, priceId] of Object.entries(output)) {
    console.log(`${envName}=${priceId}`);
  }

  console.log('\nEnterprise note:');
  console.log('Public pricing routes Enterprise to contact sales, so STRIPE_ENTERPRISE_PRICE_ID can be set later if you add a self-serve Enterprise checkout.');
}

main().catch((error) => {
  console.error('\nStripe catalog bootstrap failed.');
  console.error(error);
  process.exit(1);
});
