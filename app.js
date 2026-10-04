// ---------- Config ----------
const LINES = [
  { line: "1", file: "data/L1.csv",
    stops: { work: "Av. Dr. Lourenço Peixinho- CTT B", home: "Hospital/ Universidade B" } },
  { line: "2", file: "data/L2.csv",
    stops: { work: "Av. Dr. Lourenço Peixinho - CTT B", home: "Hospital / Universidade B" } },
  { line: "3", file: "data/L3.csv",
    stops: { work: "Av. Dr. Lourenço Peixinho - CTT B", home: "Hospital / Universidade B" } },
  { line: "4", file: "data/L4.csv",
    stops: { work: "Av. Dr. Lourenço Peixinho - CTT B", home: "Hospital / Universidade B" } },
  { line: "5", file: "data/L5.csv",
    stops: { work: "Av. Dr. Lourenço Peixinho - CTT B", home: "Hospital / Universidade B" } },
  { line: "6", file: "data/L6.csv",
    stops: { work: "Av. Dr. Lourenço Peixinho - CTT B", home: "Hospital / Universidade B" } },
  { line: "11", file: "data/L11.csv",
    stops: { work: " Forca - Túnel B", home: "Universidade- Crasto" } },
];

const CARD_COUNT = 4;

const MESSAGES = {
  weekend: "Esta app não está pronta para fins de semana.",
  "no-more": "Não há mais autocarros hoje.",
};

// ---------- State ----------
let csvTexts = null; // { "data/L1.csv": "text...", ... }
let now = null;
let direction = null;

// ---------- Clock ----------
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// Real time in Lisbon, independent of the phone's own time zone setting
function getRealNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type).value;

  return {
    weekday: WEEKDAYS[get("weekday").toLowerCase()],
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// Same, but ?time=HH:MM and/or ?day=mon..sun in the URL override it
function getNow() {
  const result = getRealNow();
  const params = new URLSearchParams(location.search);
  result.simulated = false;

  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(params.get("time") ?? "");
  if (timeMatch) {
    result.minutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    result.simulated = true;
  }

  const day = (params.get("day") ?? "").toLowerCase();
  if (day in WEEKDAYS) {
    result.weekday = WEEKDAYS[day];
    result.simulated = true;
  }

  return result;
}

function formatMinutes(total) {
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const DAY_NAMES_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Debug line: always shows the time and direction the page is using
function showClockNote() {
  const kind = now.simulated ? "simulada" : "real";
  document.getElementById("clock-note").textContent =
    `Hora considerada: ${DAY_NAMES_PT[now.weekday]} ${formatMinutes(now.minutes)}` +
    ` (${kind}) · direção: ${direction}`;
}

// ---------- Rendering ----------
function makeParagraph(className, text) {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function makeDepartureCard(dep) {
  const card = document.createElement("article");
  card.className = "card";
  card.append(
    makeParagraph("time", formatMinutes(dep.minutes)),
    makeParagraph("line", `Linha ${dep.line}`),
    makeParagraph("stop", dep.stop)
  );
  return card;
}

function makeMessageCard(text) {
  const card = document.createElement("article");
  card.className = "card card-message";
  card.append(makeParagraph("message-text", text));
  return card;
}

function makeEmptyCard(text) {
  const card = document.createElement("article");
  card.className = "card card-empty";
  card.append(makeParagraph("time", text));
  return card;
}

function renderResult(result) {
  const container = document.getElementById("departures");
  container.replaceChildren();

  const cards = [];
  if (result.status === "ok") {
    for (const dep of result.items) cards.push(makeDepartureCard(dep));
  } else {
    cards.push(makeMessageCard(MESSAGES[result.status]));
  }

  // Pad up to 4 cards: "--" normally, blank on weekends
  const filler = result.status === "weekend" ? "" : "--";
  while (cards.length < CARD_COUNT) cards.push(makeEmptyCard(filler));

  container.append(...cards);
}

function updateButtons() {
  for (const btn of document.querySelectorAll("#direction button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.dir === direction));
  }
}

function showError(err) {
  console.error(err);
  document
    .getElementById("departures")
    .replaceChildren(makeMessageCard("Erro ao carregar os horários."));
  document.getElementById("clock-note").textContent += ` · Erro: ${err.message}`;
}

// ---------- Data ----------
// Downloads every CSV once, in parallel. Returns { file: text }.
async function loadTexts() {
  const entries = await Promise.all(
    LINES.map(async (cfg) => {
      const response = await fetch(cfg.file);
      if (!response.ok) throw new Error(`${cfg.file}: ${response.status}`);
      return [cfg.file, await response.text()];
    })
  );
  return Object.fromEntries(entries);
}

// Builds the flat departure list for one direction.
function buildDepartures(texts, dir) {
  const list = [];
  for (const cfg of LINES) {
    const stop = cfg.stops[dir];
    if (!stop) continue; // line not used in this direction

    const times = extractTimes(texts[cfg.file], stop);
    if (times === null) {
      throw new Error(`${cfg.file}: paragem "${stop}" não encontrada`);
    }
    for (const minutes of times) list.push({ minutes, line: cfg.line, stop });
  }
  return list;
}

// Recomputes and redraws. No downloads, so it's instant.
function update() {
  showClockNote();
  updateButtons();
  try {
    const departures = buildDepartures(csvTexts, direction);
    renderResult(getNextDepartures(departures, now, CARD_COUNT));
  } catch (err) {
    showError(err);
  }
}

// Re-reads the clock, goes back to the automatic direction, redraws.
function refresh() {
  now = getNow();
  direction = chooseDirection(now);
  if (csvTexts) update();
}

// ---------- Start ----------
document.getElementById("direction").addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn || !csvTexts) return; // ignore clicks before the data has loaded
  direction = btn.dataset.dir;
  update();
});

// Fires when you come back to the app (switch apps, unlock the phone...)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});

async function start() {
  now = getNow();
  direction = chooseDirection(now);
  try {
    csvTexts = await loadTexts();
  } catch (err) {
    showClockNote();
    showError(err);
    return;
  }
  update();
}

start();