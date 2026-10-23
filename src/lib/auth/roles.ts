/** Roles (Batch 2 item 1). OWNER counts as an admin everywhere an admin check is made. */
export type Role = "OWNER" | "ADMIN" | "USER";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "OWNER";
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "OWNER";
}

export function roleLabel(role: string | null | undefined): string {
  return role === "OWNER" ? "Owner" : role === "ADMIN" ? "Admin" : "User";
}
