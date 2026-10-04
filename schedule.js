// Pure logic: no DOM, no clock, no network. Data in, result out.

const GRACE_MINUTES = 10; // keep showing a bus this long after it left

// "08:15" -> 495 (minutes since midnight)
function parseTime(text) {
  const [h, m] = text.trim().split(":").map(Number);
  return h * 60 + m;
}

// departures: [{ minutes, line, stop }, ...]  (any order, all lines mixed)
// now:        { weekday, minutes }            (weekday: 0=Sun ... 6=Sat)
// returns:    { status: "ok" | "weekend" | "no-more", items: [...] }
function getNextDepartures(departures, now, count = 4) {
  if (now.weekday === 0 || now.weekday === 6) {
    return { status: "weekend", items: [] };
  }

  const items = departures
    .filter((d) => d.minutes >= now.minutes - GRACE_MINUTES)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, count);

  return { status: items.length > 0 ? "ok" : "no-more", items };
}

// ---------- Direction ----------
const SWITCH_MINUTES = 14 * 60; // from 14:00 on, you're going home

// "work" before 14:00, "home" from 14:00
function chooseDirection(now) {
  return now.minutes < SWITCH_MINUTES ? "work" : "home";
}

// ---------- CSV reading ----------
// Picks the delimiter that appears most in the first line.
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const counts = [";", "\t", ","].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Trim spaces, then strip surrounding quotes
const cleanCell = (s) => s.trim().replace(/^"|"$/g, "").trim();
const normalizeName = (s) => cleanCell(s).toLowerCase();

// Finds the row whose first cell is stopName and returns its times
// (minutes since midnight). Returns null if the stop isn't in the file.
function extractTimes(csvText, stopName) {
  const text = csvText.replace(/^\uFEFF/, ""); // remove Excel's invisible BOM
  const delimiter = detectDelimiter(text);
  const target = normalizeName(stopName);

  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(delimiter);
    if (normalizeName(cells[0]) !== target) continue;
    return cells
      .slice(1)
      .map(cleanCell)
      .filter((c) => TIME_RE.test(c))
      .map(parseTime);
  }
  return null;
}