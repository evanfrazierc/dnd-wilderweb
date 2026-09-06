import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "./db/connection.js";
import { createEvent, listEvents } from "./db/events.js";
import { getProjection, getReference } from "./db/read.js";
import { listObligations, getObligation, listSettlingEvents } from "./db/obligations.js";
import {
  ValidationError,
  replaceBuildingCatalog,
  replaceResourceDefinitions,
  replaceCalendarStructure,
  replaceIntroduction,
} from "./db/reference.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "client", "dist");

// Shared-password gate for public deployments. A no-op locally unless SITE_PASSWORD is set,
// so `npm run dev` stays prompt-free; set it in production to keep the table's edit access
// to people who have the password, since there's no per-user auth (see CLAUDE.md).
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function siteAuth(req, res, next) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return next();

  const user = process.env.SITE_USER || "party";
  const [scheme, encoded] = (req.headers.authorization || "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const sep = decoded.indexOf(":");
    if (sep !== -1 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)) {
      return next();
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Wilderweb", charset="UTF-8"');
  res.status(401).send("Authentication required.");
}

const app = express();
app.use(siteAuth);
app.use(express.json({ limit: "2mb" }));

app.get("/api/events", async (req, res) => {
  const { type, region, from, to, limit } = req.query;
  try {
    const events = await listEvents(await getDb(), {
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

app.post("/api/events", async (req, res) => {
  try {
    const result = await createEvent(await getDb(), req.body);
    if (!result.ok) return res.status(400).json({ errors: result.errors });
    res.status(201).json({ event: result.event, warnings: result.warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PROJECTION_RESOURCES = new Set(["stats", "settlements", "calendar", "deities", "locations"]);

app.get("/api/projections/:resource", async (req, res) => {
  if (!PROJECTION_RESOURCES.has(req.params.resource)) {
    return res.status(404).json({ error: `Unknown projection: ${req.params.resource}` });
  }
  try {
    res.json(await getProjection(await getDb(), req.params.resource));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const REFERENCE_RESOURCES = new Set(["buildings", "introduction", "resourceDefinitions", "calendarStructure"]);

app.get("/api/reference/:resource", async (req, res) => {
  if (!REFERENCE_RESOURCES.has(req.params.resource)) {
    return res.status(404).json({ error: `Unknown reference resource: ${req.params.resource}` });
  }
  try {
    res.json(await getReference(await getDb(), req.params.resource));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const REFERENCE_WRITERS = {
  buildings: (db, body) => replaceBuildingCatalog(db, body),
  resourceDefinitions: (db, body) => replaceResourceDefinitions(db, body),
  calendarStructure: (db, body) => replaceCalendarStructure(db, body),
  introduction: (db, body) => replaceIntroduction(db, body),
};

app.put("/api/reference/:resource", async (req, res) => {
  const writer = REFERENCE_WRITERS[req.params.resource];
  if (!writer) {
    return res.status(404).json({ error: `Unknown reference resource: ${req.params.resource}` });
  }
  try {
    const db = await getDb();
    await writer(db, req.body);
    res.json(await getReference(db, req.params.resource));
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/obligations", async (req, res) => {
  try {
    const { satisfied } = req.query;
    res.json(await listObligations(await getDb(), {
      satisfied: satisfied === undefined ? undefined : satisfied === "true",
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/obligations/:id", async (req, res) => {
  try {
    const db = await getDb();
    const obligation = await getObligation(db, Number(req.params.id));
    if (!obligation) return res.status(404).json({ error: "Not found" });
    const settlingEvents = await listSettlingEvents(db, obligation.id);
    res.json({ ...obligation, settlingEvents });
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
getDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Wilderweb server listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
  });
