import { describe, expect, it } from "vitest";

import { bookingFormPath, fullQueryString, vehiclePageKey } from "./booking-continue";

describe("booking links", () => {
  it("carry the trip and a with-driver choice", () => {
    expect(
      bookingFormPath("car", {
        pickup: "Mactan Airport",
        start: "2026-11-02",
        end: "2026-11-04",
        mode: "with-driver",
      }),
    ).toBe(
      "/book/car?pickup=Mactan+Airport&start=2026-11-02&end=2026-11-04&mode=with-driver",
    );
  });

  it("leave self-drive out, since it is the default", () => {
    expect(bookingFormPath("car", { mode: "self-drive" })).toBe("/book/car");
  });
});

describe("car page links", () => {
  it("uses the car's slug, falling back to its id", () => {
    expect(vehiclePageKey({ id: "0f8b3c1e", slug: "vios-automatic-red" })).toBe("vios-automatic-red");
    expect(vehiclePageKey({ id: "0f8b3c1e", slug: null })).toBe("0f8b3c1e");
  });

  it("keeps every query param through a redirect", () => {
    expect(fullQueryString({ start: "2026-10-20T10:00", utm_source: "fb", tag: ["a", "b"], x: undefined })).toBe(
      "?start=2026-10-20T10%3A00&utm_source=fb&tag=a&tag=b",
    );
    expect(fullQueryString({})).toBe("");
  });
});
