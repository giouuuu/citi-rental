# Car Rental GPS Tracking Application
## Application Features and Codex Build Specification

**Document purpose:** Give this file to Codex as the implementation specification for the MVP.

---

## 1. Product Overview

Build a responsive web application for a car-rental business that allows authorized staff to:

- Register and manage rental vehicles.
- Connect each vehicle to a SinoTrack GPS device through a Traccar server.
- View current and last-known vehicle locations on a map.
- Track a vehicle's route during an active rental.
- Create geofences and receive entry/exit alerts.
- Detect vehicles whose GPS trackers have stopped reporting.
- Assign a customer and vehicle to a rental record.
- Maintain a searchable history of rentals and tracking events.

The MVP must prioritize reliable vehicle tracking over advanced rental-management features.

---

## 2. Recommended Technology Stack

### Frontend
- Next.js with TypeScript
- Tailwind CSS
- A reusable component library
- Leaflet or MapLibre for maps
- Supabase client SDK
- A query/cache library such as TanStack Query

### Backend and Data
- Supabase PostgreSQL
- Supabase Authentication
- Supabase Row Level Security
- Supabase Realtime
- Supabase Edge Functions or a small Node.js integration service

### GPS Server
- Traccar running locally during development
- Traccar deployed to a public VPS for production
- SinoTrack GPS device sends location data to Traccar
- The application reads normalized positions and events from Traccar

### Development Requirement
The application must support a **GPS simulator mode** so development can continue before the physical SinoTrack device is fully configured.

---

## 3. System Architecture

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

### Responsibility Boundaries

**Traccar**
- Receive GPS messages.
- Decode the device protocol.
- Maintain the latest device position.
- Store raw position history.
- Generate geofence and device events.

**Supabase**
- Authentication.
- Staff profiles and roles.
- Vehicles.
- Customers.
- Rentals.
- Application-level location records.
- Alert history.
- Geofence configuration used by the rental business.
- Realtime updates for the frontend.

**Web application**
- Dashboard.
- Maps.
- Rental workflow.
- Vehicle and customer management.
- Alert acknowledgement.
- Reports and history.

---

## 4. User Roles

### Administrator
Can:
- Manage users and roles.
- Manage vehicles and GPS devices.
- Manage customers and rentals.
- Create and edit geofences.
- View all live locations and tracking history.
- Configure tracking and alert settings.
- Acknowledge and resolve alerts.

### Rental Staff
Can:
- Manage customers.
- Create and update rentals.
- View vehicle location and status.
- View rental-specific route history.
- Acknowledge alerts.
- Cannot manage system users or sensitive GPS integration settings.

### Viewer
Can:
- View dashboard, vehicles, locations, rentals, and alerts.
- Cannot create, update, or delete records.

Use Supabase Row Level Security to enforce these permissions. Do not rely only on hidden frontend controls.

---

## 5. Core MVP Modules

## 5.1 Authentication

Features:
- Email and password login.
- Logout.
- Forgot-password flow.
- Protected application routes.
- User profile containing name, role, and active status.
- Disabled users must not access the application.

Acceptance criteria:
- Unauthenticated users are redirected to login.
- Authenticated users can access only pages allowed by their role.
- Sensitive actions are enforced by database policies.

---

## 5.2 Dashboard

Display:
- Total vehicles.
- Available vehicles.
- Currently rented vehicles.
- Vehicles currently moving.
- Vehicles currently parked.
- Offline GPS trackers.
- Overdue rentals.
- Unresolved geofence alerts.
- Map showing all active vehicles.
- Recent alerts.
- Rentals due for return today.

Vehicle status values:
- `available`
- `reserved`
- `rented`
- `maintenance`
- `inactive`

Tracker connection status:
- `online`
- `delayed`
- `offline`
- `unknown`

Suggested tracker rules:
- Online: last update within 5 minutes.
- Delayed: last update between 5 and 15 minutes.
- Offline: last update older than 15 minutes.
- Make these thresholds configurable.

Acceptance criteria:
- Dashboard numbers update without refreshing when relevant Supabase records change.
- Vehicle markers show a clear stale-data indicator.
- Each vehicle card shows the exact last-update time.

