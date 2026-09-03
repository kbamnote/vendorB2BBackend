'use strict';

/**
 * Seed script.
 *
 *   npm run seed        -> creates (or refreshes) the super admin account only
 *   npm run seed:demo   -> also creates demo vendors, products, assignments and logins
 *
 * It is idempotent: running it twice will not duplicate anything.
 */

const config = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const VendorProduct = require('../models/VendorProduct');
const { ROLES } = require('../config/roles');

const withDemo = process.argv.includes('--demo');

const DEMO_VENDORS = [
  { name: 'Adani Enterprises', code: 'ADANI', email: 'procurement@adani.example', contactPerson: 'R. Mehta', phone: '9000000001' },
  { name: 'Reliance Industries', code: 'RELIANCE', email: 'vendors@reliance.example', contactPerson: 'S. Iyer', phone: '9000000002' },
  { name: 'Ambuja Cements', code: 'AMBUJA', email: 'supply@ambuja.example', contactPerson: 'K. Rao', phone: '9000000003' },
  { name: 'JSW Steel', code: 'JSW', email: 'buyers@jsw.example', contactPerson: 'A. Nair', phone: '9000000004' },
];

const DEMO_PRODUCTS = [
  { name: 'A4 Letterhead - 100 GSM', sku: 'PRN-LH-A4', category: 'Stationery', unit: 'ream', basePrice: 480, taxPercent: 12 },
  { name: 'Visiting Cards - Matte 300 GSM', sku: 'PRN-VC-300', category: 'Stationery', unit: 'box', basePrice: 350, taxPercent: 12 },
  { name: 'Corrugated Box - 12x10x8', sku: 'PKG-CB-1208', category: 'Packaging', unit: 'pcs', basePrice: 42, taxPercent: 18 },
  { name: 'Bubble Wrap Roll - 1m x 100m', sku: 'PKG-BW-100', category: 'Packaging', unit: 'roll', basePrice: 1250, taxPercent: 18 },
  { name: 'Safety Helmet - ISI', sku: 'SFT-HLM-01', category: 'Safety', unit: 'pcs', basePrice: 310, taxPercent: 18 },
  { name: 'Hi-Vis Safety Jacket', sku: 'SFT-JKT-02', category: 'Safety', unit: 'pcs', basePrice: 260, taxPercent: 12 },
  { name: 'Vinyl Banner - Per Sq Ft', sku: 'SGN-VNL-SQF', category: 'Signage', unit: 'sqft', basePrice: 28, taxPercent: 18 },
  { name: 'Acrylic Name Plate', sku: 'SGN-ACR-NP', category: 'Signage', unit: 'pcs', basePrice: 890, taxPercent: 18 },
  { name: 'Industrial Marker Pen (Pack of 10)', sku: 'STN-MRK-10', category: 'Stationery', unit: 'pack', basePrice: 420, taxPercent: 12 },
  { name: 'Pallet Stretch Film', sku: 'PKG-PSF-01', category: 'Packaging', unit: 'roll', basePrice: 980, taxPercent: 18 },
];

async function upsertSuperAdmin() {
  const email = config.seed.email.toLowerCase();
  let admin = await User.findOne({ email }).select('+password');

  if (admin) {
    admin.role = ROLES.SUPER_ADMIN;
    admin.isActive = true;
    admin.name = config.seed.name;
    await admin.save();
    log(`Super admin already existed, refreshed: ${email}`);
    return admin;
  }

  admin = await User.create({
    name: config.seed.name,
    email,
    password: config.seed.password,
    role: ROLES.SUPER_ADMIN,
  });
  log(`Super admin created: ${email} / ${config.seed.password}`);
  return admin;
}

async function seedDemo(admin) {
  const vendors = [];
  for (const data of DEMO_VENDORS) {
    /* eslint-disable no-await-in-loop */
    let vendor = await Vendor.findOne({ code: data.code });
    if (!vendor) {
      vendor = await Vendor.create({ ...data, createdBy: admin._id });
      log(`Vendor created: ${vendor.name} (${vendor.code})`);
    }
    vendors.push(vendor);
    /* eslint-enable no-await-in-loop */
  }

  const products = [];
  for (const data of DEMO_PRODUCTS) {
    /* eslint-disable no-await-in-loop */
    let product = await Product.findOne({ sku: data.sku });
    if (!product) {
      product = await Product.create({ ...data, createdBy: admin._id });
      log(`Product created: ${product.sku}`);
    }
    products.push(product);
    /* eslint-enable no-await-in-loop */
  }

  // Give every vendor a different slice of the catalogue so the isolation
  // between vendors is visible straight away.
  const slices = [
    products.slice(0, 5),
    products.slice(3, 8),
    products.slice(5, 10),
    products.slice(0, 3).concat(products.slice(8)),
  ];

  for (let i = 0; i < vendors.length; i += 1) {
    const vendor = vendors[i];
    const slice = slices[i] || [];
    const ops = slice.map((product) => ({
      updateOne: {
        filter: { vendor: vendor._id, product: product._id },
        update: {
          $set: { isActive: true, assignedBy: admin._id, assignedAt: new Date() },
          $setOnInsert: { vendor: vendor._id, product: product._id, vendorPrice: null, minOrderQty: 1 },
        },
        upsert: true,
      },
    }));
    if (ops.length) {
      // eslint-disable-next-line no-await-in-loop
      await VendorProduct.bulkWrite(ops, { ordered: false });
      log(`Assigned ${ops.length} products to ${vendor.name}`);
    }
  }

  // One admin + one staff login per vendor.
  for (const vendor of vendors) {
    const slug = vendor.code.toLowerCase();
    const accounts = [
      {
        name: `${vendor.name} Admin`,
        email: `admin@${slug}.com`,
        password: 'Vendor@123',
        role: ROLES.VENDOR_ADMIN,
        designation: 'Procurement Head',
      },
      {
        name: `${vendor.name} Staff`,
        email: `staff@${slug}.com`,
        password: 'Staff@123',
        role: ROLES.VENDOR_STAFF,
        designation: 'Purchase Executive',
      },
    ];

    for (const account of accounts) {
      /* eslint-disable no-await-in-loop */
      const exists = await User.findOne({ email: account.email }).lean();
      if (exists) continue;
      await User.create({ ...account, vendor: vendor._id, createdBy: admin._id });
      log(`Login created: ${account.email} / ${account.password} (${account.role})`);
      /* eslint-enable no-await-in-loop */
    }
  }
}

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[seed] ${message}`);
}

(async function run() {
  try {
    await connectDB();
    const admin = await upsertSuperAdmin();
    if (withDemo) await seedDemo(admin);
    log('Done.');
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[seed] Failed:', err);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
})();
