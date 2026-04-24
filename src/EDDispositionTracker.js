import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const UNIT_OPTIONS = ["CCA", "CCB", "CCC", "CCD", "Triage/Pulmo"];
const SHIFT_OPTIONS = ["MORNING", "EVENING", "NIGHT"];
const MONTH_OPTIONS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function EDDispositionTracker() {
  const [view, setView] = useState("overview");
  const [records, setRecords] = useState([]);

  const [selectedShift, setSelectedShift] = useState("All shifts");
  const [selectedUnit, setSelectedUnit] = useState("All units");
  const [selectedMonth, setSelectedMonth] = useState("All months");

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

  const normalizedRecords = useMemo(() => {
    return records.map((r) => {
      const mins = getRecordMinutes(r);
      const normalizedMonth =
        r.month ||
        (r.dateOfBedAllocation
          ? new Date(r.dateOfBedAllocation)
              .toLocaleString("en-US", { month: "long" })
              .toUpperCase()
          : "");

      return {
        ...r,
        _minutes: mins,
        _month: normalizedMonth,
        _shift: (r.shift || "").toUpperCase(),
        _unit: r.edUnit || "",
        _excluded: r.isExcluded === true || r.excludedCase === "Yes",
        _within30:
          r.within30Min === true || (mins !== null ? mins <= 30 : false),
      };
    });
  }, [records]);

  const filteredRecords = useMemo(() => {
    return normalizedRecords.filter((r) => {
      const shiftOk =
        selectedShift === "All shifts" ||
        r._shift === selectedShift.toUpperCase();

      const unitOk = selectedUnit === "All units" || r._unit === selectedUnit;

      const monthOk =
        selectedMonth === "All months" ||
        r._month === selectedMonth.toUpperCase();

      return shiftOk && unitOk && monthOk;
    });
  }, [normalizedRecords, selectedShift, selectedUnit, selectedMonth]);

  const validMinuteRecords = useMemo(
    () => filteredRecords.filter((r) => r._minutes !== null),
    [filteredRecords]
  );

  const totalAdmissions = filteredRecords.length;
  const within30 = validMinuteRecords.filter((r) => r._within30).length;
  const delayedOver30 = validMinuteRecords.filter((r) => r._minutes > 30).length;
  const over60 = validMinuteRecords.filter((r) => r._minutes > 60).length;
  const excludedCases = filteredRecords.filter((r) => r._excluded).length;

  const avgTransfer =
    validMinuteRecords.length > 0
      ? Math.round(
          validMinuteRecords.reduce((sum, r) => sum + r._minutes, 0) /
            validMinuteRecords.length
        )
      : 0;

  const medianTransfer = useMemo(() => {
    if (!validMinuteRecords.length) return 0;
    const arr = validMinuteRecords
      .map((r) => r._minutes)
      .sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  }, [validMinuteRecords]);

  const cards = [
    {
      title: "TOTAL ADMISSIONS",
      value: totalAdmissions.toLocaleString(),
      sub: `${excludedCases} excluded`,
      accent: "#3b82f6",
    },
    {
      title: "WITHIN 30 MIN",
      value: within30.toLocaleString(),
      sub:
        totalAdmissions > 0
          ? `${((within30 / totalAdmissions) * 100).toFixed(1)}% compliance`
          : "0.0% compliance",
      accent: "#22c55e",
      subColor: "#ef4444",
    },
    {
      title: "DELAYED (>30 MIN)",
      value: delayedOver30.toLocaleString(),
      sub:
        totalAdmissions > 0
          ? `${((delayedOver30 / totalAdmissions) * 100).toFixed(1)}% of total`
          : "0.0% of total",
      accent: "#ef4444",
      subColor: "#ef4444",
    },
    {
      title: "AVG TRANSFER TIME",
      value: `${avgTransfer}m`,
      sub: `Median ${medianTransfer}m`,
      accent: "#f59e0b",
      subColor: "#f59e0b",
    },
    {
      title: ">60 MIN CASES",
      value: over60.toLocaleString(),
      sub:
        totalAdmissions > 0
          ? `${((over60 / totalAdmissions) * 100).toFixed(1)}%`
          : "0.0%",
      accent: "#ef4444",
      subColor: "#ef4444",
    },
    {
      title: "EXCLUDED CASES",
      value: excludedCases.toLocaleString(),
      sub:
        totalAdmissions > 0
          ? `${((excludedCases / totalAdmissions) * 100).toFixed(1)}% of all records`
          : "0.0% of all records",
      accent: "#1e3a8a",
    },
  ];

  const complianceByUnit = useMemo(() => {
    return UNIT_OPTIONS.map((unit) => {
      const unitRecords = validMinuteRecords.filter((r) => r._unit === unit);
      const within = unitRecords.filter((r) => r._within30).length;
      const delayed = unitRecords.filter((r) => r._minutes > 30).length;
      return { unit, within, delayed };
    });
  }, [validMinuteRecords]);

  const avgByUnit = useMemo(() => {
    return UNIT_OPTIONS.map((unit) => {
      const unitRecords = validMinuteRecords.filter((r) => r._unit === unit);
      const avg =
        unitRecords.length > 0
          ? Math.round(
              unitRecords.reduce((sum, r) => sum + r._minutes, 0) /
                unitRecords.length
            )
          : 0;
      return { unit, avg, count: unitRecords.length };
    });
  }, [validMinuteRecords]);

  const shiftStats = useMemo(() => {
    return SHIFT_OPTIONS.map((s) => {
      const shiftRecords = validMinuteRecords.filter((r) => r._shift === s);
      const total = shiftRecords.length;
      const within = shiftRecords.filter((r) => r._within30).length;
      const delayed = shiftRecords.filter((r) => r._minutes > 30).length;
      const avg =
        total > 0
          ? Math.round(
              shiftRecords.reduce((sum, r) => sum + r._minutes, 0) / total
            )
          : 0;
      return { shift: s, total, within, delayed, avg };
    });
  }, [validMinuteRecords]);

  const handleSave = async () => {
    try {
      const newRecord = {
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
      };

      await addDoc(collection(db, "records"), newRecord);

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
      console.error("Error saving record:", error);
      alert("Error saving record");
    }
  };

  const handleExportCsv = () => {
    if (!filteredRecords.length) {
      alert("No records to export.");
      return;
    }

    const headers = [
      "Date",
      "Shift",
      "Patient ID",
      "ED Unit",
      "Admitting Unit",
      "Disposition Minutes",
      "Disposition H:MM:SS",
      "Delay Category",
      "Within 30 Min",
      "Excluded",
      "Exclusion Reason",
      "Month",
    ];

    const rows = filteredRecords.map((r) => [
      r.dateOfBedAllocation || "",
      r.shift || "",
      r.patientId || "",
      r.edUnit || "",
      r.admittingUnit || "",
      r._minutes ?? "",
      r.dispositionHms || "",
      r.delayCategory || "",
      r._within30 ? "YES" : "NO",
      r._excluded ? "YES" : "NO",
      r.exclusionReason || "",
      r._month || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "ed_disposition_records.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#eef3f8" }}>
      <aside
        style={{
          width: 275,
          background: "#13253f",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              padding: 14,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 4,
                padding: 8,
                minHeight: 56,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: 12 }}>LOGO AREA</span>
            </div>
          </div>

          <div style={sectionLabel}>NAVIGATION</div>
          <NavItem active={view === "overview"} onClick={() => setView("overview")}>
            Overview
          </NavItem>
          <NavItem active={view === "unit"} onClick={() => setView("unit")}>
            Unit Performance
          </NavItem>
          <NavItem active={view === "shift"} onClick={() => setView("shift")}>
            Shift Analysis
          </NavItem>
          <NavItem active={view === "log"} onClick={() => setView("log")}>
            Disposition Log
          </NavItem>

          <div style={sectionLabel}>ACTIONS</div>
          <NavItem active={view === "add"} onClick={() => setView("add")}>
            Add Record
          </NavItem>
          <NavItem onClick={handleExportCsv}>Export CSV</NavItem>
        </div>

        <div
          style={{
            padding: 16,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ color: "#7ea0c8", fontWeight: 700, fontSize: 13 }}>
            ED DISPOSITION TRACKER
          </div>
          <div style={{ color: "#7ea0c8", fontSize: 12, marginTop: 4 }}>
            Total: {filteredRecords.length.toLocaleString()} records
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, background: "#eef3f8" }}>
        <Header
          title="ED Disposition Monitor"
          subtitle={`All months · ${filteredRecords.length.toLocaleString()} dispositions · King Saud Medical City`}
          onAdd={() => setView("add")}
        />

        {view !== "add" && (
          <div style={{ padding: 28, paddingBottom: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr auto",
                gap: 16,
                alignItems: "end",
                marginBottom: 22,
              }}
            >
              <FilterBox
                label="Shift"
                options={["All shifts", ...SHIFT_OPTIONS]}
                value={selectedShift}
                onChange={setSelectedShift}
              />
              <FilterBox
                label="ED Unit"
                options={["All units", ...UNIT_OPTIONS]}
                value={selectedUnit}
                onChange={setSelectedUnit}
              />
              <FilterBox
                label="Month"
                options={["All months", ...MONTH_OPTIONS]}
                value={selectedMonth}
                onChange={setSelectedMonth}
              />
              <div style={{ justifySelf: "end", fontSize: 14, color: "#64748b" }}>
                <span style={{ fontWeight: 800, color: "#0f172a" }}>
                  {filteredRecords.length.toLocaleString()}
                </span>{" "}
                active records
              </div>
            </div>
          </div>
        )}

        {view === "overview" && (
          <div style={{ padding: 28, paddingTop: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(180px, 1fr))",
                gap: 16,
                marginBottom: 16,
              }}
            >
              {cards.slice(0, 5).map((card) => (
                <Card key={card.title} card={card} />
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1fr) 4fr",
                gap: 16,
                marginBottom: 28,
              }}
            >
              <Card card={cards[5]} />
              <div />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: 18,
                marginBottom: 22,
              }}
            >
              <ChartBox
                title="Compliance vs Delayed by ED Unit"
                subtitle="Green = ≤30 min · Red = >30 min"
              >
                <StackedUnitChart data={complianceByUnit} />
                <Legend />
              </ChartBox>

              <ChartBox
                title="Avg Disposition Time per Unit (min)"
                subtitle="30-min target line shown"
              >
                <AvgUnitChart data={avgByUnit} />
              </ChartBox>
            </div>
          </div>
        )}

        {view === "unit" && (
          <div style={{ padding: 28, paddingTop: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(300px, 1fr))",
                gap: 18,
                marginBottom: 22,
              }}
            >
              <ChartBox
                title="Unit Compliance Comparison"
                subtitle="Within 30 min vs delayed cases"
              >
                <StackedUnitChart data={complianceByUnit} />
                <Legend />
              </ChartBox>

              <ChartBox title="Average Time by Unit" subtitle="Lower is better">
                <AvgUnitChart data={avgByUnit} />
              </ChartBox>
            </div>

            <DataTable
              headers={["ED Unit", "Total Cases", "Within 30 Min", "Delayed", "Avg Time (min)"]}
              rows={UNIT_OPTIONS.map((unit) => {
                const unitRecords = validMinuteRecords.filter((r) => r._unit === unit);
                const within = unitRecords.filter((r) => r._within30).length;
                const delayed = unitRecords.filter((r) => r._minutes > 30).length;
                const avg =
                  unitRecords.length > 0
                    ? Math.round(
                        unitRecords.reduce((sum, r) => sum + r._minutes, 0) /
                          unitRecords.length
                      )
                    : 0;

                return [unit, unitRecords.length, within, delayed, `${avg}m`];
              })}
            />
          </div>
        )}

        {view === "shift" && (
          <div style={{ padding: 28, paddingTop: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
                gap: 16,
                marginBottom: 22,
              }}
            >
              {shiftStats.map((item) => (
                <div
                  key={item.shift}
                  style={{
                    background: "white",
                    borderRadius: 16,
                    padding: 20,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#64748b" }}>
                    {item.shift}
                  </div>
                  <div
                    style={{
                      fontSize: 42,
                      fontWeight: 900,
                      color: "#0f172a",
                      marginTop: 8,
                    }}
                  >
                    {item.total}
                  </div>
                  <div style={{ marginTop: 10, color: "#64748b", fontSize: 14 }}>
                    Within 30 min: <strong>{item.within}</strong>
                  </div>
                  <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>
                    Delayed: <strong>{item.delayed}</strong>
                  </div>
                  <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>
                    Avg time: <strong>{item.avg}m</strong>
                  </div>
                </div>
              ))}
            </div>

            <DataTable
              headers={["Shift", "Total Cases", "Within 30 Min", "Delayed", "Avg Time (min)"]}
              rows={shiftStats.map((item) => [
                item.shift,
                item.total,
                item.within,
                item.delayed,
                `${item.avg}m`,
              ])}
            />
          </div>
        )}

        {view === "log" && (
          <div style={{ padding: 28, paddingTop: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>
              Disposition Log
            </div>

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
                  minWidth: 1100,
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    {[
                      "Date",
                      "Shift",
                      "Patient ID",
                      "ED Unit",
                      "Admitting Unit",
                      "Disp Min",
                      "Disp H:MM:SS",
                      "Delay",
                      "≤30 Min",
                      "Excluded",
                      "Month",
                    ].map((header) => (
                      <th key={header} style={thStyle}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...filteredRecords]
                    .sort((a, b) => {
                      const aSec = a.createdAt?.seconds || 0;
                      const bSec = b.createdAt?.seconds || 0;
                      return bSec - aSec;
                    })
                    .map((record) => (
                      <tr key={record.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                        <td style={tdStyle}>{record.dateOfBedAllocation || "-"}</td>
                        <td style={tdStyle}>{record.shift || "-"}</td>
                        <td style={tdStyle}>{record.patientId || "-"}</td>
                        <td style={tdStyle}>{record.edUnit || "-"}</td>
                        <td style={tdStyle}>{record.admittingUnit || "-"}</td>
                        <td style={tdStyle}>
                          {record._minutes !== null ? Math.round(record._minutes) : "-"}
                        </td>
                        <td style={tdStyle}>{record.dispositionHms || "-"}</td>
                        <td style={tdStyle}>{record.delayCategory || "-"}</td>
                        <td style={tdStyle}>{record._within30 ? "YES" : "NO"}</td>
                        <td style={tdStyle}>{record._excluded ? "YES" : "NO"}</td>
                        <td style={tdStyle}>{record._month || "-"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
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
                      {SHIFT_OPTIONS.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
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
                      {UNIT_OPTIONS.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="ADMITTING UNIT *">
                    <select
                      value={admittingUnit}
                      onChange={(e) => setAdmittingUnit(e.target.value)}
                      style={inputStyle}
                    >
                      {["T1A5", "T1A1", "T1B1", "T1A6", "300G", "300B", "300D", "200A", "ONCO"].map(
                        (item) => (
                          <option key={item}>{item}</option>
                        )
                      )}
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
                    <input
                      type="text"
                      value={whatsappDelayMinutes}
                      readOnly
                      style={inputStyleReadOnly}
                    />
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
                    Exclusion Status
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
                          Active
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
                          Excluded
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
                      {within30Min ? "YES" : "NO"}
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
      </main>
    </div>
  );
}

function Header({ title, subtitle, onAdd }) {
  return (
    <div
      style={{
        background: "white",
        borderBottom: "1px solid #dbe4ee",
        padding: "12px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{subtitle}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ color: "#16a34a", fontWeight: 700 }}>● Live</div>
        <button onClick={onAdd} style={primaryBtn}>
          + Add Record
        </button>
      </div>
    </div>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
        <thead>
          <tr style={{ background: "#f8fafc", textAlign: "left" }}>
            {headers.map((header) => (
              <th key={header} style={thStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ borderTop: "1px solid #e5e7eb" }}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={tdStyle}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StackedUnitChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.within + d.delayed), 800);

  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-end",
        height: 250,
        padding: "10px 20px 0",
      }}
    >
      {data.map((item) => {
        const greenHeight = ((item.within || 0) / max) * 180;
        const redHeight = ((item.delayed || 0) / max) * 180;

        return (
          <div key={item.unit} style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                margin: "0 auto",
                width: 72,
                height: 180,
                display: "flex",
                flexDirection: "column-reverse",
                borderRadius: 6,
                overflow: "hidden",
                background: "#f1f5f9",
              }}
            >
              <div style={{ height: greenHeight, background: "#22c55e" }} />
              <div style={{ height: redHeight, background: "#ef4444" }} />
            </div>
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>
              {item.unit}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AvgUnitChart({ data }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "flex-end",
        height: 250,
        padding: "10px 20px 0",
      }}
    >
      {data.map((item, idx) => {
        const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
        return (
          <div key={item.unit} style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                margin: "0 auto",
                width: 76,
                height: Math.max(item.avg * 4, 10),
                maxHeight: 180,
                borderRadius: 6,
                background: colors[idx % colors.length],
              }}
            />
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>
              {item.unit}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NavItem({ children, active = false, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "16px 20px",
        cursor: "pointer",
        background: active ? "#314d78" : "transparent",
        color: active ? "white" : "#d5e0f1",
        fontSize: 17,
        fontWeight: active ? 700 : 500,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function FilterBox({ label, options, value, onChange }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "#475569" }}>{label}</div>
      <select style={filterInputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
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

function Card({ card }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        padding: 20,
        borderTop: `4px solid ${card.accent || "#cbd5e1"}`,
        minHeight: 130,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: "#64748b", letterSpacing: 0.5 }}>
        {card.title}
      </div>
      <div style={{ fontSize: 48, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>
        {card.value}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: card.subColor || "#64748b" }}>
        {card.sub}
      </div>
    </div>
  );
}

function ChartBox({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        padding: 20,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{subtitle}</div>
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

function Legend() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 18,
        marginTop: 14,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 16, height: 12, background: "#ef4444", display: "inline-block" }} />
        <span style={{ color: "#64748b" }}>Delayed</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 16, height: 12, background: "#22c55e", display: "inline-block" }} />
        <span style={{ color: "#64748b" }}>Within 30 min</span>
      </div>
    </div>
  );
}

const sectionLabel = {
  padding: "18px 16px 8px",
  color: "#7087a8",
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: 0.8,
};

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

const filterInputStyle = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #d7e0ea",
  padding: "0 14px",
  fontSize: 16,
  boxSizing: "border-box",
  background: "white",
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
  borderRadius: 12,
  padding: "12px 18px",
  fontWeight: 800,
  fontSize: 14,
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