---

## 5.3 Vehicle Management

Vehicle fields:
- Internal UUID.
- Plate number.
- Vehicle name.
- Make.
- Model.
- Year.
- Color.
- Vehicle category.
- Transmission.
- Fuel type.
- Seating capacity.
- Current odometer.
- Status.
- Photo URL.
- Notes.
- Created and updated timestamps.

Features:
- Create vehicle.
- Edit vehicle.
- View vehicle details.
- Soft-disable or archive vehicle.
- Search and filter vehicles.
- Assign or replace a GPS device.
- Display current rental.
- Display latest location.
- Display last tracker communication.
- Display route history.

Validation:
- Plate number must be unique within the organization.
- A GPS device may be assigned to only one active vehicle.
- A vehicle cannot be marked available while it has an active rental.

---

## 5.4 GPS Device Management

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
- The application must continue working when a field such as ignition or battery level is unavailable.

---

## 5.5 Customer Management

Customer fields:
- Internal UUID.
- Full name.
- Email.
- Phone number.
- Address.
- Driver's license number.
- Driver's license expiration.
- Emergency contact name.
- Emergency contact number.
- Facebook profile URL as optional reference only.
- Notes.
- Is blocked.
- Created and updated timestamps.

MVP features:
- Create customer.
- Edit customer.
- View customer.
- Search customers.
- View rental history.
- Block customer from new rentals.
- Record customer consent to vehicle GPS tracking.

Privacy:
- Do not automatically scrape or score Facebook accounts in the MVP.
- Store only the profile URL when voluntarily provided.
- GPS tracking consent must be recorded with timestamp and the accepted disclosure version.

---

## 5.6 Rental Management

Rental fields:
- Internal UUID.
- Rental reference number.
- Customer.
- Vehicle.
- Start date and time.
- Expected return date and time.
- Actual return date and time.
- Pickup location.
- Return location.
- Starting odometer.
- Ending odometer.
- Starting fuel level.
- Ending fuel level.
- Rental status.
- Tracking consent timestamp.
- Notes.
- Created by.
- Created and updated timestamps.

Rental status:
- `draft`
- `reserved`
- `active`
- `completed`
- `cancelled`
- `overdue`

Features:
- Create rental.
- Assign vehicle and customer.
- Start rental.
- Complete rental.
- Cancel rental.
- Mark rental overdue automatically based on expected return.
- View route history limited to rental start and end.
- Display distance traveled during rental.
- Attach allowed geofences to a rental.
- View alerts generated during the rental.

Business rules:
- A vehicle cannot have overlapping active or reserved rentals.
- Starting a rental sets the vehicle status to rented.
- Completing a rental sets the vehicle status to available unless it is marked for maintenance.
- Tracking history displayed for a rental must use the rental time window.
- The UI must show last-known position rather than falsely labeling stale data as live.

---

## 5.7 Live Fleet Map

Features:
- Show all active vehicles on a map.
- Marker icon or badge reflects moving, parked, delayed, or offline status.
- Click a marker to show:
  - Vehicle name.
  - Plate number.
  - Current renter.
  - Speed.
  - Ignition when available.
  - Last update.
  - Current address when reverse geocoding is available.
  - Open vehicle details button.
- Filter by:
  - Vehicle status.
  - GPS status.
  - Active rental.
  - Vehicle category.
- Automatically update markers through Supabase Realtime.
- Fit map bounds to visible vehicles.
- Provide list view as an alternative to the map.

Do not continuously reverse-geocode every incoming location. Cache addresses or request them only when a user opens a vehicle detail panel.

---

## 5.8 Vehicle Tracking Page

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

Time filters:
- Last hour.
- Today.
- Last 24 hours.
- Custom date and time.
- Active rental period.

Acceptance criteria:
- Route points are ordered by device timestamp.
- Duplicate points are removed or ignored.
- Route history handles missing GPS periods.
- Large histories are paginated or downsampled to avoid freezing the browser.
- User can distinguish the GPS timestamp from the database ingestion timestamp.

---

## 5.9 Geofencing

Supported shapes for MVP:
- Circle.
- Polygon.

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

