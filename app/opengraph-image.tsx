import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const alt =
  "Zeke Car Rentals — car rental in Cebu, self-drive or with driver";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview on Facebook, Messenger, and Google: road scene + logo. */
export default async function Image() {
  const [scene, logo] = await Promise.all([
    readFile(join(process.cwd(), "public/scene.jpeg"), "base64"),
    readFile(
      join(process.cwd(), "public/brand/zeke-logo-refined.png"),
      "base64",
    ),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
      }}
    >
      <img
        alt=""
        height={630}
        src={`data:image/jpeg;base64,${scene}`}
        style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        width={1200}
      />
      <div
        style={{
          position: "absolute",
          left: 56,
          top: 56,
          display: "flex",
          flexDirection: "column",
          padding: "36px 44px",
          borderRadius: 28,
          background: "rgba(255,255,255,0.92)",
          boxShadow: "0 24px 60px rgba(7,17,31,0.25)",
        }}
      >
        <img
          alt=""
          height={150}
          src={`data:image/png;base64,${logo}`}
          width={450}
        />
        <div
          style={{
            marginTop: 18,
            fontSize: 52,
            fontWeight: 700,
            color: "#07111f",
            letterSpacing: -1,
          }}
        >
          Car rental in Cebu
        </div>
        <div style={{ marginTop: 8, fontSize: 28, color: "#3b4a5c" }}>
          Self-drive or with driver · Airport, hotel, or city pickup
        </div>
      </div>
    </div>,
    size,
  );
}
