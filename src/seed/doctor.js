'use strict';

/**
 * Account doctor - reports on portal logins and repairs the two states that
 * lock somebody out of their own portal.
 *
 *   npm run doctor                                  list accounts and flag problems
 *   node src/seed/doctor.js --email=a@b.com         inspect one account
 *   node src/seed/doctor.js --promote=a@b.com       make that account the super admin
 *
 * Call node directly for the flags: npm swallows `--key=value` arguments as its
 * own config even after `--`, so they never reach the script.
 *
 * Why promote exists: a user with a vendor role whose vendor row has been
 * deleted can never sign in again - login refuses them and there is no screen
 * to fix it from, because reaching any screen requires signing in.
 */

const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { ROLES, ROLE_VALUES } = require('../config/roles');

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const hit = argv.find((arg) => arg.startsWith(`--${flag}=`));
  return hit ? hit.split('=').slice(1).join('=').trim().toLowerCase() : null;
};

const targetEmail = valueOf('email');
const promoteEmail = valueOf('promote');

function log(message = '') {
  // eslint-disable-next-line no-console
  console.log(message);
}

/** Resolves a user plus whether their linked vendor still exists. */
async function describe(user) {
  const needsVendor = user.role !== ROLES.SUPER_ADMIN;
  let vendor = null;
  if (user.vendor) vendor = await Vendor.findById(user.vendor).lean();

  const problems = [];
  if (!ROLE_VALUES.includes(user.role)) {
    problems.push(`role "${user.role}" is not a role of this portal`);
  }
  if (!user.email) problems.push('no email');
  if (!user.isActive) problems.push('account deactivated');
  if (needsVendor && !user.vendor) problems.push('vendor role with no vendor linked');
  if (needsVendor && user.vendor && !vendor) problems.push('linked vendor no longer exists');
  if (needsVendor && vendor && !vendor.isActive) problems.push(`vendor "${vendor.name}" deactivated`);

  return { user, vendor, problems, canSignIn: problems.length === 0 };
}

async function promote(email) {
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No account found for ${email}`);

  user.role = ROLES.SUPER_ADMIN;
  user.isActive = true;
  // The model's pre-validate hook clears the vendor link for a super admin,
  // which is exactly what unsticks an orphaned vendor account.
  user.vendor = null;
  await user.save();

  log('');
  log(`Promoted ${user.email} to super_admin and cleared its vendor link.`);
  log('Its password is unchanged - sign in with the one you already have.');
}

async function run() {
  if (promoteEmail) {
    await promote(promoteEmail);
    return;
  }

  const filter = targetEmail ? { email: targetEmail } : {};
  const users = await User.find(filter).sort({ role: 1, email: 1 }).lean();

  if (!users.length) {
    log(targetEmail ? `No account found for ${targetEmail}` : 'No accounts exist yet.');
    return;
  }

  const superAdmins = users.filter((u) => u.role === ROLES.SUPER_ADMIN);
  const foreign = users.filter((u) => !ROLE_VALUES.includes(u.role));

  log('');
  log(`Connected to database: ${mongoose.connection.name}`);
  log('');
  log(`${users.length} account(s)`);
  log('-'.repeat(96));
  log(`${'EMAIL'.padEnd(34)}${'ROLE'.padEnd(15)}${'ACTIVE'.padEnd(9)}${'VENDOR'.padEnd(22)}STATUS`);
  log('-'.repeat(96));

  for (const user of users) {
    // eslint-disable-next-line no-await-in-loop
    const info = await describe(user);
    const vendorLabel = user.vendor
      ? info.vendor
        ? String(info.vendor.name || info.vendor._id).slice(0, 18)
        : 'MISSING'
      : '-';

    log(
      `${String(user.email || '(no email)').slice(0, 33).padEnd(34)}` +
        `${String(user.role || '(none)').padEnd(15)}` +
        `${(user.isActive ? 'yes' : 'NO').padEnd(9)}` +
        `${vendorLabel.padEnd(22)}` +
        `${info.canSignIn ? 'can sign in' : info.problems.join('; ')}`
    );
  }

  log('-'.repeat(96));
  log('');

  if (foreign.length) {
    log('');
    log(`!! ${foreign.length} of ${users.length} accounts use roles this portal does not define:`);
    log(`   ${[...new Set(foreign.map((u) => u.role))].join(', ')}`);
    log('   That means MONGO_URI points at a database another application already owns.');
    log('   Point it at a dedicated database (add /vendor_b2b_portal before the "?" in the');
    log('   connection string) and run "npm run seed" again.');
  }

  if (!superAdmins.length) {
    log('!! There is no super_admin account at all.');
    log('   Fix with:  npm run doctor -- --promote=<your email>');
    log('   Or create one with:  npm run seed');
  } else {
    log(`Super admin account(s): ${superAdmins.map((u) => u.email).join(', ')}`);
    log('Sign in with one of those. Any other email is a vendor login.');
  }

  const stuck = [];
  for (const user of users) {
    // eslint-disable-next-line no-await-in-loop
    const info = await describe(user);
    if (!info.canSignIn) stuck.push({ email: user.email, problems: info.problems });
  }

  if (stuck.length) {
    log('');
    log('Accounts that cannot sign in:');
    stuck.forEach((entry) => log(`  ${entry.email} - ${entry.problems.join('; ')}`));
  }
}

(async function main() {
  try {
    await connectDB();
    await run();
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[doctor] Failed:', err.message);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
})();
