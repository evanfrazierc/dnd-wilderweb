import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmbed, notifyDiscord } from "../../server/discord.js";

test("buildEmbed formats a ResourceChanged event", () => {
  const embed = buildEmbed({
    type: "ResourceChanged",
    region: "Stirling Reach",
    gameDate: "Erastus 4, 1227",
    note: "Trade with merchants",
    payload: { changes: { Wood: -2, Wealth: 5 } },
  });
  assert.equal(embed.title, "Resource Change");
  assert.equal(embed.footer.text, "Erastus 4, 1227");
  assert.deepEqual(embed.fields, [
    { name: "Region", value: "Stirling Reach", inline: true },
    { name: "Changes", value: "-2 Wood, +5 Wealth" },
    { name: "Note", value: "Trade with merchants" },
  ]);
});

test("buildEmbed formats a BuildingConstructed event with a display name", () => {
  const embed = buildEmbed({
    type: "BuildingConstructed",
    region: "Stirling Reach",
    gameDate: "Erastus 4, 1227",
    payload: { building: "Tower", displayName: "Anora's Roost", count: 1 },
  });
  assert.equal(embed.title, "Building Constructed");
  assert.deepEqual(embed.fields, [
    { name: "Region", value: "Stirling Reach", inline: true },
    { name: "Building", value: "Anora's Roost (Tower)", inline: true },
  ]);
});

test("buildEmbed includes count and detail for BuildingConstructed when present", () => {
  const embed = buildEmbed({
    type: "BuildingConstructed",
    region: "Stirling Reach",
    gameDate: "Erastus 4, 1227",
    payload: { building: "Farm", count: 3, detail: "Along the river" },
  });
  assert.deepEqual(embed.fields, [
    { name: "Region", value: "Stirling Reach", inline: true },
    { name: "Building", value: "Farm", inline: true },
    { name: "Count", value: "3", inline: true },
    { name: "Detail", value: "Along the river" },
  ]);
});

test("buildEmbed formats a CalendarAdvanced event", () => {
  const embed = buildEmbed({
    type: "CalendarAdvanced",
    gameDate: "Erastus 4, 1227",
    payload: { year: 1227, month: 2, day: 4 },
  });
  assert.equal(embed.title, "Calendar Advanced");
  assert.deepEqual(embed.fields, [{ name: "New Date", value: "Year 1227, Month 2, Day 4" }]);
});

test("buildEmbed formats a DeityAmended event", () => {
  const embed = buildEmbed({
    type: "DeityAmended",
    gameDate: "Erastus 4, 1227",
    payload: { name: "Pelor", changes: { confirmed: true } },
  });
  assert.equal(embed.title, "Deity Amended");
  assert.deepEqual(embed.fields, [
    { name: "Deity", value: "Pelor", inline: true },
    { name: "Changes", value: "confirmed: true" },
  ]);
});

test("buildEmbed formats a DMRuling event with just its note", () => {
  const embed = buildEmbed({
    type: "DMRuling",
    gameDate: "Erastus 4, 1227",
    note: "Clarified the trade rules",
    payload: {},
  });
  assert.equal(embed.title, "DM Ruling");
  assert.deepEqual(embed.fields, [{ name: "Note", value: "Clarified the trade rules" }]);
});

test("buildEmbed formats a LocationAmended event", () => {
  const embed = buildEmbed({
    type: "LocationAmended",
    gameDate: "Erastus 4, 1227",
    payload: { name: "Kingdom of Casdenia", changes: { capital: "Royal City of Casdenor" } },
  });
  assert.equal(embed.title, "Locations Updated");
  assert.deepEqual(embed.fields, [
    { name: "Kingdom", value: "Kingdom of Casdenia", inline: true },
    { name: "Changes", value: "capital: Royal City of Casdenor" },
  ]);
});

test("buildEmbed includes the actor when present", () => {
  const embed = buildEmbed({
    type: "DMRuling",
    gameDate: "Erastus 4, 1227",
    note: "A note",
    actor: "The DM",
    payload: {},
  });
  assert.deepEqual(embed.fields, [
    { name: "Note", value: "A note" },
    { name: "Posted by", value: "The DM", inline: true },
  ]);
});

test("notifyDiscord skips the network call when DISCORD_WEBHOOK_URL is not set", async () => {
  delete process.env.DISCORD_WEBHOOK_URL;
  const result = await notifyDiscord({ type: "DMRuling", gameDate: "x", note: "x", payload: {} });
  assert.deepEqual(result, { ok: true, skipped: true });
});

test("notifyDiscord reports failure without throwing when the webhook is unreachable", async () => {
  process.env.DISCORD_WEBHOOK_URL = "http://127.0.0.1:1"; // reserved port, connection refused
  try {
    const result = await notifyDiscord({ type: "DMRuling", gameDate: "x", note: "x", payload: {} });
    assert.equal(result.ok, false);
    assert.ok(result.error);
  } finally {
    delete process.env.DISCORD_WEBHOOK_URL;
  }
});
