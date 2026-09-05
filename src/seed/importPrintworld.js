'use strict';

/**
 * Imports the printworldshop.com catalogue into this portal.
 *
 *   npm run import:printworld -- --dry-run        preview without writing
 *   npm run import:printworld                     import products
 *   npm run import:printworld -- --assign-all     also assign them to every active vendor
 *   npm run import:printworld -- --no-images      keep the source image URLs as-is
 *
 * The source is WooCommerce, so this reads its public Store API rather than
 * scraping HTML. Every record keeps `source.externalId`, which makes the import
 * idempotent: running it again updates the same products instead of duplicating.
 */

const https = require('https');

const config = require('./../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const cloudinary = require('../config/cloudinary');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const VendorProduct = require('../models/VendorProduct');
const User = require('../models/User');
const { ROLES } = require('../config/roles');

const SOURCE = 'printworldshop';
const HOST = 'printworldshop.com';
const API = `https://${HOST}/wp-json/wc/store/v1/products`;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const ASSIGN_ALL = argv.includes('--assign-all');
const SKIP_IMAGES = argv.includes('--no-images');
const SHOW_ALL = argv.includes('--all');

/**
 * The source certificate expired in November 2025, so Node refuses the
 * connection under the default settings. We only ever read public product data
 * from this host and never send credentials to it, so relaxing verification for
 * these two calls is acceptable. Fix the certificate and this can go.
 */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent: insecureAgent, headers: { 'User-Agent': 'vendor-b2b-portal-import' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GET ${url} returned ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Could not parse JSON from ${url}: ${err.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent: insecureAgent, headers: { 'User-Agent': 'vendor-b2b-portal-import' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Image ${url} returned ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

/* ---------------------------------------------------------------- mapping */

const NAMED_ENTITIES = {
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&hellip;': '...',
  '&ndash;': '-',
  '&mdash;': '-',
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&times;': 'x',
};

/**
 * WordPress stores a lot of HTML entities in product names and descriptions,
 * including numeric ones such as &#215; for the multiplication sign. Decode the
 * numeric forms generically rather than listing every code point.
 */
const decodeEntities = (value = '') =>
  String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? entity)
    .trim();

/**
 * Source descriptions carry markup injected by the wishlist plugin. Strip the
 * plugin blocks first, then all remaining tags, then collapse whitespace.
 */
function cleanDescription(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<div[^>]*class="[^"]*tinv[^"]*"[\s\S]*?<\/div>/gi, ' ')
      .replace(/<a[^>]*tinvwl[^>]*>[\s\S]*?<\/a>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Store API prices are integers in the currency's minor unit (paise). */
function toMajorUnits(amount, minorUnit = 2) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value) / 10 ** minorUnit;
}

/** The source has no SKUs at all, so derive a stable one from its product id. */
const buildSku = (item) => (item.sku ? String(item.sku).toUpperCase() : `PW-${item.id}`);

function pickCategory(item) {
  const named = (item.categories || [])
    .map((c) => decodeEntities(c.name))
    .filter((name) => name && name.toLowerCase() !== 'uncategorized');
  return named[0] || 'General';
}

function mapAttributes(item) {
  return (item.attributes || [])
    .filter((attr) => attr.name && (attr.terms || []).length)
    .map((attr) => ({
      name: decodeEntities(attr.name),
      options: attr.terms.map((term) => decodeEntities(term.name)).filter(Boolean),
    }));
}

function mapProduct(item) {
  const minorUnit = item.prices?.currency_minor_unit ?? 2;

  return {
    name: decodeEntities(item.name) || `Product ${item.id}`,
    sku: buildSku(item),
    slug: item.slug || slugify(item.name),
    category: pickCategory(item),
    shortDescription: cleanDescription(item.short_description).slice(0, 600),
    description: cleanDescription(item.description).slice(0, 2000),
    unit: 'pcs',
    basePrice: toMajorUnits(item.prices?.price, minorUnit),
    currency: item.prices?.currency_code || 'INR',
    taxPercent: 0,
    attributes: mapAttributes(item),
    isActive: item.is_purchasable !== false,
    source: {
      platform: SOURCE,
      externalId: String(item.id),
      url: item.permalink || '',
    },
    _sourceImages: (item.images || [])
      .map((img) => ({ src: img.src, alt: decodeEntities(img.alt || item.name) }))
      .filter((img) => img.src),
  };
}

/* ---------------------------------------------------------------- images */

/**
 * Re-hosts a source image on Cloudinary.
 *
 * Worth doing even beyond durability: the source site serves over an expired
 * certificate, so browsers block its images outright.
 */
async function rehostImage(url, alt) {
  if (!config.cloudinary.isConfigured) return { url, publicId: '', alt };

  try {
    const buffer = await fetchBuffer(url);
    const dataUri = `data:image/${(url.split('.').pop() || 'jpg').split('?')[0]};base64,${buffer.toString('base64')}`;

    const uploaded = await cloudinary.uploader.upload(dataUri, {
      folder: config.cloudinary.folder,
      resource_type: 'image',
    });
    return { url: uploaded.secure_url, publicId: uploaded.public_id, alt };
  } catch (err) {
    log(`  ! image failed (${err.message}) - keeping the source URL`);
    return { url, publicId: '', alt };
  }
}

/* ---------------------------------------------------------------- run */

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[import] ${message}`);
}

async function fetchAll() {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const batch = await fetchJson(`${API}?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function run() {
  log(`Reading the catalogue from ${HOST}...`);
  const raw = await fetchAll();
  log(`Found ${raw.length} products`);

  const admin = await User.findOne({ role: ROLES.SUPER_ADMIN }).lean();
  if (!admin) throw new Error('No super admin exists yet - run "npm run seed" first');

  const mapped = raw.map(mapProduct);

  if (DRY_RUN) {
    const rows = SHOW_ALL ? mapped : mapped.slice(0, 5);

    log(
      `Dry run - nothing will be written. All ${mapped.length} products would be imported; ` +
        `showing ${rows.length}${SHOW_ALL ? '' : ` of ${mapped.length} (pass --all to list every one)`}:`
    );

    rows.forEach((item) => {
      log(
        `  ${item.sku.padEnd(10)} ${item.name.slice(0, 42).padEnd(44)} ` +
          `${item.currency} ${String(item.basePrice).padStart(8)}  ` +
          `[${item.category}]  ${item._sourceImages.length} img`
      );
    });

    const byCategory = mapped.reduce(
      (acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + 1 }),
      {}
    );

    log('');
    log(`Summary for all ${mapped.length} products:`);
    log(`  ${mapped.filter((item) => !item.basePrice).length} with no price (import at 0)`);
    log(`  ${mapped.filter((item) => item._sourceImages.length).length} with at least one image`);
    log(`  ${mapped.filter((item) => item.attributes.length).length} with selectable options`);
    log(`  ${Object.keys(byCategory).length} categories:`);
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => log(`    ${String(count).padStart(4)}  ${category}`));
    return;
  }

  let createdCount = 0;
  let updatedCount = 0;
  const productIds = [];

  for (const item of mapped) {
    /* eslint-disable no-await-in-loop */
    const { _sourceImages, ...fields } = item;

    const existing = await Product.findOne({
      'source.platform': SOURCE,
      'source.externalId': fields.source.externalId,
    });

    // Fetch images on the first import, and again if they were stored as bare
    // source URLs before Cloudinary was configured - otherwise enabling
    // Cloudinary later would never re-host them, and they would stay pointed at
    // a host whose certificate browsers reject.
    let images = existing ? existing.images : [];
    const missingRehost =
      config.cloudinary.isConfigured && images.some((image) => !image.publicId);

    if (!SKIP_IMAGES && (!existing || !existing.images.length || missingRehost)) {
      images = [];
      for (const img of _sourceImages) {
        images.push(await rehostImage(img.src, img.alt));
      }
    }

    const payload = {
      ...fields,
      images,
      imageUrl: images[0]?.url || '',
      imagePublicId: images[0]?.publicId || '',
      createdBy: admin._id,
    };

    if (existing) {
      // Never clobber a price the super admin has adjusted locally back to 0.
      if (!payload.basePrice && existing.basePrice) payload.basePrice = existing.basePrice;
      Object.assign(existing, payload);
      await existing.save();
      productIds.push(existing._id);
      updatedCount += 1;
    } else {
      const clash = await Product.findOne({ sku: payload.sku }).lean();
      if (clash) {
        log(`  ! SKU ${payload.sku} already belongs to another product - skipped`);
        continue;
      }
      const doc = await Product.create(payload);
      productIds.push(doc._id);
      createdCount += 1;
      log(`  + ${payload.sku} ${payload.name.slice(0, 50)}`);
    }
    /* eslint-enable no-await-in-loop */
  }

  log(`Created ${createdCount}, updated ${updatedCount}`);

  if (ASSIGN_ALL) {
    const vendors = await Vendor.find({ isActive: true }).select('_id name').lean();
    for (const vendor of vendors) {
      const ops = productIds.map((productId) => ({
        updateOne: {
          filter: { vendor: vendor._id, product: productId },
          update: {
            $set: { isActive: true, assignedBy: admin._id, assignedAt: new Date() },
            $setOnInsert: {
              vendor: vendor._id,
              product: productId,
              vendorPrice: null,
              minOrderQty: 1,
            },
          },
          upsert: true,
        },
      }));
      if (!ops.length) continue;
      // eslint-disable-next-line no-await-in-loop
      await VendorProduct.bulkWrite(ops, { ordered: false });
      log(`Assigned ${ops.length} products to ${vendor.name}`);
    }
  } else {
    log('Products are in the catalogue but not assigned to any vendor yet.');
    log('Assign them per vendor in the portal, or re-run with --assign-all.');
  }
}

async function main() {
  try {
    await connectDB();
    await run();
    log('Done.');
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[import] Failed:', err.message);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { mapProduct, cleanDescription, toMajorUnits, slugify, mapAttributes };
