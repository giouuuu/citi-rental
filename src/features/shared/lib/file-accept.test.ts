import { describe, expect, it } from "vitest";

import {
  assignFilesToSlots,
  fileMatchesAccept,
  fillSlotsFrom,
} from "./file-accept";

const file = (name: string, type: string) => new File(["x"], name, { type });

describe("fileMatchesAccept", () => {
  it("accepts anything without an accept string", () => {
    expect(fileMatchesAccept(file("a.pdf", "application/pdf"))).toBe(true);
  });

  it("matches exact MIME types", () => {
    const accept = "image/jpeg,image/png";
    expect(fileMatchesAccept(file("a.png", "image/png"), accept)).toBe(true);
    expect(fileMatchesAccept(file("a.gif", "image/gif"), accept)).toBe(false);
  });

  it("matches wildcards", () => {
    expect(fileMatchesAccept(file("a.heic", "image/heic"), "image/*")).toBe(true);
    expect(fileMatchesAccept(file("a.pdf", "application/pdf"), "image/*")).toBe(
      false,
    );
  });

  it("matches extensions", () => {
    expect(fileMatchesAccept(file("a.WEBP", ""), ".webp")).toBe(true);
  });

  it("falls back to the extension when the browser reports no type", () => {
    expect(fileMatchesAccept(file("IMG_1.HEIC", ""), "image/heic")).toBe(true);
    expect(fileMatchesAccept(file("notes.txt", ""), "image/heic")).toBe(false);
  });
});

describe("fillSlotsFrom", () => {
  const slots = ["front", "rear", "left", "right"] as const;
  const [a, b, c] = [file("a.jpg", ""), file("b.jpg", ""), file("c.jpg", "")];

  it("fills the dropped slot then the empty ones after it", () => {
    expect(
      fillSlotsFrom({ slots, start: "rear", files: [a, b], current: {} }),
    ).toEqual({ rear: a, left: b });
  });

  it("skips slots that already hold a file", () => {
    const existing = file("x.jpg", "");
    expect(
      fillSlotsFrom({
        slots,
        start: "front",
        files: [a, b, c],
        current: { rear: existing },
      }),
    ).toEqual({ front: a, rear: existing, left: b, right: c });
  });

  it("replaces the dropped slot and discards overflow", () => {
    const existing = file("x.jpg", "");
    expect(
      fillSlotsFrom({
        slots,
        start: "right",
        files: [a, b],
        current: { right: existing },
      }),
    ).toEqual({ right: a });
  });
});

describe("assignFilesToSlots", () => {
  const slots = ["front", "rear", "left", "right"];
  const [a, b, c] = [file("a.jpg", ""), file("b.jpg", ""), file("c.jpg", "")];

  it("skips slots the caller reports as taken", () => {
    expect(
      assignFilesToSlots({
        slots,
        start: "front",
        files: [a, b, c],
        isTaken: (slot) => slot === "rear",
      }),
    ).toEqual([
      ["front", a],
      ["left", b],
      ["right", c],
    ]);
  });

  it("always replaces the slot the files were dropped on", () => {
    expect(
      assignFilesToSlots({ slots, start: "rear", files: [a], isTaken: () => true }),
    ).toEqual([["rear", a]]);
  });
});
