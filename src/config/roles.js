'use strict';

const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  VENDOR_ADMIN: 'vendor_admin',
  VENDOR_STAFF: 'vendor_staff',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

// Roles that are scoped to a single vendor and therefore require a vendor id.
const VENDOR_SCOPED_ROLES = Object.freeze([ROLES.VENDOR_ADMIN, ROLES.VENDOR_STAFF]);

module.exports = { ROLES, ROLE_VALUES, VENDOR_SCOPED_ROLES };
