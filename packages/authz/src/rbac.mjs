/**
 * Custom admin roles and granular permissions -- an admin-UI-manageable
 * layer, separate from the fixed capability grid in policy.mjs (see that
 * file's own comment, and db/migrations/0015_rbac_foundation.sql, for why
 * the two are deliberately kept apart). Nothing here can grant a capability
 * from the fixed grid: `permission.code` and `ROLE_CAPABILITIES`'s
 * capability strings are disjoint namespaces by construction, checked once
 * at seed time (see the reconciliation test in this package's own test
 * suite) rather than trusted to stay that way by convention alone.
 */

export const RbacError = Object.freeze({
  ROLE_NOT_FOUND: "ROLE_NOT_FOUND",
  SYSTEM_ROLE_IMMUTABLE: "SYSTEM_ROLE_IMMUTABLE",
  UNKNOWN_PERMISSION: "UNKNOWN_PERMISSION",
  DUPLICATE_NAME: "DUPLICATE_NAME",
  SELF_GRANT: "SELF_GRANT",
});

export function createRbacService(db) {
  async function listPermissions() {
    const r = await db.query("SELECT code, category, description FROM permission ORDER BY category, code");
    return r.rows;
  }

  // Takes an explicit executor (`db` or an open `tx`) rather than always
  // using the outer `db` -- calling `db.query` from inside a transaction on
  // this same connection while that transaction is still open is exactly
  // the self-deadlock this codebase already hit once in reconciliation
  // (see packages/reconciliation/src/reconcile.mjs's own history): the
  // transaction's callback would await a query that can never run until
  // the transaction it's nested inside releases the connection.
  async function rolePermissionCodes(executor, roleId) {
    const r = await executor.query(
      "SELECT permission_code FROM role_permission WHERE role_id = $1 ORDER BY permission_code",
      [roleId]
    );
    return r.rows.map((row) => row.permission_code);
  }

  async function listRoles() {
    const roles = (await db.query(
      "SELECT id, name, description, is_system, created_by, created_at, updated_at FROM role ORDER BY name"
    )).rows;
    return Promise.all(roles.map(async (role) => ({ ...role, permissions: await rolePermissionCodes(db, role.id) })));
  }

  async function getRole(id) {
    const r = await db.query(
      "SELECT id, name, description, is_system, created_by, created_at, updated_at FROM role WHERE id = $1",
      [id]
    );
    if (!r.rows.length) return null;
    return { ...r.rows[0], permissions: await rolePermissionCodes(db, id) };
  }

  async function validatePermissionCodes(codes) {
    if (codes.length === 0) return;
    const r = await db.query("SELECT code FROM permission WHERE code = ANY($1::text[])", [codes]);
    const known = new Set(r.rows.map((row) => row.code));
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) {
      const err = new Error(RbacError.UNKNOWN_PERMISSION);
      err.code = RbacError.UNKNOWN_PERMISSION;
      err.detail = unknown;
      throw err;
    }
  }

  /**
   * Creates a role and, in the same transaction, its initial permission
   * set -- a role with permissions decided later by a second call is a role
   * that briefly grants nothing, which is safe, but there is no reason to
   * make callers do it in two steps when the common case is "create this
   * role with these permissions".
   */
  async function createRole({ id, name, description = "", permissionCodes = [], createdBy }) {
    await validatePermissionCodes(permissionCodes);
    return db.transaction(async (tx) => {
      let role;
      try {
        role = (await tx.query(
          `INSERT INTO role (id, name, description, created_by) VALUES ($1,$2,$3,$4)
           RETURNING id, name, description, is_system, created_by, created_at, updated_at`,
          [id, name, description, createdBy]
        )).rows[0];
      } catch (e) {
        if (/role_name_key|duplicate key.*role/.test(e.message)) {
          const err = new Error(RbacError.DUPLICATE_NAME);
          err.code = RbacError.DUPLICATE_NAME;
          throw err;
        }
        throw e;
      }
      for (const code of permissionCodes) {
        await tx.query("INSERT INTO role_permission (role_id, permission_code) VALUES ($1,$2)", [id, code]);
      }
      return { ...role, permissions: [...permissionCodes].sort() };
    });
  }

  async function requireEditableRole(tx, id) {
    const r = await tx.query("SELECT id, is_system FROM role WHERE id = $1", [id]);
    if (!r.rows.length) {
      const err = new Error(RbacError.ROLE_NOT_FOUND);
      err.code = RbacError.ROLE_NOT_FOUND;
      throw err;
    }
    if (r.rows[0].is_system) {
      const err = new Error(RbacError.SYSTEM_ROLE_IMMUTABLE);
      err.code = RbacError.SYSTEM_ROLE_IMMUTABLE;
      throw err;
    }
  }

  async function updateRole(id, { name, description }) {
    return db.transaction(async (tx) => {
      await requireEditableRole(tx, id);
      const r = await tx.query(
        `UPDATE role SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
         WHERE id = $1
         RETURNING id, name, description, is_system, created_by, created_at, updated_at`,
        [id, name ?? null, description ?? null]
      );
      return { ...r.rows[0], permissions: await rolePermissionCodes(tx, id) };
    });
  }

  /** Replaces a role's entire permission set. Returns the diff for the audit trail. */
  async function setRolePermissions(id, permissionCodes) {
    await validatePermissionCodes(permissionCodes);
    return db.transaction(async (tx) => {
      await requireEditableRole(tx, id);
      const before = new Set((await tx.query(
        "SELECT permission_code FROM role_permission WHERE role_id = $1", [id]
      )).rows.map((r) => r.permission_code));
      const after = new Set(permissionCodes);

      const added = [...after].filter((c) => !before.has(c));
      const removed = [...before].filter((c) => !after.has(c));

      for (const code of added) {
        await tx.query("INSERT INTO role_permission (role_id, permission_code) VALUES ($1,$2)", [id, code]);
      }
      for (const code of removed) {
        await tx.query("DELETE FROM role_permission WHERE role_id = $1 AND permission_code = $2", [id, code]);
      }
      return { before: [...before].sort(), after: [...after].sort(), added: added.sort(), removed: removed.sort() };
    });
  }

  async function deleteRole(id) {
    return db.transaction(async (tx) => {
      await requireEditableRole(tx, id);
      await tx.query("DELETE FROM role WHERE id = $1", [id]);
    });
  }

  async function grantRole({ adminId, roleId, grantedBy }) {
    if (adminId === grantedBy) {
      const err = new Error(RbacError.SELF_GRANT);
      err.code = RbacError.SELF_GRANT;
      throw err;
    }
    const role = await getRole(roleId);
    if (!role) {
      const err = new Error(RbacError.ROLE_NOT_FOUND);
      err.code = RbacError.ROLE_NOT_FOUND;
      throw err;
    }
    await db.query(
      `INSERT INTO admin_custom_role_grant (admin_id, role_id, granted_by)
       VALUES ($1,$2,$3) ON CONFLICT (admin_id, role_id) DO NOTHING`,
      [adminId, roleId, grantedBy]
    );
  }

  async function revokeRole({ adminId, roleId }) {
    await db.query("DELETE FROM admin_custom_role_grant WHERE admin_id = $1 AND role_id = $2", [adminId, roleId]);
  }

  async function rolesFor(adminId) {
    const r = await db.query(
      `SELECT r.id, r.name FROM admin_custom_role_grant g
         JOIN role r ON r.id = g.role_id
        WHERE g.admin_id = $1
        ORDER BY r.name`,
      [adminId]
    );
    return r.rows;
  }

  /** The union of every permission code granted to `adminId` through any custom role. */
  async function effectivePermissions(adminId) {
    const r = await db.query(
      `SELECT DISTINCT rp.permission_code FROM admin_custom_role_grant g
         JOIN role_permission rp ON rp.role_id = g.role_id
        WHERE g.admin_id = $1
        ORDER BY rp.permission_code`,
      [adminId]
    );
    return r.rows.map((row) => row.permission_code);
  }

  return {
    listPermissions, listRoles, getRole, createRole, updateRole,
    setRolePermissions, deleteRole, grantRole, revokeRole, rolesFor, effectivePermissions,
  };
}