Geofence types:
- `allowed_area`
- `restricted_area`
- `branch`
- `pickup_zone`
- `return_zone`

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

For the initial implementation, Traccar may perform the geofence calculation. Supabase stores the normalized event and business-level acknowledgement state.

---

## 5.10 Alerts and Events

Event types:
- `geofence_enter`
- `geofence_exit`
- `tracker_offline`
- `tracker_online`
- `overspeed`
- `unauthorized_movement`
- `ignition_on`
- `ignition_off`
- `power_disconnected`
- `rental_overdue`
- `device_alarm`
- `system_error`

Event fields:
- Internal UUID.
- Vehicle.
- GPS device.
- Rental when applicable.
- Event type.
- Severity.
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

Severity:
- `info`
- `warning`
- `critical`

Features:
- Alert inbox.
- Filter by type, status, severity, vehicle, and date.
- Acknowledge alert.
- Add resolution note.
- Open alert location on map.
- Link alert to related vehicle and rental.
- Show unresolved-alert count in navigation.
- In-app realtime notifications.

MVP notification channels:
- In-app notification.
- Optional email notification.

Future notification channels:
- SMS.
- Push notification.
- WhatsApp or Telegram.

---

## 5.11 Reports

MVP reports:
- Vehicle trip history.
- Distance traveled per rental.
- Geofence violations.
- Offline tracker report.
- Overspeed events when speed is supported.
- Active and overdue rentals.
- Vehicle utilization.

Features:
- Filter by vehicle and date range.
- Export CSV.
- Print-friendly report page.

Do not implement complex accounting or financial reporting in the first release.

---

## 6. Suggested Database Schema

Use UUID primary keys and `timestamptz`.

### Required Tables

```text
organizations
profiles
vehicles
gps_devices
customers
rentals
rental_geofences
vehicle_latest_locations
vehicle_location_history
geofences
vehicle_geofences
tracking_events
notification_preferences
integration_sync_logs
app_settings
```

### Important Constraints

- Unique active plate number per organization.
- Unique GPS identifier per organization.
- One active GPS device assignment per vehicle.
- One active vehicle assignment per GPS device.
- Prevent overlapping active rentals for the same vehicle.
- Latest location must have one row per vehicle.
- Traccar event ID should be unique when present.
- History inserts must be idempotent using a source position ID or a composite uniqueness rule.

### Recommended Location Columns

`vehicle_latest_locations`
- `vehicle_id`
- `gps_device_id`
- `latitude`
- `longitude`
- `altitude`
- `speed_kph`
- `heading`
- `accuracy_meters`
- `ignition`
- `motion`
- `external_power`
- `battery_level`
- `alarm_type`
- `gps_valid`
- `device_time`
- `server_time`
- `received_at`
- `raw_attributes jsonb`

`vehicle_location_history`
- Same telemetry fields.
- Source Traccar position ID.
- Rental ID when known.
- Geospatial point column if PostGIS is enabled.

---

## 7. Supabase Security Requirements

- Enable Row Level Security on all business tables.
- Every record must include `organization_id` where applicable.
- Users may access only rows belonging to their organization.
- Viewer role has select-only access.
- Rental staff cannot manage users or integration secrets.
- Only administrators can edit GPS integration configuration.
- Never expose the Supabase service-role key in the browser.
- Never expose Traccar administrator credentials in the browser.
- Integration secrets must be stored in server-side environment variables.
- Audit sensitive actions such as device reassignment and alert resolution.

---

## 8. Traccar Integration Requirements

Create an abstraction layer named something similar to:

```text
GpsProvider
```

Required methods:
- `listDevices()`
- `getDevice(deviceId)`
- `getLatestPosition(deviceId)`
- `getPositions(deviceId, from, to)`
- `getEvents(deviceId, from, to)`
- `createOrUpdateGeofence(data)`
- `assignGeofence(deviceId, geofenceId)`
- `testConnection()`

Implement:
- `TraccarGpsProvider`
- `SimulatorGpsProvider`

Do not couple frontend components directly to Traccar response formats.

### Synchronization

