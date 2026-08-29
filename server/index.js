import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { getDb } from "./db/connection.js";
import { createEvent, listEvents } from "./db/events.js";
import { getProjection, getReference } from "./db/read.js";
import { listObligations, getObligation, listSettlingEvents } from "./db/obligations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const clientDist = path.join(__dirname, "..", "client", "dist");

const RESOURCES = new Set([
  "calendar",
  "deities",
  "locations",
  "introduction",
  "buildings",
  "settlements",
  "stats",
  "history",
]);

function dataPath(resource) {
  return path.join(dataDir, `${resource}.json`);
}

async function readResource(resource) {
  const raw = await readFile(dataPath(resource), "utf-8");
  return JSON.parse(raw);
}

async function writeResource(resource, value) {
  await writeFile(dataPath(resource), JSON.stringify(value, null, 2) + "\n", "utf-8");
}

const app = express();
app.use(express.json({ limit: "2mb" }));

// --- Database-backed API (Phase 1: additive, alongside the JSON-file routes below.
// The client keeps reading/writing data/*.json directly until Phase 2's cutover;
// see .scratch/campaign-database/spec.md. Registered before the old /api/:resource
// catch-all below since Express matches routes in registration order, and /api/events
// and /api/obligations would otherwise be swallowed by it. ---

app.get("/api/events", (req, res) => {
  const { type, region, from, to, limit } = req.query;
  try {
    const events = listEvents(getDb(), {
      type,
      region,
      from: from != null ? Number(from) : undefined,
      to: to != null ? Number(to) : undefined,
      limit: limit != null ? Number(limit) : undefined,
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/events", (req, res) => {
  try {
    const result = createEvent(getDb(), req.body);
    if (!result.ok) return res.status(400).json({ errors: result.errors });
    res.status(201).json({ event: result.event, warnings: result.warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PROJECTION_RESOURCES = new Set(["stats", "settlements", "calendar", "deities", "locations"]);

app.get("/api/projections/:resource", (req, res) => {
  if (!PROJECTION_RESOURCES.has(req.params.resource)) {
    return res.status(404).json({ error: `Unknown projection: ${req.params.resource}` });
  }
  try {
    res.json(getProjection(getDb(), req.params.resource));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const REFERENCE_RESOURCES = new Set(["buildings", "introduction"]);

app.get("/api/reference/:resource", (req, res) => {
  if (!REFERENCE_RESOURCES.has(req.params.resource)) {
    return res.status(404).json({ error: `Unknown reference resource: ${req.params.resource}` });
  }
  try {
    res.json(getReference(getDb(), req.params.resource));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/obligations", (req, res) => {
  try {
    const { satisfied } = req.query;
    res.json(listObligations(getDb(), {
      satisfied: satisfied === undefined ? undefined : satisfied === "true",
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/obligations/:id", (req, res) => {
  try {
    const obligation = getObligation(getDb(), Number(req.params.id));
    if (!obligation) return res.status(404).json({ error: "Not found" });
    const settlingEvents = listSettlingEvents(getDb(), obligation.id);
    res.json({ ...obligation, settlingEvents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.param("resource", (req, res, next, resource) => {
  if (!RESOURCES.has(resource)) {
    return res.status(404).json({ error: `Unknown resource: ${resource}` });
  }
  next();
});

app.get("/api/:resource", async (req, res) => {
  try {
    res.json(await readResource(req.params.resource));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/:resource", async (req, res) => {
  try {
    await writeResource(req.params.resource, req.body);
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/history", async (req, res) => {
  try {
    const entries = await readResource("history");
    const nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    const entry = { id: nextId, ...req.body };
    entries.push(entry);
    await writeResource("history", entries);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/history/:id", async (req, res) => {
  try {
    const entries = await readResource("history");
    const id = Number(req.params.id);
    const filtered = entries.filter((e) => e.id !== id);
    await writeResource("history", filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the built client in production.
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Wilderweb server listening on http://localhost:${port}`);
});
