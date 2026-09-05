'use strict';

/**
 * Approval hierarchy inside a vendor organisation.
 *
 * Staff sit on numeric levels; the vendor admin always sits above every staff
 * level and is the final internal approver. Levels are sparse on purpose - a
 * vendor may use only 1 and 5 - so routing always looks for the lowest level
 * that is actually occupied above the last actor rather than assuming level+1.
 */
const STAFF_LEVEL_MIN = 1;
const STAFF_LEVEL_MAX = 9;

// Above any staff level, so a vendor admin is always last in the chain.
const VENDOR_ADMIN_LEVEL = 10;

const LEVEL_LABELS = {
  1: 'Level 1 - Requester',
  2: 'Level 2 - Senior',
  3: 'Level 3 - Supervisor',
  4: 'Level 4 - Manager',
  5: 'Level 5 - Senior Manager',
  6: 'Level 6',
  7: 'Level 7',
  8: 'Level 8',
  9: 'Level 9 - Head',
  [VENDOR_ADMIN_LEVEL]: 'Vendor Admin - final approval',
};

module.exports = { STAFF_LEVEL_MIN, STAFF_LEVEL_MAX, VENDOR_ADMIN_LEVEL, LEVEL_LABELS };
