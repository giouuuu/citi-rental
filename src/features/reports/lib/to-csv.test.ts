import { describe, expect, it } from "vitest";

import { toCsv } from "./to-csv";

describe("toCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("writes a quoted header row from the first row's keys", () => {
    expect(toCsv([{ id: "1", name: "Vios" }])).toBe('"id","name"\n"1","Vios"');
  });

  it("doubles embedded quotes", () => {
    expect(toCsv([{ note: 'He said "fine"' }])).toBe(
      '"note"\n"He said ""fine"""',
    );
  });

  it("keeps commas and newlines inside the quoted cell", () => {
    expect(toCsv([{ note: "Cebu, PH\nsecond line" }])).toBe(
      '"note"\n"Cebu, PH\nsecond line"',
    );
  });

  it("renders null and undefined as empty cells", () => {
    expect(toCsv([{ a: null, b: undefined }])).toBe('"a","b"\n"",""');
  });

  it("JSON-stringifies object cells", () => {
    expect(toCsv([{ meta: { k: 1 } }])).toBe('"meta"\n"{""k"":1}"');
  });

  it("uses the first row's key order for every row", () => {
    expect(
      toCsv([
        { a: 1, b: 2 },
        { b: 4, a: 3 },
      ]),
    ).toBe('"a","b"\n"1","2"\n"3","4"');
  });
});
