import { ENTITY_FIELDS } from "@/lib/model/specs";
import { EditableValue } from "./editable";

/** All editable values of one record as label → value + Logs (server component; values edited in place). */
export function FieldList({ entity, id, row, fields, counts, canEdit }: { entity: string; id: string; row: Record<string, unknown>; fields?: string[]; counts: Record<string, number>; canEdit: boolean }) {
  const specs = ENTITY_FIELDS[entity];
  const keys = fields ?? Object.keys(specs);
  return (
    <dl className="fl">
      {keys.map((f) => (
        <FieldRow key={f} label={specs[f].label} hint={specs[f].hint}>
          <EditableValue entity={entity} id={id} field={f} spec={specs[f]} value={plain(row[f])} logCount={counts[`${id}|${f}`] ?? 0} canEdit={canEdit} />
        </FieldRow>
      ))}
    </dl>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <>
      <dt>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </dt>
      <dd>{children}</dd>
    </>
  );
}

/** Decimal / Date → plain JSON for client components. */
export function plain(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === "object" && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") return (v as { toNumber: () => number }).toNumber();
  return v;
}
