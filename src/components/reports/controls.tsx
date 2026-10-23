"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  approveReportAction,
  createReportAction,
  deleteReportAction,
  sendNowAction,
  updateReportAction,
  type RepState,
} from "@/app/reports/actions";
import "@/components/model/model.css";

const Msg = ({ s }: { s: RepState | null }) =>
  s ? <span className={s.ok ? "msg-ok" : "msg-err"}>{s.message}</span> : null;

export function ForecastToggle({ id, on }: { id: string; on: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label
      className="row small"
      style={{ display: "inline-flex", gap: 6, cursor: "pointer" }}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) =>
          start(
            async () => (
              await updateReportAction(id, { forecast: e.target.checked }),
              router.refresh()
            ),
          )
        }
      />
      Include forecast
    </label>
  );
}

export function NewReportForm({
  templates,
  clients,
}: {
  templates: Array<[string, string]>;
  clients: Array<[string, string]>;
}) {
  const router = useRouter();
  const [s, action, pending] = useActionState(
    async (p: RepState | null, fd: FormData) => {
      const r = await createReportAction(p, fd);
      if (r.ok && r.id) router.push(`/reports?r=${r.id}`);
      return r;
    },
    null,
  );
  const [cls, setCls] = useState("INTERNAL");
  return (
    <form action={action} className="addform">
      <label>
        Name
        <input
          name="name"
          placeholder="e.g. Client workload · fortnightly"
          style={{ width: 260 }}
        />
      </label>
      <label>
        Template
        <select name="template">
          {templates.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Period
        <select name="period" defaultValue="MONTH">
          <option value="WEEK">Week</option>
          <option value="MONTH">Month</option>
          <option value="QUARTER">Quarter</option>
          <option value="YEAR">Year</option>
        </select>
      </label>
      <label>
        Type
        <select name="cls" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="INTERNAL">Internal</option>
          <option value="CLIENT_SAFE">Client-safe (one client)</option>
        </select>
      </label>
      {cls === "CLIENT_SAFE" && (
        <label>
          Client
          <select name="clientId">
            {clients.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" className="btn primary" disabled={pending}>
        Save report
      </button>
      <Msg s={s} />
    </form>
  );
}

export function SharePanel({
  r,
  allowed,
  isOwner,
}: {
  r: {
    id: string;
    cls: string;
    mode: string;
    schedule: string;
    sendTime: string;
    recipients: string[];
    costing: string;
    approvedAt: string | null;
    approvedBy: string | null;
  };
  allowed: Array<{ email: string; name: string; group: string }>;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [to, setTo] = useState<string[]>(r.recipients);
  const [add, setAdd] = useState("");
  const [v, setV] = useState({
    mode: r.mode,
    schedule: r.schedule,
    sendTime: r.sendTime,
    costing: r.costing,
  });
  const [s, set] = useState<RepState | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<RepState>) =>
    start(async () => {
      set(await fn());
      router.refresh();
    });
  return (
    <div>
      <div className="tsec">
        <div className="tsec-h">
          Recipients · only from Settings → Contacts & recipients
        </div>
        <div className="chips">
          {to.map((e) => (
            <span key={e} className="chip">
              {e}
              <button
                type="button"
                onClick={() => setTo(to.filter((x) => x !== e))}
                aria-label="Remove"
              >
                ×
              </button>
            </span>
          ))}
          {!to.length && <span className="meta">none yet</span>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <select
            value={add}
            onChange={(e) => setAdd(e.target.value)}
            aria-label="Add recipient"
          >
            <option value="">Add recipient…</option>
            {allowed
              .filter((a) => !to.includes(a.email))
              .map((a) => (
                <option key={a.email} value={a.email}>
                  {a.name} — {a.email} ({a.group})
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!add}
            onClick={() => (setTo([...to, add]), setAdd(""))}
          >
            Add
          </button>
          {!allowed.length && (
            <span className="meta">
              No one on the{" "}
              {r.cls === "INTERNAL"
                ? "Internal"
                : r.cls === "CLIENT_SAFE"
                  ? "client's contact"
                  : "Lenders & advisers"}{" "}
              list yet.
            </span>
          )}
        </div>
      </div>
      {r.cls === "INTERNAL" && (
        <div className="tsec">
          <div className="tsec-h">Costing views in the file</div>
          <div className="seg">
            {[
              ["T", "TDABC only"],
              ["F", "Full absorption only"],
              ["B", "Both"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={v.costing === k}
                onClick={() => setV({ ...v, costing: k })}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="meta">
            The view you leave out isn&apos;t in the file at all. (Applies to
            reports with costs.)
          </p>
        </div>
      )}
      <div className="tsec">
        <div className="tsec-h">Schedule</div>
        <div className="addform">
          <label>
            When
            <select
              value={v.schedule}
              onChange={(e) => setV({ ...v, schedule: e.target.value })}
            >
              <option value="OFF">Off</option>
              <option value="WEEKLY">Weekly · Monday</option>
              <option value="MONTHLY">Monthly · 1st business day</option>
              <option value="QUARTERLY">Quarterly · 5th business day</option>
            </select>
          </label>
          <label>
            Time
            <input
              value={v.sendTime}
              onChange={(e) => setV({ ...v, sendTime: e.target.value })}
              style={{ width: 70 }}
            />
          </label>
          <label>
            Mode
            <select
              value={v.mode}
              onChange={(e) => setV({ ...v, mode: e.target.value })}
            >
              <option value="DRY_RUN">Dry run (to me only)</option>
              <option value="DRAFT">Draft in Front for review</option>
              <option value="AUTO">Send automatically</option>
            </select>
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={pending}
            onClick={() =>
              run(() => updateReportAction(r.id, { recipients: to, ...v }))
            }
          >
            Save
          </button>
        </div>
      </div>
      {r.cls === "EXTERNAL" && (
        <div className="tsec">
          <div className="tsec-h">Approval</div>
          {r.approvedAt ? (
            <p className="msg-ok">Approved by {r.approvedBy}</p>
          ) : isOwner ? (
            <button
              type="button"
              className="btn"
              onClick={() => run(() => approveReportAction(r.id))}
            >
              Approve for sending
            </button>
          ) : (
            <p className="meta">
              Waiting for the owner&apos;s approval — sending is locked.
            </p>
          )}
        </div>
      )}
      <div className="tsec">
        <div className="tsec-h">Send once</div>
        <div className="row">
          <a
            className="btn"
            href={`/api/reports/${r.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Preview PDF
          </a>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => run(() => sendNowAction(r.id, "DRY_RUN"))}
          >
            Dry run to me
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending || !r.recipients.length}
            onClick={() => run(() => sendNowAction(r.id, "DRAFT"))}
          >
            Draft in Front
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              pending ||
              !r.recipients.length ||
              (r.cls === "EXTERNAL" && !r.approvedAt)
            }
            onClick={() =>
              confirm(`Send to ${r.recipients.join(", ")} now?`) &&
              run(() => sendNowAction(r.id, "AUTO"))
            }
          >
            {pending ? "Working…" : "Send PDF now"}
          </button>
        </div>
        <Msg s={s} />
      </div>
      <p className="callout small">
        Before every send: recipients re-checked against the lists, and the file
        scanned for costs, margins and other clients&apos; names
        {r.cls === "INTERNAL" ? " (client reports)" : ""}. If anything is found,
        nothing is sent and a task is created.
      </p>
      <button
        type="button"
        className="lnk"
        style={{ color: "var(--red)" }}
        onClick={() =>
          confirm("Delete this report?") &&
          run(
            async () => (
              await deleteReportAction(r.id),
              router.push("/reports"),
              { ok: true, message: "" }
            ),
          )
        }
      >
        Delete report
      </button>
    </div>
  );
}
