import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

function EDDispositionTracker() {
  const [view, setView] = useState("overview");
  const [records, setRecords] = useState([]);

  const [dateOfBedAllocation, setDateOfBedAllocation] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [shift, setShift] = useState("MORNING");
  const [patientId, setPatientId] = useState("");
  const [edUnit, setEdUnit] = useState("CCA");
  const [admittingUnit, setAdmittingUnit] = useState("T1A5");
  const [dispositionMinutes, setDispositionMinutes] = useState("");
  const [bedAllocationWhatsapp, setBedAllocationWhatsapp] = useState("");
  const [bedAllocationWatheeq, setBedAllocationWatheeq] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [isExcluded, setIsExcluded] = useState(false);
  const [exclusionReason, setExclusionReason] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "records"), (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setRecords(items);
    });

    return () => unsubscribe();
  }, []);

  const dispositionHms = useMemo(() => {
    const mins = Number(dispositionMinutes || 0);
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    return `${hh}:${mm}:00`;
  }, [dispositionMinutes]);

  const whatsappDelayMinutes = useMemo(() => {
    if (!bedAllocationWhatsapp || !bedAllocationWatheeq) return 0;

    const [h1, m1] = bedAllocationWhatsapp.split(":").map(Number);
    const [h2, m2] = bedAllocationWatheeq.split(":").map(Number);

    const t1 = h1 * 60 + m1;
    const t2 = h2 * 60 + m2;

    return Math.max(0, t1 - t2);
  }, [bedAllocationWhatsapp, bedAllocationWatheeq]);

  const delayCategory = useMemo(() => {
    const mins = Number(dispositionMinutes || 0);
    if (mins <= 30) return "NO DELAY";
    if (mins <= 60) return "31-60 MIN";
    return ">60 MIN";
  }, [dispositionMinutes]);

  const within30Min = useMemo(
    () => Number(dispositionMinutes || 0) <= 30,
    [dispositionMinutes]
  );

  const monthAuto = useMemo(() => {
    if (!dateOfBedAllocation) return "";
    const d = new Date(dateOfBedAllocation);
    return d.toLocaleString("en-US", { month: "long" }).toUpperCase();
  }, [dateOfBedAllocation]);

  const getRecordMinutes = (record) => {
    if (
      record.dispositionMinutes !== undefined &&
      record.dispositionMinutes !== null &&
      record.dispositionMinutes !== ""
    ) {
      const mins = Number(record.dispositionMinutes);
      return Number.isFinite(mins) ? mins : null;
    }

    if (record.admittedAt && record.transferredAt) {
      const start = new Date(record.admittedAt);
      const end = new Date(record.transferredAt);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diff = (end - start) / 60000;
        if (Number.isFinite(diff) && diff >= 0 && diff < 10000) {
          return diff;
        }
      }
    }

    return null;
  };

  const validMinuteRecords = records
    .map((r) => ({ ...r, _minutes: getRecordMinutes(r) }))
    .filter((r) => r._minutes !== null);

  const totalAdmissions = records.length;
  const within30 = validMinuteRecords.filter((r) => r._minutes <= 30).length;
  const delayedOver30 = validMinuteRecords.filter((r) => r._minutes > 30).length;
  const over60 = validMinuteRecords.filter((r) => r._minutes > 60).length;

  const excludedCases = records.filter(
    (r) => r.isExcluded === true || r.excludedCase === "Yes"
  ).length;

  const avgTransfer =
    validMinuteRecords.length > 0
      ? Math.round(
          validMinuteRecords.reduce((sum, r) => sum + r._minutes, 0) /
            validMinuteRecords.length
        )
      : 0;

  const cards = [
    { title: "Total Admissions", value: totalAdmissions },
    { title: "Within 30 Min", value: within30 },
    { title: "Delayed (>30 Min)", value: delayedOver30 },
    { title: "Avg Transfer Time", value: `${avgTransfer}m` },
    { title: ">60 Min Cases", value: over60 },
    { title: "Excluded Cases", value: excludedCases },
  ];

  const handleSave = async () => {
    try {
      await addDoc(collection(db, "records"), {
        dateOfBedAllocation,
        shift,
        patientId,
        edUnit,
        admittingUnit,
        dispositionMinutes: Number(dispositionMinutes || 0),
        bedAllocationWhatsapp,
        bedAllocationWatheeq,
        arrivalTime,
        dispositionHms,
        whatsappDelayMinutes,
        delayCategory,
        isExcluded,
        exclusionReason,
        within30Min,
        month: monthAuto,
        createdAt: serverTimestamp(),
      });

      alert("Record saved!");

      setPatientId("");
      setDispositionMinutes("");
      setBedAllocationWhatsapp("");
      setBedAllocationWatheeq("");
      setArrivalTime("");
      setIsExcluded(false);
      setExclusionReason("");
      setShift("MORNING");
      setEdUnit("CCA");
      setAdmittingUnit("T1A5");
      setDateOfBedAllocation(new Date().toISOString().split("T")[0]);
      setView("overview");
    } catch (error) {
      console.error(error);
      alert("Error saving record");
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#eef3f8" }}>
      <div
        style={{
          width: 300,
          background: "#14233a",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              padding: 20,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              textAlign: "center",
              fontWeight: "bold",
              fontSize: 24,
            }}
          >
            ED Tracker
          </div>

          <div
            style={{
              padding: "18px 20px 8px",
              color: "#7f93b2",
              fontWeight: "bold",
              fontSize: 14,
            }}
          >
            NAVIGATION
          </div>

          <NavItem active={view === "overview"} onClick={() => setView("overview")}>
            Overview
          </NavItem>
          <NavItem onClick={() => {}}>Unit Performance</NavItem>
          <NavItem onClick={() => {}}>Shift Analysis</NavItem>
          <NavItem active={view === "log"} onClick={() => setView("log")}>
            Disposition Log
          </NavItem>

          <div
            style={{
              padding: "18px 20px 8px",
              color: "#7f93b2",
              fontWeight: "bold",
              fontSize: 14,
            }}
          >
            ACTIONS
          </div>

          <NavItem active={view === "add"} onClick={() => setView("add")}>
            Add Record
          </NavItem>
          <NavItem onClick={() => {}}>Export CSV</NavItem>
        </div>

        <div
          style={{
            padding: 20,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            color: "#7f93b2",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>
            ED DISPOSITION TRACKER
          </div>
          <div>Total: {records.length} records</div>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {view === "overview" && (
          <div style={{ padding: 24 }}>
            <h1 style={{ marginTop: 0, fontSize: 36 }}>ED Disposition Monitor</h1>
            <p>King Saud Medical City</p>

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
              <FilterBox label="Shift" options={["All shifts", "Morning", "Evening", "Night"]} />
              <FilterBox label="ED Unit" options={["All units", "CCA", "CCB", "CCC", "CCD"]} />
              <FilterBox label="Month" options={["All months", "January", "February", "March", "April"]} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(240px, 1fr))",
                gap: 20,
              }}
            >
              {cards.map((card) => (
                <div
                  key={card.title}
                  style={{
                    background: "white",
                    padding: 24,
                    borderRadius: 18,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>{card.title}</h3>
                  <div style={{ fontSize: 52, fontWeight: "bold" }}>{card.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28 }}>
              <button onClick={() => setView("add")} style={primaryBtn}>
                Add Record
              </button>
            </div>
          </div>
        )}

        {view === "log" && (
          <div style={{ padding: 24 }}>
            <h1 style={{ marginTop: 0 }}>Disposition Log</h1>

            {records.length === 0 ? (
              <p>No records yet.</p>
            ) : (
              <div
                style={{
                  background: "white",
                  borderRadius: 16,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  overflowX: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 900,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Shift</th>
                      <th style={thStyle}>Patient ID</th>
                      <th style={thStyle}>ED Unit</th>
                      <th style={thStyle}>Admitting Unit</th>
                      <th style={thStyle}>Disp Min</th>
                      <th style={thStyle}>Disp H:MM:SS</th>
                      <th style={thStyle}>Delay</th>
                      <th style={thStyle}>&le;30 Min</th>
                      <th style={thStyle}>Excluded</th>
                      <th style={thStyle}>Month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...records]
                      .sort((a, b) => {
                        const da = a.createdAt?.seconds || 0;
                        const dbb = b.createdAt?.seconds || 0;
                        return dbb - da;
                      })
                      .map((record) => {
                        const mins = getRecordMinutes(record);
                        return (
                          <tr key={record.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                            <td style={tdStyle}>
                              {record.dateOfBedAllocation || record.admittedAt || "-"}
                            </td>
                            <td style={tdStyle}>{record.shift || "-"}</td>
                            <td style={tdStyle}>
                              {record.patientId || record.mrn || "-"}
                            </td>
                            <td style={tdStyle}>{record.edUnit || "-"}</td>
                            <td style={tdStyle}>
                              {record.admittingUnit || "-"}
                            </td>
                            <td style={tdStyle}>{mins !== null ? Math.round(mins) : "-"}</td>
                            <td style={tdStyle}>
                              {record.dispositionHms || "-"}
                            </td>
                            <td style={tdStyle}>
                              {record.delayCategory || "-"}
                            </td>
                            <td style={tdStyle}>
                              {mins !== null ? (mins <= 30 ? "YES" : "NO") : "-"}
                            </td>
                            <td style={tdStyle}>
                              {record.isExcluded === true || record.excludedCase === "Yes"
                                ? "YES"
                                : "NO"}
                            </td>
                            <td style={tdStyle}>{record.month || "-"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === "add" && (
          <div>
            <div
              style={{
                background: "white",
                borderBottom: "1px solid #dbe4ee",
                padding: "16px 28px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Add Record</div>
                <div style={{ color: "#64748b", marginTop: 4 }}>
                  Enter a new ED disposition record
                </div>
              </div>

              <button onClick={handleSave} style={primaryBtn}>
                + Save Record
              </button>
            </div>

            <div style={{ padding: 28 }}>
              <div
                style={{
                  background: "white",
                  borderRadius: 18,
                  padding: 28,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(280px, 1fr))",
                    gap: 20,
                  }}
                >
                  <Field label="DATE OF BED ALLOCATION *">
                    <input
                      type="date"
                      value={dateOfBedAllocation}
                      onChange={(e) => setDateOfBedAllocation(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="SHIFT *">
                    <select
                      value={shift}
                      onChange={(e) => setShift(e.target.value)}
                      style={inputStyle}
                    >
                      <option>MORNING</option>
                      <option>EVENING</option>
                      <option>NIGHT</option>
                    </select>
                  </Field>

                  <Field label="PATIENT ID *">
                    <input
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      placeholder="e.g. 110000356396"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="ED UNIT *">
                    <select
                      value={edUnit}
                      onChange={(e) => setEdUnit(e.target.value)}
                      style={inputStyle}
                    >
                      <option>CCA</option>
                      <option>CCB</option>
                      <option>CCC</option>
                      <option>CCD</option>
                    </select>
                  </Field>

                  <Field label="ADMITTING UNIT *">
                    <select
                      value={admittingUnit}
                      onChange={(e) => setAdmittingUnit(e.target.value)}
                      style={inputStyle}
                    >
                      <option>T1A5</option>
                      <option>T1A1</option>
                      <option>T1B1</option>
                      <option>T1A6</option>
                      <option>300G</option>
                      <option>300B</option>
                      <option>300D</option>
                      <option>200A</option>
                      <option>ONCO</option>
                    </select>
                  </Field>

                  <Field label="DISPOSITION TIME (MINUTES) *">
                    <input
                      type="number"
                      value={dispositionMinutes}
                      onChange={(e) => setDispositionMinutes(e.target.value)}
                      placeholder="e.g. 25"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="BED ALLOCATION TIME (WHATSAPP)">
                    <input
                      type="time"
                      value={bedAllocationWhatsapp}
                      onChange={(e) => setBedAllocationWhatsapp(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="BED ALLOCATION TIME (WATHEEQ)">
                    <input
                      type="time"
                      value={bedAllocationWatheeq}
                      onChange={(e) => setBedAllocationWatheeq(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="PATIENT ARRIVAL TIME TO UNIT">
                    <input
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="DISPOSITION TIME (H:MM:SS)">
                    <input type="text" value={dispositionHms} readOnly style={inputStyleReadOnly} />
                  </Field>

                  <Field label="WHATSAPP DELAY (MINUTES)">
                    <input type="text" value={whatsappDelayMinutes} readOnly style={inputStyleReadOnly} />
                  </Field>

                  <Field label="DELAY CATEGORY (AUTO)">
                    <input type="text" value={delayCategory} readOnly style={inputStyleReadOnly} />
                  </Field>
                </div>

                <div
                  style={{
                    marginTop: 22,
                    padding: 22,
                    border: "1px solid #f5c38b",
                    background: "#fff7ed",
                    borderRadius: 16,
                  }}
                >
                  <div style={{ color: "#ea580c", fontWeight: 800, marginBottom: 12 }}>
                    ✏️ Exclusion Status
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.1fr 1fr",
                      gap: 20,
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <div style={labelStyle}>MARK AS EXCLUDED?</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => setIsExcluded(false)}
                          style={{
                            ...toggleBtn,
                            background: !isExcluded ? "#16a34a" : "#f8fafc",
                            color: !isExcluded ? "white" : "#64748b",
                            border: !isExcluded ? "none" : "1px solid #cbd5e1",
                          }}
                        >
                          ✓ Active
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsExcluded(true)}
                          style={{
                            ...toggleBtn,
                            background: isExcluded ? "#ef4444" : "#f8fafc",
                            color: isExcluded ? "white" : "#64748b",
                            border: isExcluded ? "none" : "1px solid #cbd5e1",
                          }}
                        >
                          ✏️ Excluded
                        </button>
                      </div>
                    </div>

                    <Field label="COMMENTS / EXCLUSION REASON">
                      <input
                        type="text"
                        value={exclusionReason}
                        onChange={(e) => setExclusionReason(e.target.value)}
                        placeholder="Optional notes"
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 22,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 20,
                  }}
                >
                  <div
                    style={{
                      background: "#ecfdf3",
                      border: "1px solid #b7e4c7",
                      borderRadius: 16,
                      padding: 22,
                    }}
                  >
                    <div style={{ color: "#16a34a", fontWeight: 800, marginBottom: 8 }}>
                      &lt;30 MINUTES? (AUTO)
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#16a34a" }}>
                      {within30Min ? "✓ YES" : "NO"}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#eef4ff",
                      border: "1px solid #c7d2fe",
                      borderRadius: 16,
                      padding: 22,
                    }}
                  >
                    <div style={{ color: "#4f46e5", fontWeight: 800, marginBottom: 8 }}>
                      MONTH (AUTO FROM DATE)
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#2563eb" }}>
                      {monthAuto}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
                  <button onClick={handleSave} style={primaryBtn}>
                    Save Record
                  </button>
                  <button
                    onClick={() => setView("overview")}
                    style={{
                      background: "#e5e7eb",
                      color: "#111827",
                      border: "none",
                      borderRadius: 10,
                      padding: "12px 18px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NavItem({ children, active = false, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "16px 24px",
        cursor: "pointer",
        background: active ? "#2b4367" : "transparent",
        color: active ? "white" : "#c2d1e8",
        fontSize: 18,
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

function FilterBox({ label, options }) {
  return (
    <div>
      <div style={{ fontWeight: "bold", marginBottom: 8 }}>{label}</div>
      <select style={{ ...inputStyle, minWidth: 220 }}>
        {options.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    </div>
  );
}

const labelStyle = {
  marginBottom: 8,
  fontWeight: 700,
  color: "#64748b",
  fontSize: 14,
};

const inputStyle = {
  width: "100%",
  height: 48,
  borderRadius: 10,
  border: "1px solid #d7e0ea",
  padding: "0 16px",
  fontSize: 16,
  boxSizing: "border-box",
  background: "white",
};

const inputStyleReadOnly = {
  ...inputStyle,
  background: "#f8fafc",
  color: "#374151",
};

const toggleBtn = {
  flex: 1,
  height: 48,
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
};

const primaryBtn = {
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 10,
  padding: "12px 18px",
  fontWeight: 700,
  cursor: "pointer",
};

const thStyle = {
  padding: "14px 16px",
  fontSize: 14,
  color: "#64748b",
  fontWeight: 700,
};

const tdStyle = {
  padding: "14px 16px",
  fontSize: 14,
  color: "#111827",
};

export default EDDispositionTracker;