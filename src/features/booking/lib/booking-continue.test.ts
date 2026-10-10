import { describe, expect, it } from "vitest";

import { bookingFormPath } from "./booking-continue";

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
