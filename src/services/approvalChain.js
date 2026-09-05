'use strict';

const User = require('../models/User');
const { ROLES } = require('../config/roles');
const { VENDOR_ADMIN_LEVEL } = require('../config/approvals');

/**
 * Routing for a vendor's internal approval chain.
 *
 * Levels are sparse: a vendor may only staff levels 1 and 5, so every lookup
 * asks the database which levels are actually occupied rather than assuming
 * level + 1 exists. The vendor admin always closes the chain.
 */

/** Distinct staff levels in use at this vendor, ascending. */
async function occupiedLevels(vendorId) {
  const levels = await User.distinct('approvalLevel', {
    vendor: vendorId,
    role: ROLES.VENDOR_STAFF,
    isActive: true,
  });

  return levels.filter((level) => Number.isFinite(level)).sort((a, b) => a - b);
}

/**
 * Who must act after someone at `level` has acted.
 * Falls through to the vendor admin when no higher staff level exists.
 */
async function nextLevelAbove(vendorId, level) {
  const levels = await occupiedLevels(vendorId);
  const higher = levels.find((entry) => entry > level);
  return higher ?? VENDOR_ADMIN_LEVEL;
}

/**
 * Where a returned request lands: one occupied step below `level`, never
 * dropping past the person who raised it.
 */
async function previousLevelBelow(vendorId, level, floorLevel) {
  const levels = await occupiedLevels(vendorId);
  const lower = [...levels].reverse().find((entry) => entry < level);

  const target = lower ?? floorLevel ?? null;
  if (target === null || target === undefined) return floorLevel ?? null;

  // Never send it below the raiser - they are the start of the chain.
  return Math.max(target, floorLevel ?? target);
}

/** The approval level a user acts at. */
function levelOf(user) {
  if (!user) return null;
  if (user.role === ROLES.VENDOR_ADMIN) return VENDOR_ADMIN_LEVEL;
  return user.approvalLevel || 1;
}

/** Whether this user is the one the request is currently waiting on. */
function canActOn(user, request) {
  if (!user || !request) return false;
  if (String(request.vendor?._id || request.vendor) !== String(user.vendor)) return false;
  if (request.approval?.currentLevel === null || request.approval?.currentLevel === undefined) {
    return false;
  }
  return levelOf(user) === request.approval.currentLevel;
}

/** True when approving here sends the request out to the super admin. */
const isFinalApprover = (level) => level >= VENDOR_ADMIN_LEVEL;

/** Builds a history entry, keeping the actor's name for display after deletion. */
const event = (action, actor, extra = {}) => ({
  action,
  actor: actor._id,
  actorName: actor.name,
  at: new Date(),
  ...extra,
});

module.exports = {
  occupiedLevels,
  nextLevelAbove,
  previousLevelBelow,
  levelOf,
  canActOn,
  isFinalApprover,
  event,
};
