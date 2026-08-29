import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

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
