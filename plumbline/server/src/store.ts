import fs from "node:fs";
import path from "node:path";
import type { DB, Doc } from "./types";
import { SAMPLES, USERS, seedKB } from "./seed";
import { acceptFinding, addComment, audit, decide, newDoc, reviewDocSync, signOff, submit } from "./docs";

const FILE = process.env.DATA_FILE || path.resolve("data/db.json");
let db: DB;
let timer: NodeJS.Timeout | null = null;

function seedDocs(db: DB) {
  const priya = db.users.find((u) => u.id === "u-priya")!;
  const arjun = db.users.find((u) => u.id === "u-arjun")!;
  const meera = db.users.find((u) => u.id === "u-meera")!;
  // 1. A clean draft already waiting for the reviewer, so a reviewer's inbox is never empty.
  const a = newDoc(priya, { title: SAMPLES.clean.title, channel: SAMPLES.clean.channel, sensitivity: SAMPLES.clean.sensitivity, text: SAMPLES.clean.text });
  reviewDocSync(a, db.kb);
  submit(a, priya);
  addComment(a, priya, "All claims were checked against the approved facts, so this should be quick.");
  // 2. A finished example showing the sign-off and the publish-ready package.
  const b = newDoc(priya, { title: "Spring banner copy", channel: "Website", sensitivity: "public",
    text: "Welcome to spring. Lumora Glow Serum is available in 30 ml and 50 ml bottles." });
  reviewDocSync(b, db.kb);
  submit(b, priya);
  decide(b, arjun, "approve", "Facts match F-040. Good to go.");
  signOff(b, meera);
  db.docs.push(b, a);
}

export function seedDb(): DB {
  const d: DB = { users: USERS.map((u) => ({ ...u })), kb: seedKB(), docs: [] };
  seedDocs(d);
  return d;
}

function writeNow() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.warn("Could not persist data file:", (e as Error).message); }
}

export function loadDb(): DB {
  if (fs.existsSync(FILE)) {
    try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); if (!db.kb || !db.docs || !db.users) throw new Error("bad shape"); return db; }
    catch { /* fall through to reseed */ }
  }
  db = seedDb();
  writeNow();
  return db;
}

export const getDb = () => db;

export function save() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(writeNow, 150);
}

export function resetDb() {
  db = seedDb();
  writeNow();
}

export function findDoc(id: string): Doc | undefined { return db.docs.find((d) => d.id === id); }
export { audit, acceptFinding };
