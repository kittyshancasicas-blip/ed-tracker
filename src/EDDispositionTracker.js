import React, { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";

import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

const UNIT_OPTIONS = ["CCA", "CCB", "CCC", "CCD", "Triage/Pulmo"];

const ADMITTING_UNIT_OPTIONS = [
  "100D",
  "200A", "200B", "200D", "200G", "200H", "200L", "200OR",
  "300A", "300B", "300D", "300G", "300H", "300L", "300M", "300OR",
  "400A", "400B", "400D", "400G", "400H", "400L",
  "500A", "500B", "500D", "500G", "500H - ENDOSCOPY", "500M",
  "T1A1", "T1A2", "T1A4", "T1A5", "T1A6",
  "T1B1", "T1B2", "T1B4", "T1B5", "T1B6",
  "TRAUMA", "CCU", "CICU",
  "EEG", "CT SCAN", "NUCLEAR MEDICINE", "XRAY",
  "CATH LAB", "INTERVENTIONAL RADIOLOGY (IR)", "VAST",
  "PACU", "HMU",
  "MATERNITY-ER", "MATERNITY OR", "PEDIA-ER", "PEDIA",
  "OR-DIGITAL",
  "ONCOLOGY"
];
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

const UNIT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
const SHIFT_COLORS = {
  MORNING: "#f59e0b",
  EVENING: "#3b82f6",
  NIGHT: "#8b5cf6",
};
const REASON_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0891b2", "#ec4899", "#64748b"];

function EDDispositionTracker({ user }) {
  const ADMIN_EMAILS = ["gh-admin@gmail.com"];
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase());
  const [view, setView] = useState("overview");
  const [records, setRecords] = useState([]);
  const [hoverTip, setHoverTip] = useState(null);

  const [selectedShift, setSelectedShift] = useState("All shifts");
  const [selectedUnit, setSelectedUnit] = useState("All units");
  const [selectedMonth, setSelectedMonth] = useState("All months");
  const [searchText, setSearchText] = useState("");
  const calculateMinutesInterval = (startTime, endTime) => {
  if (!startTime || !endTime) return "";

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  let startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;

  // If arrival time is after midnight
  if (endTotal < startTotal) {
    endTotal += 24 * 60;
  }

  return endTotal - startTotal;
};

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
  useEffect(() => {
  if (bedAllocationWatheeq && arrivalTime) {
    const minutes = calculateMinutesInterval(
      bedAllocationWatheeq,
      arrivalTime
    );
    setDispositionMinutes(minutes);
  }
}, [bedAllocationWatheeq, arrivalTime]);
  const [isExcluded, setIsExcluded] = useState(false);
  const [exclusionReason, setExclusionReason] = useState("");
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "records"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((fireDoc) => ({
          id: fireDoc.id,
          ...fireDoc.data(),
        }));
        setRecords(items);
      },
      (error) => {
        console.error("Error loading records:", error);
      }
    );

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
    return Math.max(0, h1 * 60 + m1 - (h2 * 60 + m2));
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
        if (Number.isFinite(diff) && diff >= 0 && diff < 10000) return diff;
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

      const excluded =
        r.isExcluded === true ||
        r.excluded === true ||
        r.excluded === "YES" ||
        r.excludedCase === "Yes" ||
        r.excludedCase === "YES";

      const reason =
        r.exclusionReason ||
        r.comments ||
        r.excludedReason ||
        r.reason ||
        (excluded ? "Unspecified" : "Active / Not excluded");

      return {
        ...r,
        _minutes: mins,
        _month: String(normalizedMonth || "").toUpperCase(),
        _shift: String(r.shift || "").toUpperCase(),
        _unit: r.edUnit || "",
        _excluded: excluded,
        _exclusionReason: reason,
        _within30: r.within30Min === true || (mins !== null ? mins <= 30 : false),
      };
    });
  }, [records]);

  const filteredRecords = useMemo(() => {
    return normalizedRecords.filter((r) => {
      const shiftOk = selectedShift === "All shifts" || r._shift === selectedShift.toUpperCase();
      const unitOk = selectedUnit === "All units" || r._unit === selectedUnit;
      const monthOk = selectedMonth === "All months" || r._month === selectedMonth.toUpperCase();
      return shiftOk && unitOk && monthOk;
    });
  }, [normalizedRecords, selectedShift, selectedUnit, selectedMonth]);

  const validMinuteRecords = useMemo(
    () => filteredRecords.filter((r) => r._minutes !== null),
    [filteredRecords]
  );
  const admittingUnitStats = useMemo(() => {
  const map = new Map();

  validMinuteRecords.forEach((record) => {
    const unit = record.admittingUnit || "Unspecified";

    if (!map.has(unit)) {
      map.set(unit, { admittingUnit: unit, total: 0, within: 0, delayed: 0 });
    }

    const item = map.get(unit);
    item.total += 1;

    if (record._within30) item.within += 1;
    else item.delayed += 1;
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      compliancePct: item.total ? (item.within / item.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}, [validMinuteRecords]);

  const totalAdmissions = filteredRecords.length;
  const within30 = validMinuteRecords.filter((r) => r._within30).length;
  const delayedOver30 = validMinuteRecords.filter((r) => r._minutes > 30).length;
  const over60 = validMinuteRecords.filter((r) => r._minutes > 60).length;
  const excludedCases = filteredRecords.filter((r) => r._excluded).length;
  const activeCases = filteredRecords.length - excludedCases;

  const avgTransfer =
    validMinuteRecords.length > 0
      ? Math.round(validMinuteRecords.reduce((sum, r) => sum + r._minutes, 0) / validMinuteRecords.length)
      : 0;

  const medianTransfer = useMemo(() => {
    if (!validMinuteRecords.length) return 0;
    const arr = validMinuteRecords.map((r) => r._minutes).sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? Math.round(arr[mid]) : Math.round((arr[mid - 1] + arr[mid]) / 2);
  }, [validMinuteRecords]);

  const cards = [
    {
      title: "TOTAL ADMISSIONS",
      value: totalAdmissions.toLocaleString(),
      sub: `${excludedCases.toLocaleString()} excluded`,
      accent: "#3b82f6",
    },
    {
      title: "WITHIN 30 MIN",
      value: within30.toLocaleString(),
      sub: totalAdmissions > 0 ? `${((within30 / totalAdmissions) * 100).toFixed(1)}% compliance` : "0.0% compliance",
      accent: "#22c55e",
      subColor: "#ef4444",
    },
    {
      title: "DELAYED (>30 MIN)",
      value: delayedOver30.toLocaleString(),
      sub: totalAdmissions > 0 ? `${((delayedOver30 / totalAdmissions) * 100).toFixed(1)}% of total` : "0.0% of total",
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
      sub: totalAdmissions > 0 ? `${((over60 / totalAdmissions) * 100).toFixed(1)}%` : "0.0%",
      accent: "#ef4444",
      subColor: "#ef4444",
    },
    {
      title: "EXCLUDED CASES",
      value: excludedCases.toLocaleString(),
      sub: totalAdmissions > 0 ? `${((excludedCases / totalAdmissions) * 100).toFixed(1)}% of all records` : "0.0% of all records",
      accent: "#1e3a8a",
    },
  ];

  const complianceByUnit = useMemo(() => {
    return UNIT_OPTIONS.map((unit) => {
      const unitRecords = validMinuteRecords.filter((r) => r._unit === unit);
      const within = unitRecords.filter((r) => r._within30).length;
      const delayed = unitRecords.filter((r) => r._minutes > 30).length;
      const total = within + delayed;
      return {
        unit,
        within,
        delayed,
        total,
        withinPct: total ? (within / total) * 100 : 0,
        delayedPct: total ? (delayed / total) * 100 : 0,
      };
    });
  }, [validMinuteRecords]);

  const avgByUnit = useMemo(() => {
    return UNIT_OPTIONS.map((unit) => {
      const unitRecords = validMinuteRecords.filter((r) => r._unit === unit);
      const avg =
        unitRecords.length > 0
          ? Math.round(unitRecords.reduce((sum, r) => sum + r._minutes, 0) / unitRecords.length)
          : 0;
      const within = unitRecords.filter((r) => r._within30).length;
      return {
        unit,
        avg,
        count: unitRecords.length,
        compliancePct: unitRecords.length ? (within / unitRecords.length) * 100 : 0,
      };
    });
  }, [validMinuteRecords]);

  const shiftStats = useMemo(() => {
    return SHIFT_OPTIONS.map((s) => {
      const shiftRecords = validMinuteRecords.filter((r) => r._shift === s);
      const total = shiftRecords.length;
      const within = shiftRecords.filter((r) => r._within30).length;
      const delayed = shiftRecords.filter((r) => r._minutes > 30).length;
      const over60Count = shiftRecords.filter((r) => r._minutes > 60).length;
      const avg = total > 0 ? Math.round(shiftRecords.reduce((sum, r) => sum + r._minutes, 0) / total) : 0;
      return {
        shift: s,
        total,
        within,
        delayed,
        over60: over60Count,
        avg,
        compliancePct: total ? (within / total) * 100 : 0,
        delayedPct: total ? (delayed / total) * 100 : 0,
      };
    });
  }, [validMinuteRecords]);

  const monthStats = useMemo(() => {
  return ["FEBRUARY", "MARCH", "APRIL"].map((m) => {
    const monthRecords = filteredRecords.filter((r) => r._month === m);
    const validRecords = monthRecords.filter((r) => r._minutes !== null);

    const total = monthRecords.length;
    const within = validRecords.filter((r) => r._within30).length;
    const delayed = validRecords.filter((r) => r._minutes > 30).length;
    const avg = validRecords.length
      ? Math.round(validRecords.reduce((sum, r) => sum + r._minutes, 0) / validRecords.length)
      : 0;

    return {
      month: m,
      total,
      within,
      delayed,
      avg,
      compliancePct: validRecords.length ? (within / validRecords.length) * 100 : 0,
    };
  });
}, [filteredRecords]);

  const exclusionReasonStats = useMemo(() => {
    const excluded = filteredRecords.filter((r) => r._excluded);
    const map = new Map();
    excluded.forEach((record) => {
      const reason = record._exclusionReason || "Unspecified";
      map.set(reason, (map.get(reason) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([reason, count], index) => ({
        reason,
        count,
        pctOfExcluded: excluded.length ? (count / excluded.length) * 100 : 0,
        pctOfTotal: totalAdmissions ? (count / totalAdmissions) * 100 : 0,
        color: REASON_COLORS[index % REASON_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRecords, totalAdmissions]);

  const complianceAnalysis = useMemo(() => {
    const compliancePct = totalAdmissions ? (within30 / totalAdmissions) * 100 : 0;
    const delayedPct = totalAdmissions ? (delayedOver30 / totalAdmissions) * 100 : 0;
    const target = 80;
    return {
      compliancePct,
      delayedPct,
      target,
      gap: compliancePct - target,
      remainingToTarget: Math.max(0, Math.ceil((target / 100) * totalAdmissions - within30)),
      bestUnit: [...complianceByUnit].sort((a, b) => b.withinPct - a.withinPct)[0],
      weakestUnit: [...complianceByUnit].filter((u) => u.total > 0).sort((a, b) => a.withinPct - b.withinPct)[0],
      bestShift: [...shiftStats].sort((a, b) => b.compliancePct - a.compliancePct)[0],
      weakestShift: [...shiftStats].filter((s) => s.total > 0).sort((a, b) => a.compliancePct - b.compliancePct)[0],
    };
  }, [totalAdmissions, within30, delayedOver30, complianceByUnit, shiftStats]);

  const handleSave = async () => {
  try {
    const autoMinutes = calculateMinutesInterval(
  bedAllocationWatheeq,
  arrivalTime
);
    const newRecord = {
      dateOfBedAllocation,
      shift,
      patientId,
      edUnit,
      admittingUnit,
      dispositionMinutes: Number(autoMinutes || 0),
      bedAllocationWhatsapp,
      bedAllocationWatheeq,
      arrivalTime,
      dispositionHms,
      whatsappDelayMinutes,
      delayCategory,
      isExcluded,
      exclusionReason,
      within30Min: Number(autoMinutes || 0) <= 30,
      month: monthAuto,
      createdAt: serverTimestamp(),
    };

    if (editingId) {
      await updateDoc(doc(db, "records", editingId), newRecord);
      alert("Record updated!");
      setEditingId(null);
    } else {
      await addDoc(collection(db, "records"), newRecord);
      alert("Record saved!");
    }

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
const handleEdit = (record) => {
  setEditingId(record.id);

  setDateOfBedAllocation(record.dateOfBedAllocation || new Date().toISOString().split("T")[0]);
  setShift(record.shift || "MORNING");
  setPatientId(record.patientId || "");
  setEdUnit(record.edUnit || "CCA");
  setAdmittingUnit(record.admittingUnit || "T1A5");
  setDispositionMinutes(record._minutes || record.dispositionMinutes || "");
  setBedAllocationWhatsapp(record.bedAllocationWhatsapp || "");
  setBedAllocationWatheeq(record.bedAllocationWatheeq || "");
  setArrivalTime(record.arrivalTime || "");
  setIsExcluded(record._excluded || false);
  setExclusionReason(record._exclusionReason || record.exclusionReason || "");

  setView("add");
};

const handleDeleteRecord = async (recordId) => {
  if (!window.confirm("Delete this record?")) return;

  try {
    await deleteDoc(doc(db, "records", recordId));
    alert("Deleted!");
  } catch (err) {
    alert("Error deleting");
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
      r._exclusionReason || "",
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
      <aside style={sidebarStyle}>
        <div>
          <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={logoContainerStyle}>
              <img
                src={process.env.PUBLIC_URL + "/hospital-logo.png"}
                alt="Hospital Logo"
                style={{ maxWidth: "100%", maxHeight: 60, objectFit: "contain" }}
              />
            </div>
          </div>

          <div style={sectionLabel}>NAVIGATION</div>
          <NavItem active={view === "overview"} onClick={() => setView("overview")}>📊 Overview</NavItem>
          <NavItem active={view === "compliance"} onClick={() => setView("compliance")}>✅ % Compliance</NavItem>
          <NavItem active={view === "exclusions"} onClick={() => setView("exclusions")}>🚫 Excluded Cases</NavItem>
          <NavItem active={view === "unit"} onClick={() => setView("unit")}>🏥 Unit Performance</NavItem>
          <NavItem active={view === "shift"} onClick={() => setView("shift")}>🔄 Shift Analysis</NavItem>
          <NavItem active={view === "log"} onClick={() => setView("log")}>📋 Disposition Log</NavItem>
          <NavItem active={view === "admitting"} onClick={() => setView("admitting")}>
  🏨 Admitting Units
</NavItem>

         {isAdmin && (
  <>
    <NavItem active={view === "add"} onClick={() => setView("add")}>➕ Add Record</NavItem>
    <NavItem onClick={handleExportCsv}>📥 Export CSV</NavItem>
  </>
)}
</div>
        <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: "#7ea0c8", fontWeight: 700, fontSize: 13 }}>ED DISPOSITION TRACKER</div>
          <div style={{ color: "#7ea0c8", fontSize: 12, marginTop: 4 }}>
            Total: {filteredRecords.length.toLocaleString()} records
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, background: "#eef3f8", position: "relative" }}>
        {hoverTip && <Tooltip tip={hoverTip} />}

        <Header
  title={getPageTitle(view)}
  subtitle={`${selectedMonth} · ${filteredRecords.length.toLocaleString()} dispositions · King Saud Medical City`}
  onAdd={() => setView("add")}
  isAdmin={isAdmin}
/>

        {view !== "add" && (
          <div style={{ padding: 28, paddingBottom: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 16, alignItems: "end", marginBottom: 22 }}>
              <FilterBox label="Shift" options={["All shifts", ...SHIFT_OPTIONS]} value={selectedShift} onChange={setSelectedShift} />
              <FilterBox label="ED Unit" options={["All units", ...UNIT_OPTIONS]} value={selectedUnit} onChange={setSelectedUnit} />
              <FilterBox label="Month" options={["All months", ...MONTH_OPTIONS]} value={selectedMonth} onChange={setSelectedMonth} />
              <div style={{ justifySelf: "end", fontSize: 14, color: "#64748b" }}>
                <span style={{ fontWeight: 800, color: "#0f172a" }}>{filteredRecords.length.toLocaleString()}</span> active records
              </div>
            </div>
          </div>
        )}

        {view === "overview" && (
          <OverviewDashboard
            cards={cards}
            complianceByUnit={complianceByUnit}
            avgByUnit={avgByUnit}
            shiftStats={shiftStats}
            monthStats={monthStats}
            setHoverTip={setHoverTip}
          />
        )}

        {view === "compliance" && (
          <ComplianceDashboard
            cards={cards}
            complianceAnalysis={complianceAnalysis}
            complianceByUnit={complianceByUnit}
            shiftStats={shiftStats}
            monthStats={monthStats}
            totalAdmissions={totalAdmissions}
            within30={within30}
            delayedOver30={delayedOver30}
            setHoverTip={setHoverTip}
          />
        )}

        {view === "exclusions" && (
          <ExclusionDashboard
            totalAdmissions={totalAdmissions}
            excludedCases={excludedCases}
            activeCases={activeCases}
            exclusionReasonStats={exclusionReasonStats}
            filteredRecords={filteredRecords}
            setHoverTip={setHoverTip}
          />
        )}

        {view === "unit" && (
          <UnitDashboard
            complianceByUnit={complianceByUnit}
            avgByUnit={avgByUnit}
            validMinuteRecords={validMinuteRecords}
            setHoverTip={setHoverTip}
          />
        )}

        {view === "shift" && (
          <ShiftDashboard shiftStats={shiftStats} monthStats={monthStats} validMinuteRecords={validMinuteRecords} setHoverTip={setHoverTip} />
        )}

{view === "admitting" && (
  <AdmittingUnitDashboard
    admittingUnitStats={admittingUnitStats}
    setHoverTip={setHoverTip}
  />
)}

        {view === "log" && (
  <LogPage
    filteredRecords={filteredRecords}
    isAdmin={isAdmin}
    handleEdit={handleEdit}
    handleDelete={handleDeleteRecord}
    searchText={searchText}
    setSearchText={setSearchText}
  />
)}

        {view === "add" && isAdmin && (
  <AddRecordPage
    dateOfBedAllocation={dateOfBedAllocation}
    setDateOfBedAllocation={setDateOfBedAllocation}
    shift={shift}
    setShift={setShift}
    patientId={patientId}
    setPatientId={setPatientId}
    edUnit={edUnit}
    setEdUnit={setEdUnit}
    admittingUnit={admittingUnit}
    setAdmittingUnit={setAdmittingUnit}
    dispositionMinutes={dispositionMinutes}
    setDispositionMinutes={setDispositionMinutes}
    bedAllocationWhatsapp={bedAllocationWhatsapp}
    setBedAllocationWhatsapp={setBedAllocationWhatsapp}
    bedAllocationWatheeq={bedAllocationWatheeq}
    setBedAllocationWatheeq={setBedAllocationWatheeq}
    arrivalTime={arrivalTime}
    setArrivalTime={setArrivalTime}
    isExcluded={isExcluded}
    setIsExcluded={setIsExcluded}
    exclusionReason={exclusionReason}
    setExclusionReason={setExclusionReason}
    dispositionHms={dispositionHms}
    whatsappDelayMinutes={whatsappDelayMinutes}
    delayCategory={delayCategory}
    within30Min={within30Min}
    monthAuto={monthAuto}
    handleSave={handleSave}
    setView={setView}
    editingId={editingId}
  />
)}
      </main>
    </div>
  );
}

function getPageTitle(view) {
  if (view === "compliance") return "<30 Min Compliance Percentage Analysis";
  if (view === "exclusions") return "Excluded Cases Overview";
  if (view === "unit") return "Unit Performance";
  if (view === "shift") return "Shift Analysis Trend";
  if (view === "log") return "Disposition Log";
  if (view === "add") return "Add Record";
  if (view === "admitting") return "Admitting Unit Performance";
  return "ED Disposition Monitor";
}

function OverviewDashboard({ cards, complianceByUnit, avgByUnit, shiftStats, monthStats, setHoverTip }) {
  return (
    <div style={{ padding: 28, paddingTop: 0 }}>
      <KpiGrid cards={cards} />
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18, marginBottom: 22 }}>
        <ChartBox title="Compliance vs Delayed by ED Unit" subtitle="Hover bars to see percentage and counts">
          <StackedUnitChart data={complianceByUnit} setHoverTip={setHoverTip} />
          <Legend items={[{ label: "Delayed >30 min", color: "#ef4444" }, { label: "Within ≤30 min", color: "#22c55e" }]} />
        </ChartBox>
        <ChartBox title="Avg Disposition Time per Unit (min)" subtitle="Hover bars to see cases and compliance">
          <AvgUnitChart data={avgByUnit} setHoverTip={setHoverTip} />
        </ChartBox>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <ChartBox title="Monthly Compliance Trend" subtitle="Target line: 80%">
          <LineTrendChart data={monthStats} setHoverTip={setHoverTip} />
        </ChartBox>
        <ChartBox title="Shift Compliance Snapshot" subtitle="Hover to see shift performance">
          <ShiftStackedChart data={shiftStats} setHoverTip={setHoverTip} />
          <Legend items={[{ label: "Within ≤30 min", color: "#22c55e" }, { label: "Delayed >30 min", color: "#ef4444" }]} />
        </ChartBox>
      </div>
    </div>
  );
}

function ComplianceDashboard({ cards, complianceAnalysis, complianceByUnit, shiftStats, monthStats, totalAdmissions, within30, delayedOver30, setHoverTip }) {
  return (
    <div style={{ padding: 28, paddingTop: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 16, marginBottom: 22 }}>
        <Card card={cards[1]} />
        <MiniInsight title="Target" value="80%" sub="Desired compliance" accent="#2563eb" />
        <MiniInsight title="Gap vs Target" value={`${complianceAnalysis.gap.toFixed(1)}%`} sub={complianceAnalysis.gap >= 0 ? "Above target" : "Below target"} accent={complianceAnalysis.gap >= 0 ? "#22c55e" : "#ef4444"} />
        <MiniInsight title="Needed to 80%" value={complianceAnalysis.remainingToTarget.toLocaleString()} sub="More ≤30 min cases" accent="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
        <ChartBox title="Overall Compliance Percentage" subtitle="Green = within target, red = delayed">
          <DonutChart
            segments={[
              { label: "Within 30 min", value: within30, color: "#22c55e" },
              { label: "Delayed >30 min", value: delayedOver30, color: "#ef4444" },
            ]}
            center={`${complianceAnalysis.compliancePct.toFixed(1)}%`}
            sub="Compliance"
            setHoverTip={setHoverTip}
          />
        </ChartBox>
        <ChartBox title="Compliance by Unit" subtitle="Hover for total, within, delayed, and percentage">
          <PercentBarChart data={complianceByUnit} labelKey="unit" valueKey="withinPct" countKey="total" setHoverTip={setHoverTip} />
        </ChartBox>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <ChartBox title="Compliance by Shift" subtitle="Trend comparison by shift">
          <PercentBarChart data={shiftStats} labelKey="shift" valueKey="compliancePct" countKey="total" setHoverTip={setHoverTip} />
        </ChartBox>
        <ChartBox title="Monthly Compliance Trend" subtitle="Month to month percentage analysis">
          <LineTrendChart data={monthStats} setHoverTip={setHoverTip} />
        </ChartBox>
      </div>
    </div>
  );
}

function ExclusionDashboard({ totalAdmissions, excludedCases, activeCases, exclusionReasonStats, filteredRecords, setHoverTip }) {
  const excludedPct = totalAdmissions ? (excludedCases / totalAdmissions) * 100 : 0;

  return (
    <div style={{ padding: 28, paddingTop: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 16, marginBottom: 22 }}>
        <MiniInsight title="Total Records" value={totalAdmissions.toLocaleString()} sub="Filtered cases" accent="#3b82f6" />
        <MiniInsight title="Active Cases" value={activeCases.toLocaleString()} sub={`${(100 - excludedPct).toFixed(1)}% active`} accent="#22c55e" />
        <MiniInsight title="Excluded Cases" value={excludedCases.toLocaleString()} sub={`${excludedPct.toFixed(1)}% excluded`} accent="#ef4444" />
        <MiniInsight title="Reasons" value={exclusionReasonStats.length.toLocaleString()} sub="Exclusion categories" accent="#8b5cf6" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 18, marginBottom: 22 }}>
        <ChartBox title="Excluded vs Active Overview" subtitle="Hover to see counts and percentages">
          <DonutChart
            segments={[
              { label: "Active", value: activeCases, color: "#22c55e" },
              { label: "Excluded", value: excludedCases, color: "#ef4444" },
            ]}
            center={`${excludedPct.toFixed(1)}%`}
            sub="Excluded"
            setHoverTip={setHoverTip}
          />
        </ChartBox>
        <ChartBox title="Exclusion Reasons Breakdown" subtitle="Color legend shows each reason category">
          <ReasonBarChart data={exclusionReasonStats} setHoverTip={setHoverTip} />
          <Legend items={exclusionReasonStats.map((r) => ({ label: r.reason, color: r.color }))} wrap />
        </ChartBox>
      </div>

      <DataTable
        headers={["Reason", "Excluded Cases", "% of Excluded", "% of Total"]}
        rows={exclusionReasonStats.map((r) => [
          r.reason,
          r.count.toLocaleString(),
          `${r.pctOfExcluded.toFixed(1)}%`,
          `${r.pctOfTotal.toFixed(1)}%`,
        ])}
      />
    </div>
  );
}

function UnitDashboard({ complianceByUnit, avgByUnit, validMinuteRecords, setHoverTip }) {
  return (
    <div style={{ padding: 28, paddingTop: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(300px, 1fr))", gap: 18, marginBottom: 22 }}>
        <ChartBox title="Unit Compliance Comparison" subtitle="Hover for percentage and case counts">
          <StackedUnitChart data={complianceByUnit} setHoverTip={setHoverTip} />
          <Legend items={[{ label: "Delayed >30 min", color: "#ef4444" }, { label: "Within ≤30 min", color: "#22c55e" }]} />
        </ChartBox>
        <ChartBox title="Average Time by Unit" subtitle="Lower is better">
          <AvgUnitChart data={avgByUnit} setHoverTip={setHoverTip} />
        </ChartBox>
      </div>

      <DataTable
        headers={["ED Unit", "Total Cases", "Within 30 Min", "Delayed", "Compliance %", "Avg Time (min)"]}
        rows={UNIT_OPTIONS.map((unit) => {
          const unitRecords = validMinuteRecords.filter((r) => r._unit === unit);
          const within = unitRecords.filter((r) => r._within30).length;
          const delayed = unitRecords.filter((r) => r._minutes > 30).length;
          const avg = unitRecords.length ? Math.round(unitRecords.reduce((sum, r) => sum + r._minutes, 0) / unitRecords.length) : 0;
          return [unit, unitRecords.length, within, delayed, unitRecords.length ? `${((within / unitRecords.length) * 100).toFixed(1)}%` : "0.0%", `${avg}m`];
        })}
      />
    </div>
  );
}

function ShiftDashboard({ shiftStats, monthStats, validMinuteRecords, setHoverTip }) {
  return (
    <div style={{ padding: 28, paddingTop: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: 16, marginBottom: 22 }}>
        {shiftStats.map((item) => (
          <div key={item.shift} style={{ ...panelStyle, borderTop: `5px solid ${SHIFT_COLORS[item.shift]}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#64748b" }}>{item.shift}</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>{item.total.toLocaleString()}</div>
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 14 }}>Compliance: <strong>{item.compliancePct.toFixed(1)}%</strong></div>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>Within 30 min: <strong>{item.within.toLocaleString()}</strong></div>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>Delayed: <strong>{item.delayed.toLocaleString()}</strong></div>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>Avg time: <strong>{item.avg}m</strong></div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
        <ChartBox title="Shift Compliance Trend" subtitle="Green = within target, red = delayed">
          <ShiftStackedChart data={shiftStats} setHoverTip={setHoverTip} />
          <Legend items={[{ label: "Within ≤30 min", color: "#22c55e" }, { label: "Delayed >30 min", color: "#ef4444" }]} />
        </ChartBox>
        <ChartBox title="Monthly Compliance Trend" subtitle="Filtered by selected shift when applied">
          <LineTrendChart data={monthStats} setHoverTip={setHoverTip} />
        </ChartBox>
      </div>

      <DataTable
        headers={["Shift", "Total Cases", "Within 30 Min", "Delayed", ">60 Min", "Compliance %", "Avg Time (min)"]}
        rows={shiftStats.map((item) => [
          item.shift,
          item.total.toLocaleString(),
          item.within.toLocaleString(),
          item.delayed.toLocaleString(),
          item.over60.toLocaleString(),
          `${item.compliancePct.toFixed(1)}%`,
          `${item.avg}m`,
        ])}
      />
    </div>
  );
}
function AdmittingUnitDashboard({ admittingUnitStats, setHoverTip }) {
  return (
    <div style={{ padding: 28, paddingTop: 0 }}>
      <ChartBox
        title="Admitting Unit Total Cases & ≤30 Min Compliance"
        subtitle="Shows total cases and percentage within 30 minutes"
      >
        <PercentBarChart
          data={admittingUnitStats}
          labelKey="admittingUnit"
          valueKey="compliancePct"
          countKey="total"
          setHoverTip={setHoverTip}
        />
      </ChartBox>

      <div style={{ marginTop: 22 }}>
        <DataTable
          headers={[
            "Admitting Unit",
            "Total Cases",
            "Within 30 Min",
            "Delayed",
            "Compliance %",
          ]}
          rows={admittingUnitStats.map((item) => [
            item.admittingUnit,
            item.total.toLocaleString(),
            item.within.toLocaleString(),
            item.delayed.toLocaleString(),
            `${item.compliancePct.toFixed(1)}%`,
          ])}
        />
      </div>
    </div>
  );
}
function LogPage({ filteredRecords, isAdmin, handleEdit, handleDelete, searchText, setSearchText }) {
  const searchedRecords = filteredRecords.filter((record) => {
  const keyword = searchText.toLowerCase();

  return [
    record.dateOfBedAllocation,
    record._shift,
    record.patientId,
    record._unit,
    record.admittingUnit,
    record._minutes,
    record.delayCategory,
    record._within30 ? "yes" : "no",
    record._excluded ? "yes" : "no",
    record._exclusionReason,
    record._month,
  ]
    .join(" ")
    .toLowerCase()
    .includes(keyword);
});
  return (
    <div style={{ padding: 28, paddingTop: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Disposition Log</div>
      <input
  type="text"
  placeholder="Search patient, unit, shift, reason..."
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
  style={{
    width: "100%",
    maxWidth: 500,
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 14px",
    fontSize: 15,
    marginBottom: 16,
  }}
/>
      <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
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
                "Reason",
                "Month",
                ...(isAdmin ? ["Actions"] : []),
              ].map((header) => (
              <th key={header} style={thStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...searchedRecords]
  .sort((a, b) => {
    const dateA = new Date(a.dateOfBedAllocation || "1900-01-01").getTime();
    const dateB = new Date(b.dateOfBedAllocation || "1900-01-01").getTime();

    if (dateB !== dateA) return dateB - dateA;

    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  })
  .map((record) => (
                <tr key={record.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={tdStyle}>{record.dateOfBedAllocation || "-"}</td>
                  <td style={tdStyle}>{record.shift || "-"}</td>
                  <td style={tdStyle}>{record.patientId || "-"}</td>
                  <td style={tdStyle}>{record.edUnit || "-"}</td>
                  <td style={tdStyle}>{record.admittingUnit || "-"}</td>
                  <td style={tdStyle}>{record._minutes !== null ? Math.round(record._minutes) : "-"}</td>
                  <td style={tdStyle}>{record.dispositionHms || "-"}</td>
                  <td style={tdStyle}>{record.delayCategory || "-"}</td>
                  <td style={tdStyle}>{record._within30 ? "YES" : "NO"}</td>
                  <td style={tdStyle}>{record._excluded ? "YES" : "NO"}</td>
                  <td style={tdStyle}>{record._excluded ? record._exclusionReason : "-"}</td>
                  <td style={tdStyle}>{record._month || "-"}</td>
                  {isAdmin && (
  <td style={tdStyle}>
    <button onClick={() => handleEdit(record)}>✏️</button>
    <button onClick={() => handleDelete(record.id)}>🗑️</button>
  </td>
)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddRecordPage(props) {
  return (
    <div>
      <div style={{ background: "white", borderBottom: "1px solid #dbe4ee", padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
  {props.editingId ? "Edit Record" : "Add Record"}
</div>
          <div style={{ color: "#64748b", marginTop: 4 }}>Enter a new ED disposition record</div>
        </div>
        <button onClick={props.handleSave} style={primaryBtn}>
  {props.editingId ? "Update Record" : "+ Save Record"}
</button>
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ background: "white", borderRadius: 18, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(280px, 1fr))", gap: 20 }}>
            <Field label="DATE OF BED ALLOCATION *"><input type="date" value={props.dateOfBedAllocation} onChange={(e) => props.setDateOfBedAllocation(e.target.value)} style={inputStyle} /></Field>
            <Field label="SHIFT *"><select value={props.shift} onChange={(e) => props.setShift(e.target.value)} style={inputStyle}>{SHIFT_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="PATIENT ID *"><input type="text" value={props.patientId} onChange={(e) => props.setPatientId(e.target.value)} placeholder="e.g. 110000356396" style={inputStyle} /></Field>
            <Field label="ED UNIT *"><select value={props.edUnit} onChange={(e) => props.setEdUnit(e.target.value)} style={inputStyle}>{UNIT_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="ADMITTING UNIT *">
  <select
    value={props.admittingUnit}
    onChange={(e) => props.setAdmittingUnit(e.target.value)}
    style={inputStyle}
  >
    {ADMITTING_UNIT_OPTIONS.map((item) => (
      <option key={item} value={item}>
        {item}
      </option>
    ))}
  </select>
</Field>
            <Field label="DISPOSITION TIME (MINUTES) *"><input type="number" value={props.dispositionMinutes} onChange={(e) => props.setDispositionMinutes(e.target.value)} placeholder="e.g. 25" style={inputStyle} /></Field>
            <Field label="BED ALLOCATION TIME (WHATSAPP)"><input type="time" value={props.bedAllocationWhatsapp} onChange={(e) => props.setBedAllocationWhatsapp(e.target.value)} style={inputStyle} /></Field>
            <Field label="BED ALLOCATION TIME (WATHEEQ)"><input type="time" value={props.bedAllocationWatheeq} onChange={(e) => props.setBedAllocationWatheeq(e.target.value)} style={inputStyle} /></Field>
            <Field label="PATIENT ARRIVAL TIME TO UNIT"><input type="time" value={props.arrivalTime} onChange={(e) => props.setArrivalTime(e.target.value)} style={inputStyle} /></Field>
            <Field label="DISPOSITION TIME (H:MM:SS)"><input type="text" value={props.dispositionHms} readOnly style={inputStyleReadOnly} /></Field>
            <Field label="WHATSAPP DELAY (MINUTES)"><input type="text" value={props.whatsappDelayMinutes} readOnly style={inputStyleReadOnly} /></Field>
            <Field label="DELAY CATEGORY (AUTO)"><input type="text" value={props.delayCategory} readOnly style={inputStyleReadOnly} /></Field>
          </div>

          <div style={{ marginTop: 22, padding: 22, border: "1px solid #f5c38b", background: "#fff7ed", borderRadius: 16 }}>
            <div style={{ color: "#ea580c", fontWeight: 800, marginBottom: 12 }}>Exclusion Status</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20, alignItems: "end" }}>
              <div>
                <div style={labelStyle}>MARK AS EXCLUDED?</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" onClick={() => props.setIsExcluded(false)} style={{ ...toggleBtn, background: !props.isExcluded ? "#16a34a" : "#f8fafc", color: !props.isExcluded ? "white" : "#64748b", border: !props.isExcluded ? "none" : "1px solid #cbd5e1" }}>Active</button>
                  <button type="button" onClick={() => props.setIsExcluded(true)} style={{ ...toggleBtn, background: props.isExcluded ? "#ef4444" : "#f8fafc", color: props.isExcluded ? "white" : "#64748b", border: props.isExcluded ? "none" : "1px solid #cbd5e1" }}>Excluded</button>
                </div>
              </div>
              <Field label="COMMENTS / EXCLUSION REASON"><input type="text" value={props.exclusionReason} onChange={(e) => props.setExclusionReason(e.target.value)} placeholder="Optional notes" style={inputStyle} /></Field>
            </div>
          </div>

          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <AutoBox title="<30 MINUTES? (AUTO)" value={props.within30Min ? "YES" : "NO"} color="#16a34a" bg="#ecfdf3" />
            <AutoBox title="MONTH (AUTO FROM DATE)" value={props.monthAuto} color="#2563eb" bg="#eef4ff" />
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <button onClick={props.handleSave} style={primaryBtn}>Save Record</button>
            <button onClick={() => props.setView("overview")} style={cancelBtn}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiGrid({ cards }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(180px, 1fr))", gap: 16, marginBottom: 16 }}>
        {cards.slice(0, 5).map((card) => <Card key={card.title} card={card} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 4fr", gap: 16, marginBottom: 28 }}>
        <Card card={cards[5]} />
        <div />
      </div>
    </>
  );
}

function StackedUnitChart({ data, setHoverTip }) {
  const max = Math.max(1, ...data.map((d) => d.within + d.delayed), 800);
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-end", height: 250, padding: "10px 20px 0" }}>
      {data.map((item) => {
        const greenHeight = ((item.within || 0) / max) * 180;
        const redHeight = ((item.delayed || 0) / max) * 180;
        return (
          <div key={item.unit} style={{ flex: 1, textAlign: "center" }}>
            <div
              onMouseEnter={(e) => setHoverTip(makeTip(e, item.unit, [`Total: ${item.total.toLocaleString()}`, `Within: ${item.within.toLocaleString()} (${item.withinPct.toFixed(1)}%)`, `Delayed: ${item.delayed.toLocaleString()} (${item.delayedPct.toFixed(1)}%)`]))}
              onMouseLeave={() => setHoverTip(null)}
              style={{ margin: "0 auto", width: 72, height: 180, display: "flex", flexDirection: "column-reverse", borderRadius: 6, overflow: "hidden", background: "#f1f5f9", cursor: "pointer" }}
            >
              <div style={{ height: greenHeight, background: "#22c55e" }} />
              <div style={{ height: redHeight, background: "#ef4444" }} />
            </div>
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>{item.unit}</div>
          </div>
        );
      })}
    </div>
  );
}

function AvgUnitChart({ data, setHoverTip }) {
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-end", height: 250, padding: "10px 20px 0" }}>
      {data.map((item, idx) => (
        <div key={item.unit} style={{ flex: 1, textAlign: "center" }}>
          <div
            onMouseEnter={(e) => setHoverTip(makeTip(e, item.unit, [`Avg: ${item.avg}m`, `Cases: ${item.count.toLocaleString()}`, `Compliance: ${item.compliancePct.toFixed(1)}%`]))}
            onMouseLeave={() => setHoverTip(null)}
            style={{ margin: "0 auto", width: 76, height: Math.max(item.avg * 4, 10), maxHeight: 180, borderRadius: 6, background: UNIT_COLORS[idx % UNIT_COLORS.length], cursor: "pointer" }}
          />
          <div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>{item.unit}</div>
        </div>
      ))}
    </div>
  );
}

function ShiftStackedChart({ data, setHoverTip }) {
  const max = Math.max(1, ...data.map((d) => d.total), 1000);
  return (
    <div style={{ display: "flex", gap: 26, alignItems: "flex-end", height: 250, padding: "10px 20px 0" }}>
      {data.map((item) => (
        <div key={item.shift} style={{ flex: 1, textAlign: "center" }}>
          <div
            onMouseEnter={(e) => setHoverTip(makeTip(e, item.shift, [`Total: ${item.total.toLocaleString()}`, `Compliance: ${item.compliancePct.toFixed(1)}%`, `Within: ${item.within.toLocaleString()}`, `Delayed: ${item.delayed.toLocaleString()}`, `Avg: ${item.avg}m`]))}
            onMouseLeave={() => setHoverTip(null)}
            style={{ margin: "0 auto", width: 90, height: 190, display: "flex", flexDirection: "column-reverse", borderRadius: 8, overflow: "hidden", background: "#f1f5f9", cursor: "pointer" }}
          >
            <div style={{ height: (item.within / max) * 190, background: "#22c55e" }} />
            <div style={{ height: (item.delayed / max) * 190, background: "#ef4444" }} />
          </div>
          <div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>{item.shift}</div>
        </div>
      ))}
    </div>
  );
}

function PercentBarChart({ data, labelKey, valueKey, countKey, setHoverTip }) {
  return (
    <div style={{ padding: "10px 16px" }}>
      {data.map((item, idx) => (
        <div key={item[labelKey]} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "#334155", fontWeight: 700 }}>
            <span>{item[labelKey]}</span>
            <span>{Number(item[valueKey] || 0).toFixed(1)}%</span>
          </div>
          <div
            onMouseEnter={(e) => setHoverTip(makeTip(e, item[labelKey], [`Percentage: ${Number(item[valueKey] || 0).toFixed(1)}%`, `Cases: ${Number(item[countKey] || 0).toLocaleString()}`]))}
            onMouseLeave={() => setHoverTip(null)}
            style={{ height: 22, background: "#e2e8f0", borderRadius: 999, overflow: "hidden", cursor: "pointer" }}
          >
            <div style={{ width: `${Math.min(100, Number(item[valueKey] || 0))}%`, height: "100%", background: UNIT_COLORS[idx % UNIT_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LineTrendChart({ data, setHoverTip }) {
  const max = 100;
  if (!data.length) return <div style={{ color: "#64748b", padding: 24 }}>No trend data available.</div>;
  return (
    <div style={{ height: 260, display: "flex", alignItems: "flex-end", gap: 14, padding: "20px 18px 0", borderBottom: "1px dashed #cbd5e1", position: "relative" }}>
      <div style={{ position: "absolute", left: 18, right: 18, bottom: `${20 + (80 / max) * 200}px`, borderTop: "2px dashed #2563eb", opacity: 0.45 }} />
      {data.map((item) => (
        <div key={item.month} style={{ flex: 1, textAlign: "center" }}>
          <div
            onMouseEnter={(e) => setHoverTip(makeTip(e, item.month, [`Compliance: ${item.compliancePct.toFixed(1)}%`, `Total: ${item.total.toLocaleString()}`, `Within: ${item.within.toLocaleString()}`, `Delayed: ${item.delayed.toLocaleString()}`, `Avg: ${item.avg}m`]))}
            onMouseLeave={() => setHoverTip(null)}
            style={{ margin: "0 auto", width: 46, height: Math.max(8, (item.compliancePct / max) * 200), background: item.compliancePct >= 80 ? "#22c55e" : "#f59e0b", borderRadius: "8px 8px 0 0", cursor: "pointer" }}
          />
          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>{item.month.slice(0, 3)}</div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ segments, center, sub, setHoverTip }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let current = 0;
  const gradient = segments.map((s) => {
    const start = total ? (current / total) * 100 : 0;
    current += s.value;
    const end = total ? (current / total) * 100 : 0;
    return `${s.color} ${start}% ${end}%`;
  }).join(", ");

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, minHeight: 260 }}>
      <div
        style={{ width: 190, height: 190, borderRadius: "50%", background: `conic-gradient(${gradient || "#e2e8f0 0% 100%"})`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        onMouseEnter={(e) => setHoverTip(makeTip(e, "Overview", segments.map((s) => `${s.label}: ${s.value.toLocaleString()} (${total ? ((s.value / total) * 100).toFixed(1) : "0.0"}%)`)))}
        onMouseLeave={() => setHoverTip(null)}
      >
        <div style={{ width: 118, height: 118, borderRadius: "50%", background: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>{center}</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>{sub}</div>
        </div>
      </div>
      <Legend items={segments.map((s) => ({ label: `${s.label}: ${s.value.toLocaleString()}`, color: s.color }))} vertical />
    </div>
  );
}

function ReasonBarChart({ data, setHoverTip }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div style={{ padding: "8px 6px" }}>
      {data.map((item) => (
        <div key={item.reason} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#334155", marginBottom: 5 }}>
            <strong>{item.reason}</strong>
            <span>{item.count.toLocaleString()} · {item.pctOfExcluded.toFixed(1)}%</span>
          </div>
          <div
            onMouseEnter={(e) => setHoverTip(makeTip(e, item.reason, [`Count: ${item.count.toLocaleString()}`, `% of excluded: ${item.pctOfExcluded.toFixed(1)}%`, `% of total: ${item.pctOfTotal.toFixed(1)}%`]))}
            onMouseLeave={() => setHoverTip(null)}
            style={{ height: 14, background: "#e2e8f0", borderRadius: 999, overflow: "hidden", cursor: "pointer" }}
          >
            <div style={{ width: `${(item.count / max) * 100}%`, height: "100%", background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniInsight({ title, value, sub, accent }) {
  return (
    <div style={{ ...panelStyle, borderTop: `5px solid ${accent}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#64748b" }}>{title}</div>
      <div style={{ fontSize: 38, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function Tooltip({ tip }) {
  return (
    <div style={{ position: "fixed", left: tip.x + 12, top: tip.y + 12, background: "#0f172a", color: "white", borderRadius: 12, padding: "10px 12px", zIndex: 9999, boxShadow: "0 10px 30px rgba(15,23,42,0.25)", fontSize: 13, pointerEvents: "none", maxWidth: 260 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{tip.title}</div>
      {tip.lines.map((line) => <div key={line} style={{ marginTop: 3, color: "#dbeafe" }}>{line}</div>)}
    </div>
  );
}

function makeTip(event, title, lines) {
  return { x: event.clientX, y: event.clientY, title, lines };
}

function Header({ title, subtitle, onAdd, isAdmin }) {
  return (
    <div style={{ background: "white", borderBottom: "1px solid #dbe4ee", padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ color: "#16a34a", fontWeight: 700 }}>● Live</div>
        {isAdmin && (
  <button onClick={onAdd} style={primaryBtn}>+ Add Record</button>
)}
      </div>
    </div>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
        <thead>
          <tr style={{ background: "#f8fafc", textAlign: "left" }}>
            {headers.map((header) => <th key={header} style={thStyle}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ borderTop: "1px solid #e5e7eb" }}>
              {row.map((cell, cellIndex) => <td key={cellIndex} style={tdStyle}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AutoBox({ title, value, color, bg }) {
  return (
    <div style={{ background: bg, border: "1px solid #c7d2fe", borderRadius: 16, padding: 22 }}>
      <div style={{ color, fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function NavItem({ children, active = false, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: "16px 20px", cursor: "pointer", background: active ? "#314d78" : "transparent", color: active ? "white" : "#d5e0f1", fontSize: 16, fontWeight: active ? 800 : 600, display: "flex", alignItems: "center", gap: 10 }}>
      {children}
    </div>
  );
}

function FilterBox({ label, options, value, onChange }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "#475569" }}>{label}</div>
      <select style={filterInputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((item) => <option key={item}>{item}</option>)}
      </select>
    </div>
  );
}

function Field({ label, children }) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>;
}

function Card({ card }) {
  return (
    <div style={{ background: "white", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", padding: 20, borderTop: `4px solid ${card.accent || "#cbd5e1"}`, minHeight: 130 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#64748b", letterSpacing: 0.5 }}>{card.title}</div>
      <div style={{ fontSize: 48, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>{card.value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: card.subColor || "#64748b" }}>{card.sub}</div>
    </div>
  );
}

function ChartBox({ title, subtitle, children }) {
  return (
    <div style={{ background: "white", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", padding: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{subtitle}</div>
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

function Legend({ items, vertical = false, wrap = false }) {
  return (
    <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", justifyContent: "center", flexWrap: wrap ? "wrap" : "nowrap", gap: 12, marginTop: 14, fontSize: 13 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 12, background: item.color, display: "inline-block", borderRadius: 3 }} />
          <span style={{ color: "#64748b" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

const sidebarStyle = { width: 275, background: "#13253f", color: "white", display: "flex", flexDirection: "column", justifyContent: "space-between" };
const logoContainerStyle = { background: "white", borderRadius: 4, padding: 8, minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center" };
const panelStyle = { background: "white", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" };
const sectionLabel = { padding: "18px 16px 8px", color: "#7087a8", fontWeight: 800, fontSize: 13, letterSpacing: 0.8 };
const labelStyle = { marginBottom: 8, fontWeight: 700, color: "#64748b", fontSize: 14 };
const inputStyle = { width: "100%", height: 48, borderRadius: 10, border: "1px solid #d7e0ea", padding: "0 16px", fontSize: 16, boxSizing: "border-box", background: "white" };
const inputStyleReadOnly = { ...inputStyle, background: "#f8fafc", color: "#374151" };
const filterInputStyle = { width: "100%", height: 42, borderRadius: 10, border: "1px solid #d7e0ea", padding: "0 14px", fontSize: 16, boxSizing: "border-box", background: "white" };
const toggleBtn = { flex: 1, height: 48, borderRadius: 10, fontWeight: 800, cursor: "pointer" };
const primaryBtn = { background: "#2563eb", color: "white", border: "none", borderRadius: 12, padding: "12px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const cancelBtn = { background: "#e5e7eb", color: "#111827", border: "none", borderRadius: 10, padding: "12px 18px", fontWeight: 700, cursor: "pointer" };
const thStyle = { padding: "14px 16px", fontSize: 14, color: "#64748b", fontWeight: 700 };
const tdStyle = { padding: "14px 16px", fontSize: 14, color: "#111827" };

export default EDDispositionTracker;
