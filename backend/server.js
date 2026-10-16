/**
 * GMCH Pharmacology Department Website — Backend Server
 * ------------------------------------------------------
 * Zero-dependency Node.js server. No npm install required.
 *
 * Run from the website root folder:
 *     node backend/server.js
 * Then open http://localhost:8080 in a browser.
 *
 * What it does:
 *   1. Serves the website files (index.html, index.css, index.js, assets/)
 *   2. POST /api/adr        — receives Adverse Drug Reaction reports and
 *                             appends them to backend/data/adr-reports.json
 *   3. GET  /api/adr?key=…  — lists all stored reports (admin key required)
 *   4. GET  /admin?key=…    — simple HTML dashboard of received reports
 *
 * The admin key defaults to "gmch-pharma-admin" — change it below or set
 * the ADMIN_KEY environment variable before starting the server.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const ADMIN_KEY = process.env.ADMIN_KEY || "gmch-pharma-admin";

const SITE_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const REPORTS_FILE = path.join(DATA_DIR, "adr-reports.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf"
};

// ---------- Helpers ----------

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]", "utf8");
}

function readReports() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeReports(reports) {
  ensureDataFile();
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), "utf8");
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAuthorized(url) {
  return url.searchParams.get("key") === ADMIN_KEY;
}

// ---------- Request Handlers ----------

function handleAdrSubmit(req, res) {
  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 100 * 1024) req.destroy(); // reject oversized payloads
  });
  req.on("end", () => {
    let report;
    try {
      report = JSON.parse(body);
    } catch {
      return sendJSON(res, 400, { ok: false, error: "Invalid JSON" });
    }

    const patientName = String(report.patientName || "").trim().slice(0, 200);
    const suspectedDrug = String(report.suspectedDrug || "").trim().slice(0, 300);
    const adrDetails = String(report.adrDetails || "").trim().slice(0, 5000);
    const contact = String(report.contact || "").trim().slice(0, 200);

    if (!patientName || !suspectedDrug || !adrDetails) {
      return sendJSON(res, 400, { ok: false, error: "Missing required fields" });
    }

    const reports = readReports();
    const entry = {
      id: reports.length + 1,
      patientName,
      suspectedDrug,
      adrDetails,
      contact,
      submittedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString()
    };
    reports.push(entry);
    writeReports(reports);

    console.log(`[ADR] Report #${entry.id} received — drug: ${suspectedDrug}`);
    sendJSON(res, 201, { ok: true, id: entry.id });
  });
}

function handleAdrList(res, url) {
  if (!isAuthorized(url)) {
    return sendJSON(res, 401, { ok: false, error: "Unauthorized. Append ?key=YOUR_ADMIN_KEY" });
  }
  sendJSON(res, 200, { ok: true, reports: readReports() });
}

function handleAdminPage(res, url) {
  if (!isAuthorized(url)) {
    res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
    return res.end("<h2>Unauthorized</h2><p>Open this page as: <code>/admin?key=YOUR_ADMIN_KEY</code></p>");
  }

  const reports = readReports();
  const rows = reports.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${escapeHTML(r.patientName)}</td>
      <td>${escapeHTML(r.suspectedDrug)}</td>
      <td>${escapeHTML(r.adrDetails)}</td>
      <td>${escapeHTML(r.contact || "—")}</td>
      <td>${new Date(r.receivedAt).toLocaleString("en-IN")}</td>
    </tr>`).join("");

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADR Reports — Admin | Pharmacology GMCH</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #f4f7fb; color: #16324f; }
    h1 { font-size: 22px; }
    .count { background: #133a6a; color: #fff; padding: 4px 12px; border-radius: 999px; font-size: 14px; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    th, td { border: 1px solid #dde5ef; padding: 10px 12px; text-align: left; font-size: 14px; vertical-align: top; }
    th { background: #133a6a; color: #fff; }
    tr:nth-child(even) td { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Adverse Drug Reaction Reports <span class="count">${reports.length} total</span></h1>
  <p>Department of Pharmacology, GMCH Chhatrapati Sambhajinagar — PvPi Monitoring Centre</p>
  <table>
    <thead><tr><th>#</th><th>Patient</th><th>Suspected Drug</th><th>Description</th><th>Contact</th><th>Received</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">No reports received yet.</td></tr>'}</tbody>
  </table>
</body>
</html>`);
}

function serveStatic(res, urlPath, headOnly = false) {
  let filePath = urlPath === "/" ? "/index.html" : urlPath;
  filePath = path.normalize(path.join(SITE_ROOT, filePath));

  // Prevent path traversal outside the site root and access to backend data
  if (!filePath.startsWith(SITE_ROOT) || filePath.startsWith(path.join(SITE_ROOT, "backend"))) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end("<h2>404 — Page not found</h2><p><a href='/'>Return to homepage</a></p>");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": data.length
    });
    res.end(headOnly ? undefined : data);
  });
}

// ---------- Server ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/adr" && req.method === "POST") return handleAdrSubmit(req, res);
  if (url.pathname === "/api/adr" && req.method === "GET") return handleAdrList(res, url);
  if (url.pathname === "/admin" && req.method === "GET") return handleAdminPage(res, url);
  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(res, url.pathname, req.method === "HEAD");
  }

  res.writeHead(405);
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log("==========================================================");
  console.log("  GMCH Pharmacology Department Website — Server running");
  console.log(`  Website : http://localhost:${PORT}`);
  console.log(`  Admin   : http://localhost:${PORT}/admin?key=${ADMIN_KEY}`);
  console.log(`  Reports : ${REPORTS_FILE}`);
  console.log("==========================================================");
});
