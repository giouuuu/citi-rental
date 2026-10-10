import { ImageResponse } from "next/og";

import { getPublicVehicle } from "@/features/booking/services/public-booking-service";
import { vehicleSeoTitle } from "@/features/seo/lib/vehicle-title";
import { formatPhp } from "@/features/shared/lib/money";

export const alt = "Car for rent in Cebu — Zeke Car Rental & Services";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** A shared car link previews that car: its cutout or photo, name, and rate. */
export default async function Image({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const vehicle = await getPublicVehicle(vehicleId);
  const carImage = vehicle?.showcase_image_url ?? vehicle?.photo_url ?? null;
  const cutout = Boolean(vehicle?.showcase_image_url);
  const title = vehicle ? vehicleSeoTitle(vehicle) : "Car rental in Cebu";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background:
          "linear-gradient(160deg, #dce9f5 0%, #f1f6fb 55%, #ffffff 100%)",
        fontSize: 32,
        color: "#07111f",
      }}
    >
      <div
        style={{
          width: 520,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 0 0 64px",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#0f766e",
            letterSpacing: 2,
          }}
        >
          ZEKE CAR RENTAL & SERVICES · CEBU
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>
        {vehicle ? (
          <div style={{ marginTop: 10, fontSize: 30, color: "#3b4a5c" }}>
            {[
              vehicle.year,
              vehicle.seating_capacity
                ? `${vehicle.seating_capacity} seats`
                : null,
              vehicle.transmission,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        ) : null}
        {vehicle ? (
          <div
            style={{
              marginTop: 32,
              display: "flex",
              alignItems: "baseline",
              alignSelf: "flex-start",
              padding: "14px 26px",
              borderRadius: 999,
              background: "#0f766e",
              color: "#ffffff",
            }}
          >
            <span style={{ fontSize: 44, fontWeight: 700 }}>
              {formatPhp(vehicle.daily_rate)}
            </span>
            <span style={{ marginLeft: 8, fontSize: 26 }}>/ day</span>
          </div>
        ) : null}
        <div style={{ marginTop: 28, fontSize: 24, color: "#3b4a5c" }}>
          Self-drive or with driver · Book online
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: cutout ? "40px 40px 40px 0" : "48px 48px 48px 0",
        }}
      >
        {carImage ? (
          <img
            alt=""
            src={carImage}
            style={{
              width: "100%",
              height: "100%",
              objectFit: cutout ? "contain" : "cover",
              borderRadius: cutout ? 0 : 28,
            }}
          />
        ) : null}
      </div>
    </div>,
    size,
  );
}