The integration process must:
1. Read the latest positions from Traccar.
2. Match Traccar devices to `gps_devices`.
3. Upsert `vehicle_latest_locations`.
4. Insert new historical positions idempotently.
5. Normalize Traccar events into `tracking_events`.
6. Record failures in `integration_sync_logs`.
7. Avoid inserting duplicates after retries.

### Sync Strategy for MVP

Support either:
- Polling Traccar every 5–15 seconds from a long-running integration worker, or
- Receiving Traccar event forwarding/webhooks where practical.

A Supabase Edge Function should not be used as a permanent raw TCP listener for the GPS device. Traccar remains the GPS protocol server.

---

## 9. GPS Simulator Mode

Build a simulator for development.

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

The simulator must make it possible to demonstrate the full MVP without changing the physical SinoTrack server settings.

---

## 10. Required Pages

### Public
- `/login`
- `/forgot-password`
- `/reset-password`

### Protected
- `/dashboard`
- `/vehicles`
- `/vehicles/new`
- `/vehicles/[id]`
- `/vehicles/[id]/tracking`
- `/devices`
- `/devices/[id]`
- `/customers`
- `/customers/new`
- `/customers/[id]`
- `/rentals`
- `/rentals/new`
- `/rentals/[id]`
- `/map`
- `/geofences`
- `/geofences/new`
- `/geofences/[id]`
- `/alerts`
- `/alerts/[id]`
- `/reports`
- `/settings`
- `/settings/users`
- `/settings/integrations`

---

## 11. UI and UX Requirements

- Responsive desktop-first admin dashboard.
- Must remain usable on tablets and mobile browsers.
- Clear loading, empty, stale, error, and offline states.
- Use skeleton loaders for dashboard cards and lists.
- Confirm destructive actions.
- Use accessible form labels and keyboard navigation.
- Do not use color as the only status indicator.
- Every location view must show:
  - Device timestamp.
  - Last received time.
  - Online or stale status.
- Use consistent units:
  - Speed in km/h.
  - Distance in kilometers.
  - Radius in meters or kilometers.
  - Philippine date/time display while storing timestamps in UTC.

---

## 12. Privacy and Data Retention

The system must:
- Record that the customer accepted GPS tracking disclosure.
- Show tracking only to authorized staff.
- Keep an audit trail of sensitive access where practical.
- Support configurable location-history retention.
- Avoid exposing exact route history to unauthorized users.
- Allow administrators to archive or delete records according to company policy.
- Clearly identify that GPS locations may be delayed or inaccurate.

Suggested MVP retention setting:
- Keep detailed tracking history for a configurable number of days.
- Keep summarized rental metrics longer than raw GPS points.

---

## 13. Non-Functional Requirements

### Reliability
- Position synchronization must be idempotent.
- Temporary Traccar or network failure must not crash the application.
- Failed synchronization must be retried with backoff.
- Display the last successful synchronization time.

### Performance
- Dashboard should load within a few seconds for a small fleet.
- Paginate history and event tables.
- Do not load an entire long route in one unbounded query.
- Index vehicle, device, rental, timestamp, status, and event-type columns.

### Observability
- Log sync start, completion, count, and errors.
- Store integration error summaries.
- Provide a basic integration-health panel.

### Testing
- Unit tests for status calculations and rental rules.
- Integration tests for Supabase data access.
- Tests for RLS policies where possible.
- Tests for GPS normalization.
- End-to-end test for:
  - Login.
  - Create vehicle.
  - Create customer.
  - Start rental.
  - Receive simulated location.
  - Trigger geofence alert.
  - Complete rental.

---

## 14. MVP Out of Scope

Do not implement these until the core tracking workflow is stable:

- Online customer booking portal.
- Online payments.
- Full accounting.
- Automated Facebook identity verification.
- AI scam detection.
- Facial recognition.
- Remote engine shutdown.
- OBD diagnostics.
- Fuel sensor integration.
- Maintenance inventory.
- Complex dynamic pricing.
- Multi-branch accounting.
- Native mobile apps.
- Public renter live-tracking links.

Design the codebase so these may be added later without rewriting the GPS integration.

---

## 15. Build Milestones

