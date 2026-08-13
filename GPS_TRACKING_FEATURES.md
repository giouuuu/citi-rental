# GPS Tracking — Deferred Specification

**Status: PARKED. Do not build from this document.**

Everything GPS-related was moved out of `APPLICATION_FEATURES.md` so the build can focus on the
rental product first. This file is the archive of that scope: read it when tracking work is
explicitly picked back up, not before.

**Current rule:** while this document is parked, do not add new GPS/tracking features, new
telemetry columns, or new Traccar integration code. Code that already exists for tracking
(`src/features/tracking`, `src/features/devices`, `src/features/geofences`,
`src/features/alerts`, and the `map`, `devices`, `geofences`, `alerts` routes under
`app/(protected)`) stays as-is — keep it compiling, fix bugs if it breaks a rental flow, but do
not extend it. See `APPLICATION_FEATURES.md` for what is actually in scope.

Prerequisite for un-parking: the rental core (vehicles, customers, rentals, booking) is stable
and in daily use, and the physical SinoTrack hardware model and protocol are confirmed.

---

## 1. Architecture (when this resumes)

```text
SinoTrack GPS Device
        |
        | Cellular TCP connection
        v
Traccar Server
        |
        | REST API / WebSocket / Event Forwarding
        v
Integration Worker or Supabase Edge Function
        |
        v
Supabase PostgreSQL + Realtime
        |
        v
Next.js Web Application
```

### Responsibility boundaries

**Traccar**
- Receive GPS messages.
- Decode the device protocol.
- Maintain the latest device position.
- Store raw position history.
- Generate geofence and device events.

**Supabase**
- Application-level location records.
- Alert history.
- Geofence configuration used by the rental business.
- Realtime updates for the frontend.

**Web application**
- Maps.
- Tracking pages.
- Alert acknowledgement.
- Tracking reports.

### Tracker connection status

- `online` — last update within 5 minutes.
- `delayed` — last update between 5 and 15 minutes.
- `offline` — last update older than 15 minutes.
- `unknown` — never reported.

Thresholds must be configurable. Existing helper: `lib/fleet/tracker-status.ts`.

---

## 2. GPS Device Management

Device fields:
- Internal UUID.
- Traccar device ID.
- Device unique identifier or IMEI.
- Device name.
- SinoTrack model.
- Protocol.
- Traccar server reference.
- SIM phone number.
- SIM network.
- Assigned vehicle.
- Installation date.
- Last communication timestamp.
- Current status.
- Notes.
- Is active.

Features:
- Register a GPS device.
- Assign a device to a vehicle.
- Unassign a device.
- Test the Traccar connection.
- Sync a device from Traccar.
- Display raw latest position for debugging.
- Display whether ignition, battery, voltage, or alarm fields are available.
- Prevent duplicate IMEI/device identifiers.

Important:
- The exact SinoTrack hardware model is not yet confirmed.
- Implement optional telemetry fields.
- The application must continue working when a field such as ignition or battery level is
  unavailable.

Validation carried over from the vehicle spec:
- A GPS device may be assigned to only one active vehicle.

---

## 3. Live Fleet Map

Features:
- Show all active vehicles on a map.
- Marker icon or badge reflects moving, parked, delayed, or offline status.
- Click a marker to show: vehicle name, plate number, current renter, speed, ignition when
  available, last update, current address when reverse geocoding is available, and an open
  vehicle details button.
- Filter by vehicle status, GPS status, active rental, and vehicle category.
- Automatically update markers through Supabase Realtime.
- Fit map bounds to visible vehicles.
- Provide list view as an alternative to the map.

Do not continuously reverse-geocode every incoming location. Cache addresses or request them
only when a user opens a vehicle detail panel.

---

## 4. Vehicle Tracking Page

Display:
- Current or last-known marker.
- Full route line for a selected time range.
- Start and end markers.
- Direction and speed when available.
- Stops.
- Distance traveled.
- Maximum speed.
- Average speed.
- First and last GPS timestamps.
- Current rental information.
- Geofence overlays.
- Tracking event timeline.

Time filters: last hour · today · last 24 hours · custom date and time · active rental period.

