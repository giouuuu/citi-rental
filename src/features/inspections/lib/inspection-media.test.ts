import { describe, expect, it } from "vitest";

import {
  galleryMedia,
  isInspectionMediaPath,
  isVideoPath,
} from "@/features/inspections/lib/inspection-media";
import type { InspectionPhoto } from "@/features/inspections/types/inspection";

const rentalId = "7b1f0c7e-1d1a-4e43-9a8e-0f3d2b6a9c11";

describe("isInspectionMediaPath", () => {
  it("accepts photos and MP4s inside the rental's folder", () => {
    expect(isInspectionMediaPath(`${rentalId}/other-abc123.jpg`, rentalId)).toBe(true);
    expect(isInspectionMediaPath(`${rentalId}/other-abc123.mp4`, rentalId)).toBe(true);
  });

  it("rejects another rental's folder, nested paths and unknown types", () => {
    expect(isInspectionMediaPath(`other-rental/other-1.jpg`, rentalId)).toBe(false);
    expect(isInspectionMediaPath(`${rentalId}/../x/other-1.jpg`, rentalId)).toBe(false);
    expect(isInspectionMediaPath(`${rentalId}/other-1.exe`, rentalId)).toBe(false);
    expect(isInspectionMediaPath(`${rentalId}/other-1.mov`, rentalId)).toBe(false);
  });
});

describe("isVideoPath", () => {
  it("tells videos from photos by extension", () => {
    expect(isVideoPath("r/other-1.mp4")).toBe(true);
    expect(isVideoPath("r/other-1.MP4?token=x")).toBe(true);
    expect(isVideoPath("r/other-1.jpg")).toBe(false);
  });
});

describe("galleryMedia", () => {
  it("drops the signature and damage close-ups, keeps older fixed angles", () => {
    const photo = (kind: InspectionPhoto["kind"]): InspectionPhoto => ({
      id: kind,
      storagePath: `r/${kind}.jpg`,
      kind,
      caption: null,
      itemId: null,
    });
    const kinds = galleryMedia([
      photo("signature"),
      photo("damage_closeup"),
      photo("overview_front"),
      photo("other"),
    ]).map((entry) => entry.kind);
    expect(kinds).toEqual(["overview_front", "other"]);
  });
});
