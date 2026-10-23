/**
 * Shown at once while a page streams in (Batch 2 item 12): the menu and top bar are already there, so the frame
 * renders instantly; the page body replaces this when its data is ready.
 */
export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="ph">
        <div style={{ display: "grid", gap: 8, width: "min(420px, 100%)" }}>
          <div className="skel" style={{ height: 28, width: "60%" }} />
          <div className="skel" style={{ height: 14 }} />
        </div>
      </div>
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi">
            <div className="skel" style={{ height: 12, width: "50%" }} />
            <div className="skel" style={{ height: 26, width: "70%", marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skel" style={{ height: 18, width: `${90 - i * 7}%` }} />
        ))}
      </div>
    </div>
  );
}
