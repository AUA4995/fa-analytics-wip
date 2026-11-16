"use client";

import { useActionState, useState, useTransition } from "react";
import { Pill } from "@/components/ui/pill";
import { BackupCodes, CopyBox } from "@/components/auth/fields";
import {
  addUser,
  changeMyPassword,
  decideAccessRequest,
  forgetMyDevice,
  newBackupCodes,
  resendInvite,
  resetUserPassword,
  resetUserTwoFactor,
  saveAccessDomain,
  setUserActive,
  setUserRole,
  transferPrimaryOwner,
  type UserActionState,
} from "./user-actions";

export type Role = "OWNER" | "ADMIN" | "USER";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** OWNER only: true = extra owner, false = the primary owner */
  extraOwner: boolean;
  active: boolean;
  lastLoginAt: string | null;
  /** Invited, hasn't set a password yet */
  invited: boolean;
  twoFactor: boolean;
}

const input =
  "w-full rounded border border-border bg-card px-3 py-2 text-sm text-fa-charcoal outline-none focus:border-fa-blue focus:ring-2 focus:ring-fa-blue-light";

export function fmtDateTime(iso: string | null, tz: string): string {
  if (!iso) return "never";
  return new Date(iso)
    .toLocaleString("en-AU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .replace(",", "");
}

function Message({ m }: { m: UserActionState | null }) {
  if (!m?.message) return null;
  return (
    <div className={m.ok && !m.link ? "callout" : "callout amber"} role="status">
      <div>{m.message}</div>
      {m.link && (
        <div style={{ marginTop: 8 }} className="space-y-2">
          <div className="warnbox">{m.linkNote}</div>
          <CopyBox text={m.link} label="Copy link" />
        </div>
      )}
      {m.codes && (
        <div style={{ marginTop: 8 }}>
          <BackupCodes codes={m.codes} />
        </div>
      )}
    </div>
  );
}

const rank = (u: { role: Role; extraOwner?: boolean }) => (u.role === "OWNER" ? (u.extraOwner ? 3 : 4) : u.role === "ADMIN" ? 2 : 1);
const LABEL = (u: { role: Role; extraOwner?: boolean }) => (u.role === "OWNER" ? (u.extraOwner ? "Owner" : "Primary owner") : u.role === "ADMIN" ? "Admin" : "User");

/**
 * Settings → Company & users → Users (Batch 2 items 1, 2, 32; four roles batch 3). The server enforces every rule;
 * this only hides what you can't do: each level manages only the levels below it.
 */
export function UsersCard({ users, me, ownerName, tz }: { users: UserRow[]; me: { id: string; role: Role; primary: boolean }; ownerName: string; tz: string }) {
  const [state, action, pending] = useActionState(addUser, { ok: false, message: "" } as UserActionState);
  const [msg, setMsg] = useState<UserActionState | null>(null);
  const [busy, start] = useTransition();
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const isOwner = me.role === "OWNER";
  const myRank = rank({ role: me.role, extraOwner: !me.primary });
  const shown = msg ?? (state.message ? state : null);
  const act = (fn: () => Promise<UserActionState>) => start(async () => setMsg(await fn()));
  /** Strictly below me: users < admins < owners < primary owner. Nobody manages the primary owner. */
  const canManage = (u: UserRow) => rank(u) < myRank && rank(u) < 4;
  /** Roles I may give: owners give admin/user; the primary owner also gives owner. */
  const canSetRole = (u: UserRow) => isOwner && canManage(u);

  return (
    <div className="space-y-4 text-sm">
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const mine = u.id === me.id;
              return (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <strong>{u.name}</strong>
                    {mine && <span className="meta"> (you)</span>}
                    <div className="meta">{u.email}</div>
                  </td>
                  <td>
                    {u.role === "OWNER" && !u.extraOwner ? (
                      <Pill tone="blue">Primary owner</Pill>
                    ) : canSetRole(u) && !mine ? (
                      <select
                        value={u.role}
                        disabled={busy}
                        aria-label={`Role for ${u.name}`}
                        onChange={(e) => act(() => setUserRole(u.id, e.target.value as "OWNER" | "ADMIN" | "USER"))}
                      >
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                        {me.primary && <option value="OWNER">Owner</option>}
                      </select>
                    ) : u.role === "OWNER" ? (
                      <Pill tone="blue">Owner</Pill>
                    ) : (
                      <span>{LABEL(u)}</span>
                    )}
                    {mine && <div className="meta">You can&apos;t change your own role</div>}
                  </td>
                  <td>
                    {!u.active ? (
                      <Pill tone="grey">Deactivated</Pill>
                    ) : u.invited ? (
                      <Pill tone="amber">Invited</Pill>
                    ) : (
                      <Pill tone="green">Active</Pill>
                    )}
                    <div className="meta">{u.twoFactor ? "Two-step sign-in on" : "Two-step sign-in not set up yet"}</div>
                  </td>
                  <td className="meta">{fmtDateTime(u.lastLoginAt, tz)}</td>
                  <td>
                    <div className="actions">
                      {canManage(u) && u.active && u.invited && (
                        <button className="lnk" disabled={busy} onClick={() => act(() => resendInvite(u.id))}>
                          Send invite again
                        </button>
                      )}
                      {canManage(u) && u.active && !u.invited && !mine && (
                        <button
                          className="lnk"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Email ${u.name} a link to set a new password? Their current password keeps working until they do.`)) act(() => resetUserPassword(u.id));
                          }}
                        >
                          Reset password
                        </button>
                      )}
                      {isOwner && !mine && canManage(u) && u.twoFactor && (
                        <button
                          className="lnk"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Reset ${u.name}'s two-step sign-in? They'll be signed out and set it up again next time.`)) act(() => resetUserTwoFactor(u.id));
                          }}
                        >
                          Reset 2FA
                        </button>
                      )}
                      {me.primary && !mine && (u.role === "ADMIN" || u.role === "OWNER") && u.active && u.twoFactor && (
                        <button className="lnk" disabled={busy} onClick={() => setTransferTo(transferTo === u.id ? null : u.id)}>
                          Make primary owner
                        </button>
                      )}
                      {canManage(u) && !mine && (
                        <button className="lnk" disabled={busy} onClick={() => act(() => setUserActive(u.id, !u.active))}>
                          {u.active ? "Deactivate" : "Re-activate"}
                        </button>
                      )}
                    </div>
                    {transferTo === u.id && <TransferOwnership user={u} onDone={(m) => (setMsg(m), m.ok && setTransferTo(null))} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Message m={shown} />

      <form action={action} onSubmit={() => setMsg(null)} className="grid gap-2 rounded border border-border p-3 sm:grid-cols-[1fr_1.4fr_auto_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-fa-grey-dark">Name</span>
          <input name="name" required className={input} placeholder="David" defaultValue={state.values?.name} key={`n-${state.values?.name ?? ""}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-fa-grey-dark">Email</span>
          <input name="email" type="email" required className={input} placeholder="david@…" defaultValue={state.values?.email} key={`e-${state.values?.email ?? ""}`} />
        </label>
        {isOwner ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fa-grey-dark">Role</span>
            <select name="role" defaultValue={state.values?.role ?? "USER"} key={`r-${state.values?.role ?? ""}`} className={input}>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
        ) : (
          <input type="hidden" name="role" value="USER" />
        )}
        <button type="submit" disabled={pending} className="btn primary" style={{ justifyContent: "center", padding: "8px 14px" }}>
          {pending ? "Adding…" : "Add user"}
        </button>
      </form>
      <p className="meta" style={{ margin: 0 }}>
        Adding someone emails them a link to set their password (valid 7 days); then they set up two-step sign-in. Users can work every screen. Admins
        can also add users and change settings.{" "}
        Four levels: primary owner &gt; owners &gt; admins &gt; users — each manages only the levels below.{" "}
        {me.primary
          ? "You (primary owner) also make or remove owners and can hand over primary owner."
          : isOwner
            ? `Owners add or remove admins, connect Xero, Front and AI, and reset two-step sign-in. Only ${ownerName} (primary owner) makes or removes owners.`
            : `Only an owner can add admins, connect Xero, Front and AI, and reset two-step sign-in (primary owner: ${ownerName}).`}
      </p>
    </div>
  );
}

function TransferOwnership({ user, onDone }: { user: UserRow; onDone: (m: UserActionState) => void }) {
  const [state, action, pending] = useActionState(async (p: UserActionState, fd: FormData) => {
    const r = await transferPrimaryOwner(p, fd);
    onDone(r);
    return r;
  }, { ok: false, message: "" } as UserActionState);
  return (
    <form action={action} className="mt-2 grid gap-2 rounded border border-border p-2" style={{ maxWidth: 300 }}>
      <input type="hidden" name="userId" value={user.id} />
      <span className="meta">
        Make {user.name} the primary owner? Enter your 6-digit code to confirm.
      </span>
      <label className="meta">
        Afterwards I&apos;m{" "}
        <select name="then" defaultValue="OWNER">
          <option value="OWNER">an owner</option>
          <option value="ADMIN">an admin</option>
        </select>
      </label>
      <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required maxLength={7} />
      <button className="btn danger" disabled={pending}>
        {pending ? "Checking…" : `Make ${user.name.split(" ")[0]} the primary owner`}
      </button>
      {!state.ok && state.message && <span className="msg-err">{state.message}</span>}
    </form>
  );
}

export interface AccessRequestRow {
  id: string;
  name: string;
  email: string;
  reason: string;
  createdAt: string;
}

/** Pending access requests (Batch 2 item 31) — the owner approves or declines here or from the email. */
export function AccessRequestsList({ requests, isOwner, ownerName, tz }: { requests: AccessRequestRow[]; isOwner: boolean; ownerName: string; tz: string }) {
  const [msg, setMsg] = useState<UserActionState | null>(null);
  const [roles, setRoles] = useState<Record<string, "USER" | "ADMIN">>({});
  const [busy, start] = useTransition();
  if (!requests.length && !msg) return <p className="empty" style={{ margin: 0 }}>No pending access requests.</p>;
  return (
    <div className="space-y-3 text-sm">
      {requests.length > 0 && (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Who</th>
                <th>Reason</th>
                <th>Asked</th>
                <th>{isOwner ? "Decide" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="meta">{r.email}</div>
                  </td>
                  <td>{r.reason}</td>
                  <td className="meta">{fmtDateTime(r.createdAt, tz).split(" ")[0]}</td>
                  <td>
                    {isOwner ? (
                      <div className="row">
                        <select value={roles[r.id] ?? "USER"} onChange={(e) => setRoles({ ...roles, [r.id]: e.target.value as "USER" | "ADMIN" })} aria-label={`Role for ${r.name}`}>
                          <option value="USER">User</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button className="btn primary" disabled={busy} onClick={() => start(async () => setMsg(await decideAccessRequest(r.id, "approve", roles[r.id] ?? "USER")))}>
                          Approve
                        </button>
                        <button className="btn danger" disabled={busy} onClick={() => start(async () => setMsg(await decideAccessRequest(r.id, "decline")))}>
                          Decline
                        </button>
                      </div>
                    ) : (
                      <span className="meta">Only an owner can approve (primary owner: {ownerName})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Message m={msg} />
    </div>
  );
}

/** Settings → Company: which email domain may use Request access. */
export function AccessDomainForm({ domain }: { domain: string }) {
  const [value, setValue] = useState(domain);
  const [state, action, pending] = useActionState(saveAccessDomain, { ok: false, message: "" } as UserActionState);
  return (
    <form action={action} className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
      <label className="block text-sm" style={{ flex: "1 1 260px" }}>
        <span className="mb-1 block font-medium text-fa-grey-dark">Request access: email domain</span>
        <input name="domain" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
        <span className="mt-1 block text-xs text-muted">Only emails ending @{value || "…"} can ask for access on the sign-in page.</span>
      </label>
      <button className="btn" disabled={pending || value.trim() === domain}>
        {pending ? "Saving…" : "Save domain"}
      </button>
      {state.message && <span className={state.ok ? "msg-ok" : "msg-err"}>{state.message}</span>}
    </form>
  );
}

/** Settings → Account (everyone): password, two-step sign-in, backup codes, this device. */
export function MyAccount({ twoFactor }: { twoFactor: { enabledAt: string | null; backupLeft: number; tz: string } }) {
  return (
    <div className="space-y-4 text-sm">
      <ChangePassword />
      <TwoFactorBox {...twoFactor} />
    </div>
  );
}

function TwoFactorBox({ enabledAt, backupLeft, tz }: { enabledAt: string | null; backupLeft: number; tz: string }) {
  const [state, action, pending] = useActionState(newBackupCodes, { ok: false, message: "" } as UserActionState);
  const [msg, setMsg] = useState<UserActionState | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="rounded border border-border p-3">
      <div className="mb-1 font-medium">Two-step sign-in</div>
      <p className="meta" style={{ margin: "0 0 8px" }}>
        {enabledAt
          ? `On since ${fmtDateTime(enabledAt, tz).split(" ")[0]} · ${backupLeft} of 10 backup codes left${backupLeft <= 3 ? " — make a new set soon" : ""}.`
          : "Not set up yet — you'll be asked at your next sign-in."}
      </p>
      {enabledAt && (
        <form action={action} className="row">
          <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" required maxLength={7} style={{ width: 130 }} aria-label="Current 6-digit code" />
          <button className="btn" disabled={pending}>
            {pending ? "Checking…" : "Make new backup codes"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => start(async () => setMsg(await forgetMyDevice()))}>
            Ask for a code on this device again
          </button>
        </form>
      )}
      <div style={{ marginTop: 8 }}>
        <Message m={msg ?? (state.message ? state : null)} />
      </div>
    </div>
  );
}

function ChangePassword() {
  const [state, action, pending] = useActionState(changeMyPassword, { ok: false, message: "" } as UserActionState);
  return (
    <form action={action} className="rounded border border-border p-3">
      <div className="mb-2 font-medium">My password</div>
      <div className="grid gap-2">
        <input name="current" type="password" autoComplete="current-password" placeholder="Current password" required className={input} />
        <input name="next" type="password" autoComplete="new-password" placeholder="New password (10+)" minLength={10} required className={input} />
        <input name="confirm" type="password" autoComplete="new-password" placeholder="Confirm new password" minLength={10} required className={input} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn primary">
          {pending ? "Saving…" : "Change password"}
        </button>
        {state.message && <span className={state.ok ? "msg-ok" : "msg-err"}>{state.message}</span>}
      </div>
    </form>
  );
}
