#!/usr/bin/env node
// One-off: wilderlands-discord-export.txt (manually copy-pasted Discord channels) -> structured
// JSON, so the actual event-authoring pass can work off {channel, author, postedAt, content}
// records instead of re-parsing raw chat text. See .scratch/discord-seed/README.md.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "..", "..", "wilderlands-discord-export.txt");
const outPath = path.join(__dirname, "messages.json");

const HEADER_RE = /^(.*?) — (\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}:\d{2}) (AM|PM)$/;
const PIN_NOTICE_RE = /^ ?pinned a message to this channel\. See all pinned messages\.$/;

// Discord's "X pinned a message" system notices export as two lines (bare author name, then
// the notice text + timestamp) that would otherwise parse as a bogus empty message from an
// author literally named "The DM\npinned a message...". Strip both lines; no content is lost.
function stripPinNotices(raw) {
  return raw.replace(
    /^.+\n pinned a message to this channel\. See all pinned messages\. — \d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2} (AM|PM)\n?/gm,
    "",
  );
}

function parseTimestamp(dateStr, timeStr, ampm) {
  const [month, day, year] = dateStr.split("/").map(Number);
  let [hour, minute] = timeStr.split(":").map(Number);
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

async function main() {
  const normalized = (await readFile(srcPath, "utf-8")).replace(/\r\n/g, "\n");
  const raw = stripPinNotices(normalized);
  const lines = raw.split("\n");

  const messages = [];
  let channel = null;
  let current = null; // { channel, author, postedAt, contentLines }

  function flush() {
    if (!current) return;
    const content = current.contentLines.join("\n").replace(/^\n+|\n+$/g, "");
    if (content.trim().length > 0) {
      messages.push({
        channel: current.channel,
        author: current.author,
        postedAt: current.postedAt,
        postedAtRaw: current.postedAtRaw,
        content,
      });
    }
    current = null;
  }

  for (const line of lines) {
    const channelMatch = line.match(/^Channel: (.*)$/);
    if (channelMatch) {
      flush();
      channel = channelMatch[1].trim() || null;
      continue;
    }
    if (channel === null) continue; // preamble, if any

    const headerMatch = line.match(HEADER_RE);
    if (headerMatch) {
      flush();
      const [, author, dateStr, timeStr, ampm] = headerMatch;
      current = {
        channel,
        author: author.trim(),
        postedAt: parseTimestamp(dateStr, timeStr, ampm),
        postedAtRaw: `${dateStr} ${timeStr} ${ampm}`,
        contentLines: [],
      };
      continue;
    }

    if (current) current.contentLines.push(line);
    // A content line before any header in a channel (shouldn't happen in this export) is dropped.
  }
  flush();

  await writeFile(outPath, JSON.stringify(messages, null, 2) + "\n", "utf-8");

  const byChannel = new Map();
  for (const m of messages) byChannel.set(m.channel, (byChannel.get(m.channel) ?? 0) + 1);
  console.log(`Wrote ${messages.length} messages across ${byChannel.size} channels to ${outPath}\n`);
  for (const [ch, count] of byChannel) console.log(`  ${ch}: ${count}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