Acceptance criteria:
- Route points are ordered by device timestamp.
- Duplicate points are removed or ignored.
- Route history handles missing GPS periods.
- Large histories are paginated or downsampled to avoid freezing the browser.
- User can distinguish the GPS timestamp from the database ingestion timestamp.
- The UI must show last-known position rather than falsely labeling stale data as live.
- Tracking history displayed for a rental must use the rental time window.

---

## 5. Geofencing

Supported shapes: circle, polygon.

Geofence fields:
- Internal UUID.
- Name.
- Description.
- Shape type.
- Center latitude and longitude for circles.
- Radius in meters for circles.
- GeoJSON geometry for polygons.
- Geofence type.
- Is active.
- Created by.
- Created and updated timestamps.

Geofence types: `allowed_area` · `restricted_area` · `branch` · `pickup_zone` · `return_zone`.

Features:
- Draw geofence on map.
- Edit geofence.
- Delete or disable geofence.
- Assign geofence to a vehicle.
- Assign geofence to a rental.
- Set alert on entry, exit, or both.
- Display geofence overlays on tracking pages.

Alert behavior:
- Allowed area: alert when vehicle exits.
- Restricted area: alert when vehicle enters.
- Branch or return zone: record arrival event.
- Debounce repeated alerts so the same boundary crossing does not create excessive duplicates.

For the initial implementation, Traccar may perform the geofence calculation. Supabase stores
the normalized event and business-level acknowledgement state.

---

## 6. Alerts and Events

Event types:
`geofence_enter` · `geofence_exit` · `tracker_offline` · `tracker_online` · `overspeed` ·
`unauthorized_movement` · `ignition_on` · `ignition_off` · `power_disconnected` ·
`rental_overdue` · `device_alarm` · `system_error`

> `rental_overdue` is the one event type the rental scope also needs. It is specified in
> `APPLICATION_FEATURES.md` and must not depend on any GPS device being present.

Event fields:
- Internal UUID.
- Vehicle.
- GPS device.
- Rental when applicable.
- Event type.
- Severity (`info` / `warning` / `critical`).
- Event timestamp.
- Latitude.
- Longitude.
- Speed.
- Geofence.
- Raw Traccar event ID.
- Raw attributes JSON.
- Is acknowledged.
- Acknowledged by.
- Acknowledged at.
- Resolution note.
- Created timestamp.

Features:
- Alert inbox.
- Filter by type, status, severity, vehicle, and date.
- Acknowledge alert.
- Add resolution note.
- Open alert location on map.
- Link alert to related vehicle and rental.
- Show unresolved-alert count in navigation.
- In-app realtime notifications.

MVP notification channels: in-app, optional email.
Future channels: SMS, push, WhatsApp or Telegram.

---

## 7. Tracking Reports

- Vehicle trip history.
- Distance traveled per rental.
- Geofence violations.
- Offline tracker report.
- Overspeed events when speed is supported.

---

## 8. Location Schema

Tables owned by this scope:

```text
gps_devices
vehicle_latest_locations
vehicle_location_history
geofences
vehicle_geofences
rental_geofences
tracking_events
integration_sync_logs
```

Constraints:
- Unique GPS identifier per organization.
- One active GPS device assignment per vehicle.
- One active vehicle assignment per GPS device.
- Latest location must have one row per vehicle.
- Traccar event ID should be unique when present.
- History inserts must be idempotent using a source position ID or a composite uniqueness rule.

`vehicle_latest_locations` columns:
`vehicle_id` · `gps_device_id` · `latitude` · `longitude` · `altitude` · `speed_kph` ·
`heading` · `accuracy_meters` · `ignition` · `motion` · `external_power` · `battery_level` ·
`alarm_type` · `gps_valid` · `device_time` · `server_time` · `received_at` ·
`raw_attributes jsonb`

`vehicle_location_history`:
- Same telemetry fields.
- Source Traccar position ID.
- Rental ID when known.
- Geospatial point column if PostGIS is enabled.

---

## 9. Traccar Integration

Create an abstraction layer named something similar to `GpsProvider`.

Required methods:
- `listDevices()`
- `getDevice(deviceId)`
- `getLatestPosition(deviceId)`
- `getPositions(deviceId, from, to)`
- `getEvents(deviceId, from, to)`
- `createOrUpdateGeofence(data)`
- `assignGeofence(deviceId, geofenceId)`
- `testConnection()`