### Milestone 1: Project Foundation
- Initialize Next.js and TypeScript.
- Configure Tailwind and component library.
- Configure Supabase.
- Implement authentication.
- Implement profiles, organizations, roles, and RLS.
- Create navigation and protected layout.

### Milestone 2: Core Rental Data
- Vehicle CRUD.
- GPS device CRUD.
- Customer CRUD.
- Rental CRUD.
- Rental status rules.
- Search and filters.

### Milestone 3: Tracking Data
- Add latest-location and history tables.
- Implement GPS provider abstraction.
- Implement simulator provider.
- Build live fleet map.
- Build vehicle tracking page.
- Add Realtime subscriptions.

### Milestone 4: Traccar Integration
- Configure Traccar credentials server-side.
- Implement device and position synchronization.
- Normalize telemetry.
- Add sync logs and retries.
- Map devices to vehicles.
- Verify physical tracker when model and protocol are confirmed.

### Milestone 5: Geofences and Alerts
- Geofence CRUD with map drawing.
- Vehicle/rental geofence assignment.
- Normalize geofence events.
- Alert inbox.
- Realtime alert notifications.
- Acknowledge and resolve workflow.

### Milestone 6: Reports and Hardening
- Reports and CSV export.
- Performance indexes.
- Validation and error handling.
- RLS review.
- Integration health.
- Automated tests.
- Deployment documentation.

---

## 16. Definition of Done for MVP

The MVP is complete when an administrator can:

1. Sign in.
2. Register a customer.
3. Register a vehicle.
4. Register and assign a GPS device.
5. Create and start a rental.
6. See the vehicle's current or simulated position on the fleet map.
7. Open the vehicle and view its recent route.
8. Create an allowed-area geofence.
9. Receive a geofence-exit event.
10. Acknowledge the event.
11. See tracker offline status when updates stop.
12. Complete the rental.
13. View the route and events associated with that rental.
14. Export a basic trip or alert report.

---

## 17. Codex Implementation Instructions

Follow these rules during implementation:

1. Build milestone by milestone. Do not attempt the entire application in one unreviewed change.
2. Before editing, inspect the existing repository and summarize the current architecture.
3. Create a task checklist and keep it updated.
4. Use TypeScript strict mode.
5. Keep server-only credentials out of client components.
6. Generate Supabase migrations instead of manually editing production tables.
7. Add RLS policies in migrations.
8. Use reusable validation schemas.
9. Use a service layer for Supabase and GPS provider operations.
10. Do not call Traccar directly from the browser.
11. Add meaningful error states instead of silent failures.
12. Add seed data and simulator routes for development.
13. Run formatting, type checking, linting, and tests after each milestone.
14. Do not remove working features without explicit approval.
15. Document environment variables and setup commands.
16. When requirements are unclear, use the simplest implementation that preserves future extensibility.
17. Keep the first version focused on location tracking, rentals, geofencing, and offline alerts.

---

## 18. Suggested Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GPS_PROVIDER=simulator
TRACCAR_BASE_URL=http://localhost:8082
TRACCAR_USERNAME=
TRACCAR_PASSWORD=
TRACCAR_API_TOKEN=

DEFAULT_TIMEZONE=Asia/Manila
TRACKER_ONLINE_THRESHOLD_MINUTES=5
TRACKER_DELAYED_THRESHOLD_MINUTES=15
LOCATION_RETENTION_DAYS=90
```

Do not expose variables without the `NEXT_PUBLIC_` prefix to browser code.

---

## 19. Initial Codex Prompt

Use this prompt after placing this file in the repository:

```text
Read APPLICATION_FEATURES.md completely.

First inspect the current repository and identify:
1. Existing framework and folder structure.
2. Existing Supabase integration.
3. Existing authentication and database migrations.
4. Missing dependencies.
5. Risks or conflicts with the specification.

Then create an implementation plan divided by the milestones in the document.

Start only with Milestone 1 unless the repository already contains some of its requirements. Implement production-quality code, migrations, RLS policies, validation, loading states, and tests. Do not expose server credentials to the browser. Run linting, type checking, and tests before finishing. Provide a summary of files changed, commands run, and remaining work.
```
