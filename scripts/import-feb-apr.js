const XLSX = require("xlsx");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDShrnesdOgoVWvzG2ohrxm51ep8Yh9gKA",
  authDomain: "ed-tracker-4d2f0.firebaseapp.com",
  projectId: "ed-tracker-4d2f0",
  storageBucket: "ed-tracker-4d2f0.firebasestorage.app",
  messagingSenderId: "132868285663",
  appId: "1:132868285663:web:eada0fc610d18162a3b56a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const FILE_NAME = "ED DISPOSITION COLLECTION SHEET.xlsx";
const SHEETS = ["FEBRUARY", "MARCH", "APRIL"];

function clean(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function excelDate(v) {
  if (!v) return "";

  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }

  return clean(v);
}

function timeValue(v) {
  if (!v) return "";

  if (typeof v === "number") {
    const totalMinutes = Math.round(v * 24 * 60);
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const m = String(totalMinutes % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  return clean(v);
}

function minutesValue(v) {
  if (!v) return 0;

  if (typeof v === "number") {
    if (v < 1) return Math.round(v * 24 * 60);
    return Math.round(v);
  }

  const text = clean(v);

  if (text.includes(":")) {
    const [h, m] = text.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normalizeUnit(value) {
  const text = clean(value).toUpperCase().replace(/\s+/g, " ");

  const unitMap = {
    CCA: "CCA",
    CCB: "CCB",
    CCC: "CCC",
    CCD: "CCD",
    TRIAGE: "Triage/Pulmo",
    PULMO: "Triage/Pulmo",
    "TRIAGE/PULMO": "Triage/Pulmo",
    "TRIAGE / PULMO": "Triage/Pulmo",
    "TRIAGE PULMO": "Triage/Pulmo",
  };

  return unitMap[text] || clean(value);
}

async function deleteExisting() {
  const snap = await getDocs(collection(db, "records"));
  console.log(`Deleting ${snap.size} existing records...`);

  let deleted = 0;

  for (const item of snap.docs) {
    await deleteDoc(doc(db, "records", item.id));
    deleted++;

    if (deleted % 100 === 0) {
      console.log(`Deleted ${deleted}`);
    }
  }

  console.log(`Done deleting ${deleted}`);
}

async function importData() {
  const workbook = XLSX.readFile(FILE_NAME);
  let total = 0;

  for (const sheetName of SHEETS) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      console.log(`Sheet not found: ${sheetName}`);
      continue;
    }

    const rows = XLSX.utils
      .sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: true,
      })
      .map((row) => row.slice(0, 16)); // Columns A:P only

    let sheetCount = 0;

    for (const row of rows) {
      // Correct Excel mapping:
      // A = Shift
      // B = Patient ID
      // C = ED Unit
      // D = Admitting Unit
      // E = Date of Bed Allocation
      // F = Bed Allocation Whatsapp
      // G = Bed Allocation Watheeq
      // H = Arrival Time
      // I = Disposition Minutes
      // P = Exclusion Reason

      const shift = clean(row[0]).toUpperCase();
      const patientId = clean(row[1]);
      const edUnit = normalizeUnit(row[2]);
      const admittingUnit = clean(row[3]);
      const dateOfBedAllocation = excelDate(row[4]);
      const bedAllocationWhatsapp = timeValue(row[5]);
      const bedAllocationWatheeq = timeValue(row[6]);
      const arrivalTime = timeValue(row[7]);
      const dispositionMinutes = minutesValue(row[8]);
      const exclusionReason = clean(row[15]);

      // Skip header and blank rows
      if (!shift || shift === "SHIFT") continue;
      if (!patientId || patientId.toUpperCase() === "PATIENT ID") continue;
      if (!edUnit || edUnit.toUpperCase() === "ED UNIT") continue;

      const isExcluded = exclusionReason !== "";
      const within30Min = dispositionMinutes <= 30;

      const delayCategory =
        dispositionMinutes <= 30
          ? "NO DELAY"
          : dispositionMinutes <= 60
          ? "31-60 MIN"
          : ">60 MIN";

      sheetCount++;
      total++;

      await setDoc(doc(db, "records", `${sheetName}_${sheetCount}`), {
        dateOfBedAllocation,
        shift,
        patientId,
        edUnit,
        admittingUnit,
        bedAllocationWhatsapp,
        bedAllocationWatheeq,
        arrivalTime,
        dispositionMinutes,
        dispositionHms: "",
        whatsappDelayMinutes: 0,
        delayCategory,
        isExcluded,
        exclusionReason,
        within30Min,
        month: sheetName,
        sourceSheet: sheetName,
      });

      if (total % 50 === 0) {
        console.log(`Imported ${total}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`${sheetName}: imported ${sheetCount}`);
  }

  console.log(`Done importing ${total} records with correct dashboard mapping.`);
}

async function run() {
  await deleteExisting();
  await importData();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});