Implement `TraccarGpsProvider` and `SimulatorGpsProvider`. Do not couple frontend components
directly to Traccar response formats. Do not call Traccar directly from the browser.

### Synchronization

1. Read the latest positions from Traccar.
2. Match Traccar devices to `gps_devices`.
3. Upsert `vehicle_latest_locations`.
4. Insert new historical positions idempotently.
5. Normalize Traccar events into `tracking_events`.
6. Record failures in `integration_sync_logs`.
7. Avoid inserting duplicates after retries.

### Sync strategy

Support either polling Traccar every 5–15 seconds from a long-running integration worker, or
receiving Traccar event forwarding/webhooks where practical. A Supabase Edge Function should
not be used as a permanent raw TCP listener for the GPS device — Traccar remains the GPS
protocol server.

### Reliability

- Position synchronization must be idempotent.
- Temporary Traccar or network failure must not crash the application.
- Failed synchronization must be retried with backoff.
- Display the last successful synchronization time.
- Log sync start, completion, count, and errors; store integration error summaries; provide a
  basic integration-health panel.

---

## 10. GPS Simulator Mode

Simulator features:
- Create a fake GPS device.
- Select a vehicle.
- Choose a starting coordinate.
- Play a predefined route.
- Configure update interval.
- Configure simulated speed.
- Pause and resume.
- Simulate tracker offline.
- Simulate geofence entry and exit.
- Simulate ignition on and off.
- Write data through the same normalized application interface as Traccar.

The simulator must make it possible to demonstrate the full tracking scope without changing the
physical SinoTrack server settings.

---

## 11. Pages Owned By This Scope

- `/vehicles/[id]/tracking`
- `/devices`
- `/devices/[id]`
- `/map`
- `/geofences`
- `/geofences/new`
- `/geofences/[id]`
- `/alerts`
- `/alerts/[id]`
- `/settings/integrations`

---

## 12. Privacy and Data Retention

- Record that the customer accepted GPS tracking disclosure (timestamp + accepted disclosure
  version).
- Show tracking only to authorized staff.
- Keep an audit trail of sensitive access where practical.
- Support configurable location-history retention.
- Avoid exposing exact route history to unauthorized users.
- Clearly identify that GPS locations may be delayed or inaccurate.
- Keep detailed tracking history for a configurable number of days; keep summarized rental
  metrics longer than raw GPS points.

Security requirements specific to this scope:
- Never expose Traccar administrator credentials in the browser.
- Only administrators can edit GPS integration configuration.
- Audit device reassignment and alert resolution.

---

## 13. Environment Variables

```env
GPS_PROVIDER=simulator
TRACCAR_BASE_URL=http://localhost:8082
TRACCAR_USERNAME=
TRACCAR_PASSWORD=
TRACCAR_API_TOKEN=

TRACKER_ONLINE_THRESHOLD_MINUTES=5
TRACKER_DELAYED_THRESHOLD_MINUTES=15
LOCATION_RETENTION_DAYS=90
```

---

## 14. Milestones (when un-parked)

### T1: Tracking data foundation
- Add latest-location and history tables.
- Implement GPS provider abstraction.
- Implement simulator provider.
- Build live fleet map.
- Build vehicle tracking page.
- Add Realtime subscriptions.

### T2: Traccar integration
- Configure Traccar credentials server-side.
- Implement device and position synchronization.
- Normalize telemetry.
- Add sync logs and retries.
- Map devices to vehicles.
- Verify physical tracker once the model and protocol are confirmed.

### T3: Geofences and alerts
- Geofence CRUD with map drawing.
- Vehicle/rental geofence assignment.
- Normalize geofence events.
- Alert inbox.
- Realtime alert notifications.
- Acknowledge and resolve workflow.

### T4: Tracking reports and hardening
- Tracking reports and CSV export.
- Performance indexes on device/timestamp/event-type columns.
- Integration health panel.
- Tests for GPS normalization and status calculations.

### Definition of done for the tracking scope

An administrator can register and assign a GPS device, see the vehicle's current or simulated
position on the fleet map, open the vehicle and view its recent route, create an allowed-area
geofence, receive a geofence-exit event, acknowledge it, see tracker-offline status when
updates stop, and view the route and events associated with a completed rental.
