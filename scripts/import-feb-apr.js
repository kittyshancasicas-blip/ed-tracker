const XLSX = require("xlsx");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
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

  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  return clean(v);
}

function timeValue(v) {
  if (!v) return "";

  if (typeof v === "number") {
    const totalMinutes = Math.round(v * 24 * 60);
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
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

function toHms(mins) {
  const total = Number(mins || 0);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

function normalizeUnit(value) {
  const text = clean(value).toUpperCase();

  if (text.includes("TRIAGE") || text.includes("PULMO")) return "Triage/Pulmo";
  if (["CCA", "CCB", "CCC", "CCD"].includes(text)) return text;

  return clean(value);
}

async function deleteFebToAprilOnly() {
  const q = query(
    collection(db, "records"),
    where("month", "in", SHEETS)
  );

  const snap = await getDocs(q);
  console.log(`Deleting ${snap.size} February-April records only...`);

  let count = 0;
  for (const item of snap.docs) {
    await deleteDoc(doc(db, "records", item.id));
    count++;
  }

  console.log(`Deleted ${count} old Feb-Apr records.`);
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

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    let sheetCount = 0;

    for (const row of rows) {
      // A to O only
      const shift = clean(row[0]).toUpperCase();              // A
      const patientId = clean(row[1]);                        // B
      const edUnit = normalizeUnit(row[2]);                   // C
      const admittingUnit = clean(row[3]);                    // D
      const dateOfBedAllocation = excelDate(row[4]);          // E
      const bedAllocationWhatsapp = timeValue(row[5]);        // F
      const bedAllocationWatheeq = timeValue(row[6]);         // G
      const arrivalTime = timeValue(row[7]);                  // H

      // Based on your sheet, disposition minutes is Column J
      const dispositionMinutes = minutesValue(row[9]);        // J

      const within30Text = clean(row[10]).toUpperCase();      // K
      const comments = clean(row[13]);                        // N
      const excludedFlag = clean(row[14]).toUpperCase();      // O

      if (!shift || shift === "SHIFT") continue;
      if (!patientId || patientId.toUpperCase() === "PATIENT ID") continue;
      if (!edUnit || edUnit.toUpperCase() === "ED UNIT") continue;

      const isExcluded =
        excludedFlag === "EXCLUDED" ||
        excludedFlag === "YES" ||
        excludedFlag === "TRUE";

      const exclusionReason = isExcluded ? comments || "EXCLUDED" : "";

      const within30Min =
        within30Text === "YES"
          ? true
          : within30Text === "NO"
          ? false
          : dispositionMinutes <= 30;

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
        dispositionHms: toHms(dispositionMinutes),
        whatsappDelayMinutes: 0,

        delayCategory,
        within30Min,

        isExcluded,
        exclusionReason,
        comments,
        excludedFlag,

        month: sheetName,
        sourceSheet: sheetName,
      });

      if (total % 100 === 0) {
        console.log(`Imported ${total}`);
      }
    }

    console.log(`${sheetName}: imported ${sheetCount}`);
  }

  console.log(`DONE. Imported ${total} Feb-Apr records from columns A to O.`);
}

async function run() {
  await deleteFebToAprilOnly();
  await importData();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});