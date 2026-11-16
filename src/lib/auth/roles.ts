/**
 * Roles — four levels (batch 3, 16/11/2026; same model as the Accounts Hub):
 *   Primary owner (OWNER, extraOwner = false, exactly one) > Owner (OWNER, extraOwner = true) > Admin > User.
 * OWNER counts as an admin everywhere an admin check is made. Every owner passes owner checks; primary-only
 * actions (make/remove owners, manage another owner, transfer primary owner) check isPrimaryOwner.
 * Each level manages only the levels below it; nobody manages the primary owner; the primary owner is only transferred.
 */
export type Role = "OWNER" | "ADMIN" | "USER";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "OWNER";
}

/** Any owner — primary or extra. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "OWNER";
}

export function isPrimaryOwner(u: { role: string; extraOwner?: boolean | null } | null | undefined): boolean {
  return !!u && u.role === "OWNER" && !u.extraOwner;
}

/** Prisma filter for the primary owner (at most one — partial unique index "User_single_primary_owner"). */
export const PRIMARY_OWNER = { role: "OWNER", extraOwner: false } as const;

/** 4 primary owner · 3 owner · 2 admin · 1 user. */
export function roleRank(u: { role: string; extraOwner?: boolean | null }): number {
  if (u.role === "OWNER") return u.extraOwner ? 3 : 4;
  return u.role === "ADMIN" ? 2 : 1;
}

export function roleLabel(role: string | null | undefined, extraOwner?: boolean | null): string {
  if (role === "OWNER") return extraOwner ? "Owner" : "Primary owner";
  return role === "ADMIN" ? "Admin" : "User";
}
