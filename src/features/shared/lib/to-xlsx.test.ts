import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { toXlsx, xlsxCellValue } from "./to-xlsx";

describe("xlsxCellValue", () => {
  it("keeps money and numbers numeric", () => {
    expect(xlsxCellValue("1250.5", "money")).toBe(1250.5);
    expect(xlsxCellValue(3, "number")).toBe(3);
  });

  it("writes timestamps as Philippine wall-clock time", () => {
    const value = xlsxCellValue("2026-10-07T01:30:00Z", "datetime") as Date;
    expect(value.toISOString()).toBe("2026-10-07T09:30:00.000Z");
  });

  it("writes a bare date key as that calendar day", () => {
    const value = xlsxCellValue("2026-10-07", "date") as Date;
    expect(value.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("spells out booleans and statuses, and blanks empties", () => {
    expect(xlsxCellValue(true, "boolean")).toBe("Yes");
    expect(xlsxCellValue("due_soon", "status")).toBe("Due soon");
    expect(xlsxCellValue("", "text")).toBeNull();
  });
});

describe("toXlsx", () => {
  it("writes headers and typed rows, dropping image columns", async () => {
    const buffer = await toXlsx([
      {
        name: "Vehicles",
        columns: [
          { key: "photo_url", header: "Photo", format: "image" },
          { key: "name", header: "Vehicle" },
          { key: "daily_rate", header: "Daily rate", format: "money" },
        ],
        rows: [{ photo_url: "x.jpg", name: "Vios", daily_rate: "1800" }],
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet("Vehicles")!;
    expect(sheet.getRow(1).values).toEqual([, "Vehicle", "Daily rate"]);
    expect(sheet.getRow(2).values).toEqual([, "Vios", 1800]);
  });
});
