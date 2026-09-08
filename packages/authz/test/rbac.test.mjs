/**
 * Custom admin roles and permissions -- the admin-UI-manageable layer
 * described in db/migrations/0015_rbac_foundation.sql and
 * packages/authz/src/rbac.mjs. Most of these tests exist to prove the two
 * things a dynamic permission system can get wrong: that it cannot reach
 * anything the fixed capability grid already governs, and that nobody can
 * use it to escalate their own privileges.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createRbacService, RbacError } from "../src/rbac.mjs";
import { ALL_CAPABILITIES } from "../src/policy.mjs";

let db, rbac;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  rbac = createRbacService(db);
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('root','root@n','Root',TRUE), ('ops1','ops1@n','Ops One',TRUE), ('ops2','ops2@n','Ops Two',TRUE)`
  );
});

after(async () => { await db.close?.(); });

describe("the permission catalog", () => {
  test("is seeded and shaped as {code, category, description}", async () => {
    const perms = await rbac.listPermissions();
    assert.ok(perms.length > 0);
    for (const p of perms) {
      assert.equal(typeof p.code, "string");
      assert.equal(typeof p.category, "string");
      assert.equal(typeof p.description, "string");
    }
  });

  test("no seeded permission code shadows an existing fixed capability", async () => {
    // The whole point of keeping this a separate table: granting a custom
    // permission must never look like it controls something the hardcoded
    // grid (policy.mjs ROLE_CAPABILITIES) actually governs.
    const perms = await rbac.listPermissions();
    const codes = new Set(perms.map((p) => p.code));
    for (const capability of ALL_CAPABILITIES) {
      assert.equal(codes.has(capability), false, `permission table must not shadow capability "${capability}"`);
    }
  });
});

describe("creating and editing a role", () => {
  test("a role can be created with an initial permission set", async () => {
    const role = await rbac.createRole({
      id: "role-support-l1", name: "Support L1", description: "First-line support",
      permissionCodes: ["TICKET_VIEW", "TICKET_REPLY"], createdBy: "root",
    });
    assert.equal(role.name, "Support L1");
    assert.deepEqual(role.permissions, ["TICKET_REPLY", "TICKET_VIEW"]);
    assert.equal(role.is_system, false);
  });

  test("creating a role with an unknown permission code is refused, and nothing is created", async () => {
    await assert.rejects(
      () => rbac.createRole({ id: "role-bad", name: "Bad Role", permissionCodes: ["NOT_A_REAL_PERMISSION"], createdBy: "root" }),
      (e) => e.code === RbacError.UNKNOWN_PERMISSION
    );
    assert.equal(await rbac.getRole("role-bad"), null);
  });

  test("two roles cannot share a name", async () => {
    await rbac.createRole({ id: "role-dupe-a", name: "Duplicate Name", permissionCodes: [], createdBy: "root" });
    await assert.rejects(
      () => rbac.createRole({ id: "role-dupe-b", name: "Duplicate Name", permissionCodes: [], createdBy: "root" }),
      (e) => e.code === RbacError.DUPLICATE_NAME
    );
  });

  test("updating a role's permission set returns the diff for the audit trail", async () => {
    const role = await rbac.createRole({
      id: "role-chat-mod", name: "Chat Moderator", permissionCodes: ["CHAT_MODERATE"], createdBy: "root",
    });
    const diff = await rbac.setRolePermissions(role.id, ["CHAT_MODERATE", "CHAT_MUTE"]);
    assert.deepEqual(diff.added, ["CHAT_MUTE"]);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual((await rbac.getRole(role.id)).permissions, ["CHAT_MODERATE", "CHAT_MUTE"]);

    const diff2 = await rbac.setRolePermissions(role.id, ["CHAT_MUTE"]);
    assert.deepEqual(diff2.added, []);
    assert.deepEqual(diff2.removed, ["CHAT_MODERATE"]);
  });

  test("a role can be renamed and deleted", async () => {
    const role = await rbac.createRole({ id: "role-temp", name: "Temp Role", permissionCodes: [], createdBy: "root" });
    const renamed = await rbac.updateRole(role.id, { name: "Renamed Role" });
    assert.equal(renamed.name, "Renamed Role");
    await rbac.deleteRole(role.id);
    assert.equal(await rbac.getRole(role.id), null);
  });

  test("editing or deleting a role that does not exist is refused", async () => {
    await assert.rejects(() => rbac.updateRole("no-such-role", { name: "x" }), (e) => e.code === RbacError.ROLE_NOT_FOUND);
    await assert.rejects(() => rbac.deleteRole("no-such-role"), (e) => e.code === RbacError.ROLE_NOT_FOUND);
  });
});

describe("system roles are immutable", () => {
  test("a system role cannot be edited, have its permissions changed, or be deleted", async () => {
    await db.query(
      `INSERT INTO role (id, name, description, is_system, created_by) VALUES ('role-system-seed','System Seed','',TRUE,'root')`
    );
    await assert.rejects(() => rbac.updateRole("role-system-seed", { name: "x" }), (e) => e.code === RbacError.SYSTEM_ROLE_IMMUTABLE);
    await assert.rejects(() => rbac.setRolePermissions("role-system-seed", []), (e) => e.code === RbacError.SYSTEM_ROLE_IMMUTABLE);
    await assert.rejects(() => rbac.deleteRole("role-system-seed"), (e) => e.code === RbacError.SYSTEM_ROLE_IMMUTABLE);
  });
});

describe("granting and revoking a custom role", () => {
  test("granting a role to an admin makes its permissions effective for them", async () => {
    const role = await rbac.createRole({
      id: "role-game-ops", name: "Game Ops", permissionCodes: ["GAME_MANAGE", "GAME_PAUSE"], createdBy: "root",
    });
    await rbac.grantRole({ adminId: "ops1", roleId: role.id, grantedBy: "root" });
    assert.deepEqual(await rbac.effectivePermissions("ops1"), ["GAME_MANAGE", "GAME_PAUSE"]);
    assert.deepEqual((await rbac.rolesFor("ops1")).map((r) => r.id), [role.id]);
  });

  test("effective permissions are the union across every granted role, deduplicated", async () => {
    const roleA = await rbac.createRole({ id: "role-a-tix", name: "Ticket Viewer", permissionCodes: ["TICKET_VIEW"], createdBy: "root" });
    const roleB = await rbac.createRole({ id: "role-b-tix", name: "Ticket Replier", permissionCodes: ["TICKET_VIEW", "TICKET_REPLY"], createdBy: "root" });
    await rbac.grantRole({ adminId: "ops2", roleId: roleA.id, grantedBy: "root" });
    await rbac.grantRole({ adminId: "ops2", roleId: roleB.id, grantedBy: "root" });
    assert.deepEqual(await rbac.effectivePermissions("ops2"), ["TICKET_REPLY", "TICKET_VIEW"]);
  });

  test("revoking a role removes exactly its permissions, not another still-held role's", async () => {
    // A dedicated admin, not one of the shared fixture accounts above --
    // those accumulate grants across earlier tests in this file, which
    // would make an exact-equality assertion here order-dependent.
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('ops-revoke','ops-revoke@n','Ops Revoke',TRUE)");
    const roleA = await rbac.createRole({ id: "role-revoke-a", name: "Revoke A", permissionCodes: ["CHAT_MUTE"], createdBy: "root" });
    const roleB = await rbac.createRole({ id: "role-revoke-b", name: "Revoke B", permissionCodes: ["CHAT_DELETE"], createdBy: "root" });
    const admin = "ops-revoke";
    await rbac.grantRole({ adminId: admin, roleId: roleA.id, grantedBy: "root" });
    await rbac.grantRole({ adminId: admin, roleId: roleB.id, grantedBy: "root" });
    await rbac.revokeRole({ adminId: admin, roleId: roleA.id });
    assert.deepEqual(await rbac.effectivePermissions(admin), ["CHAT_DELETE"]);
  });

  test("granting an unknown role is refused", async () => {
    await assert.rejects(
      () => rbac.grantRole({ adminId: "ops1", roleId: "no-such-role", grantedBy: "root" }),
      (e) => e.code === RbacError.ROLE_NOT_FOUND
    );
  });

  test("granting the same role twice is idempotent, not an error and not a duplicate", async () => {
    const role = await rbac.createRole({ id: "role-idem", name: "Idempotent Role", permissionCodes: ["TICKET_CLOSE"], createdBy: "root" });
    await rbac.grantRole({ adminId: "ops1", roleId: role.id, grantedBy: "root" });
    await rbac.grantRole({ adminId: "ops1", roleId: role.id, grantedBy: "root" });
    assert.deepEqual((await rbac.rolesFor("ops1")).filter((r) => r.id === role.id).length, 1);
  });
});

describe("privilege escalation is structurally impossible, not just policy", () => {
  test("an admin cannot grant a role to themselves -- enforced by the database, not just the service", async () => {
    const role = await rbac.createRole({ id: "role-self-grant", name: "Self Grant Attempt", permissionCodes: [], createdBy: "root" });
    await assert.rejects(
      () => rbac.grantRole({ adminId: "ops1", roleId: role.id, grantedBy: "ops1" }),
      (e) => e.code === RbacError.SELF_GRANT
    );
    // Confirm the database's own CHECK constraint would refuse it even if
    // the service-level guard above were ever bypassed or removed.
    await assert.rejects(() =>
      db.query(
        "INSERT INTO admin_custom_role_grant (admin_id, role_id, granted_by) VALUES ($1,$2,$1)",
        ["ops1", role.id]
      )
    );
  });

  test("granting every existing custom role to an admin still never yields a fixed-grid capability", async () => {
    const allCodes = (await rbac.listPermissions()).map((p) => p.code);
    const role = await rbac.createRole({ id: "role-everything", name: "Everything", permissionCodes: allCodes, createdBy: "root" });
    await rbac.grantRole({ adminId: "ops1", roleId: role.id, grantedBy: "root" });
    const effective = new Set(await rbac.effectivePermissions("ops1"));
    for (const capability of ALL_CAPABILITIES) {
      assert.equal(effective.has(capability), false,
        `holding every custom permission must not include the fixed capability "${capability}"`);
    }
  });
});
