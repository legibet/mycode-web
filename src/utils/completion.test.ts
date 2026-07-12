import { describe, expect, it } from "vitest";
import { matchSlashCommands } from "./completion";

describe("matchSlashCommands", () => {
  it("lists all commands for a bare slash", () => {
    expect(matchSlashCommands("/").map((c) => c.name)).toEqual([
      "/new",
      "/clear",
    ]);
  });

  it("filters by prefix", () => {
    expect(matchSlashCommands("/c").map((c) => c.name)).toEqual(["/clear"]);
    expect(matchSlashCommands("/new").map((c) => c.name)).toEqual(["/new"]);
  });

  it("returns nothing for unknown or path-like slashes", () => {
    expect(matchSlashCommands("/usr/local")).toEqual([]);
    expect(matchSlashCommands("/xyz")).toEqual([]);
  });

  it("stays closed once the input has a space or extra text", () => {
    expect(matchSlashCommands("/new ")).toEqual([]);
    expect(matchSlashCommands("hello /new")).toEqual([]);
    expect(matchSlashCommands("/api/chat returns 400")).toEqual([]);
  });

  it("marks /clear as needing confirmation", () => {
    expect(matchSlashCommands("/clear")[0]?.confirm).toBe(true);
    expect(matchSlashCommands("/new")[0]?.confirm).toBeUndefined();
  });
});
