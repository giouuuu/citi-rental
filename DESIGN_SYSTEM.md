# Car Rental Application
## Elegant Professional Design System

**Design direction:** Premium fleet operations, trustworthy, calm, precise, and modern.

This design system serves the car-rental application defined in `APPLICATION_FEATURES.md`. It is optimized for a Next.js, TypeScript, Tailwind CSS, and Supabase administrative interface plus the public booking site.

Map-related patterns in this document belong to the parked tracking scope (`GPS_TRACKING_FEATURES.md`) — keep the tokens, but do not build map UI while that scope is parked.

---

# 1. Brand Personality

The interface should feel:

- Professional, reliable, and operational.
- Elegant without appearing luxurious or decorative.
- Calm during normal use and clear during urgent events.
- Data-focused without feeling dense or technical.
- Appropriate for rental owners, dispatchers, and operations staff.

Avoid:

- Bright neon colors.
- Heavy gradients.
- Excessive shadows.
- Oversized rounded cards.
- Cartoon-like icons.
- Overuse of glassmorphism.
- Dark interfaces with poor map readability.
- Color-only status indicators.

---

# 2. Visual Concept

## Theme Name

**City Rentals**

## Core Visual Language

The design combines:

- Deep midnight navy for trust and authority.
- Teal for active actions, live tracking, and operational focus.
- Warm gold for premium accents and selected highlights.
- Neutral slate tones for structure and readable data.
- Soft off-white surfaces for a clean business interface.

The result should feel like a modern fleet-control platform rather than a generic dashboard template.

---

# 3. Color System

## 3.1 Primary Brand Colors

| Token | Hex | Usage |
|---|---:|---|
| `brand-950` | `#07111F` | Darkest navigation and dark-mode background |
| `brand-900` | `#0B1728` | Primary sidebar and dark surfaces |
| `brand-800` | `#11233A` | Hovered dark surfaces |
| `brand-700` | `#18314D` | Secondary dark elements |
| `brand-600` | `#234866` | Muted brand accents |
| `brand-500` | `#315E7C` | Informational visual accents |
| `brand-100` | `#DCE8F0` | Soft brand surface |
| `brand-50` | `#F1F6F9` | Very light brand background |

## 3.2 Operational Accent: Teal

| Token | Hex | Usage |
|---|---:|---|
| `accent-700` | `#0B5E59` | Active button hover |
| `accent-600` | `#0F766E` | Primary action |
| `accent-500` | `#14968B` | Interactive highlight |
| `accent-400` | `#2BB6A8` | Live indicator |
| `accent-100` | `#D7F3EF` | Success/live background |
| `accent-50` | `#EFFBF9` | Light accent surface |

## 3.3 Premium Accent: Gold

Gold should be used sparingly for selected metrics, premium emphasis, or active navigation details.

| Token | Hex | Usage |
|---|---:|---|
| `gold-700` | `#8A6B16` | Dark gold text |
| `gold-600` | `#A98520` | Hover state |
| `gold-500` | `#C5A03A` | Premium accent |
| `gold-100` | `#F5EBCB` | Highlight background |
| `gold-50` | `#FCF8EC` | Soft highlight surface |

Do not use gold as the primary button color.

## 3.4 Neutral Palette

| Token | Hex |
|---|---:|
| `slate-950` | `#0F172A` |
| `slate-900` | `#172033` |
| `slate-800` | `#1E293B` |
| `slate-700` | `#334155` |
| `slate-600` | `#475569` |
| `slate-500` | `#64748B` |
| `slate-400` | `#94A3B8` |
| `slate-300` | `#CBD5E1` |
| `slate-200` | `#E2E8F0` |
| `slate-100` | `#F1F5F9` |
| `slate-50` | `#F8FAFC` |
| `white` | `#FFFFFF` |

## 3.5 Semantic Colors

| Meaning | Base | Dark | Light background |
|---|---:|---:|---:|
| Success | `#15803D` | `#166534` | `#ECFDF3` |
| Warning | `#B45309` | `#92400E` | `#FFF7E6` |
| Danger | `#B42318` | `#912018` | `#FEF3F2` |
| Information | `#2563EB` | `#1D4ED8` | `#EFF6FF` |
| Offline | `#64748B` | `#475569` | `#F1F5F9` |

Semantic colors should communicate meaning consistently across tables, markers, alerts, and status badges.

---

# 4. Status Color Mapping

Do not use color alone. Pair each state with an icon and text label.

## Vehicle Status

| Status | Color | Icon |
|---|---|---|
| Available | Teal | Check circle |
| Reserved | Blue | Calendar |
| Rented | Gold | Key or route |
| Maintenance | Orange | Wrench |
| Inactive | Slate | Pause circle |

## GPS Status

| Status | Color | Icon |
|---|---|---|
| Online | Teal | Radio or signal |
| Moving | Teal | Navigation arrow |
| Parked | Blue-gray | Parking symbol |
| Delayed | Amber | Clock |
| Offline | Slate | Signal off |
| Critical | Red | Alert triangle |

## Rental Status

| Status | Color |
|---|---|
| Draft | Slate |
| Reserved | Blue |
| Active | Teal |
| Completed | Green |
| Cancelled | Slate |
| Overdue | Red |

---

# 5. Theme Tokens

## 5.1 Light Theme

```css
:root {
  --background: 248 250 252;
  --foreground: 15 23 42;

  --surface: 255 255 255;
  --surface-muted: 241 245 249;
  --surface-elevated: 255 255 255;

  --border: 226 232 240;
  --border-strong: 203 213 225;

  --primary: 15 118 110;
  --primary-hover: 11 94 89;
  --primary-foreground: 255 255 255;

  --secondary: 11 23 40;
  --secondary-hover: 17 35 58;
  --secondary-foreground: 255 255 255;

  --accent: 197 160 58;
  --accent-foreground: 71 51 8;

  --muted: 100 116 139;
  --muted-foreground: 71 85 105;

  --success: 21 128 61;
  --warning: 180 83 9;
  --danger: 180 35 24;
  --info: 37 99 235;

  --ring: 20 150 139;
}
```

## 5.2 Dark Theme

```css
.dark {
  --background: 7 17 31;
  --foreground: 241 245 249;

  --surface: 11 23 40;
  --surface-muted: 17 35 58;
  --surface-elevated: 24 49 77;

  --border: 51 65 85;
  --border-strong: 71 85 105;

  --primary: 43 182 168;
  --primary-hover: 20 150 139;
  --primary-foreground: 7 17 31;

  --secondary: 241 245 249;
  --secondary-hover: 226 232 240;
  --secondary-foreground: 7 17 31;

  --accent: 197 160 58;
  --accent-foreground: 252 248 236;

  --muted: 148 163 184;
  --muted-foreground: 203 213 225;

  --success: 34 197 94;
  --warning: 245 158 11;
  --danger: 248 113 113;
  --info: 96 165 250;

  --ring: 43 182 168;
}
```

Dark mode is optional for the first MVP. The light theme should be implemented first.

---

# 6. Typography

## 6.1 Font Pairing

Use:

- **Primary UI font:** Inter
- **Numeric and telemetry font:** IBM Plex Mono

Fallbacks:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

```css
font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

Use the mono font only for:

- GPS coordinates.
- Device IDs.
- IMEI numbers.
- Plate numbers when visually useful.
- Speed, distance, and timestamps in dense telemetry views.
- API or integration details.

## 6.2 Type Scale

| Style | Size | Line height | Weight |
|---|---:|---:|---:|
| Display | 36px | 44px | 700 |
| Page title | 28px | 36px | 700 |
| Section title | 22px | 30px | 650 |
| Card title | 18px | 26px | 600 |
| Body large | 16px | 24px | 400 |
| Body | 14px | 22px | 400 |
| Label | 13px | 18px | 500 |
| Caption | 12px | 18px | 400 |
| Micro | 11px | 16px | 500 |

Guidelines:

- Avoid all-uppercase headings.
- Use sentence case for labels and buttons.
- Use tabular numerals for fleet metrics.
- Do not use font weights above 700.
- Keep long body text at a maximum readable width of approximately 70 characters.

---

# 7. Spacing System

Use a 4px base grid.

| Token | Value |
|---|---:|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |
| `space-16` | 64px |

Recommended use:

- 8px between icon and label.
- 12px between compact form fields.
- 16px internal spacing for small cards.
- 20–24px internal spacing for primary cards.
- 24–32px between page sections.
- 32px desktop page padding.
- 16px mobile page padding.

---

# 8. Border Radius

The interface should look refined, not overly rounded.

| Token | Value | Usage |
|---|---:|---|
| `radius-sm` | 6px | Inputs, badges, small controls |
| `radius-md` | 10px | Buttons, cards |
| `radius-lg` | 14px | Main panels, modals |
| `radius-xl` | 18px | Hero or map container only |
| `radius-full` | 9999px | Status dots, avatars |

Avoid using `24px+` radius for standard cards.

---

# 9. Shadows

Use subtle shadows.

```css
--shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.04);
--shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
--shadow-md: 0 8px 24px rgba(15, 23, 42, 0.08);
--shadow-lg: 0 16px 40px rgba(15, 23, 42, 0.12);
```

Usage:

- Default cards: `shadow-xs` or no shadow with border.
- Dropdowns: `shadow-md`.
- Modals: `shadow-lg`.
- Avoid shadows on every table row or form field.

---

# 10. Layout System

## 10.1 Desktop Shell

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar       │ Header                                       │
│               ├──────────────────────────────────────────────┤
│               │ Page content                                 │
│               │                                              │
│               │                                              │
└──────────────────────────────────────────────────────────────┘
```

Suggested dimensions:

- Sidebar expanded: 256px.
- Sidebar collapsed: 72px.
- Header height: 64px.
- Main content max width: 1600px.
- Page horizontal padding: 32px desktop, 20px tablet, 16px mobile.

## 10.2 Page Header

Each page header may contain:

- Breadcrumb.
- Page title.
- One-line supporting text.
- Primary action.
- Optional secondary actions.

Example:

```text
Vehicles
Monitor fleet availability, assignments, and tracker status.

[Export] [Add vehicle]
```

## 10.3 Dashboard Grid

Desktop:

- 12-column grid.
- Metric cards: 3 columns each.
- Fleet map: 8 columns.
- Alerts/activity: 4 columns.

Tablet:

- Metric cards: 6 columns each.
- Map and alerts stack vertically.

Mobile:

- Single-column layout.
- Map height reduced to 360–440px.
- Filters move to drawers or sheets.

---

# 11. Navigation

## 11.1 Sidebar

Use the dark midnight navy sidebar in the light theme.

Navigation groups:

**Overview**
- Dashboard
- Live map

**Operations**
- Vehicles
- Rentals
- Customers
- GPS devices

**Tracking**
- Geofences
- Alerts
- Reports

**Administration**
- Users
- Integrations
- Settings

Sidebar behavior:

- Active item uses a muted teal background and a 3px teal indicator.
- Hover state should be subtle.
- Show unresolved alert count beside Alerts.
- Keep organization name and user profile visible.
- Use line icons with a consistent 20px size.

## 11.2 Top Header

Include:

- Mobile menu trigger.
- Search or command menu.
- Integration health indicator.
- Notification button.
- User account menu.

---

# 12. Core Components

## 12.1 Buttons

### Primary Button

Use for the main action on a page.

```text
Background: accent-600
Hover: accent-700
Text: white
Height: 40px
Padding: 14px horizontal
Radius: 10px
```

### Secondary Button

```text
Background: white
Border: slate-300
Text: slate-700
Hover background: slate-50
```

### Dark Button

Use sparingly for important business actions.

```text
Background: brand-900
Hover: brand-800
Text: white
```

### Destructive Button

Use only for destructive actions.

```text
Background: danger
Text: white
```

### Ghost Button

Use for row actions, icon controls, and secondary toolbar actions.

Button states must include:

- Default.
- Hover.
- Focus-visible.
- Disabled.
- Loading.

---

## 12.2 Inputs

Standard input:

- Height: 40px.
- Border: slate-300.
- Radius: 8px.
- Background: white.
- Focus border/ring: accent-500.
- Error border: danger.
- Placeholder: slate-400.

Form layout:

- Label above input.
- Optional help text below input.
- Error text below help text.
- Required fields use a text indicator, not only color.
- Use grouped sections for long forms.

---

## 12.3 Cards

Default card:

```text
Background: white
Border: slate-200
Radius: 14px
Shadow: shadow-xs
Padding: 20–24px
```

Metric card:

- Small uppercase-free label.
- Large numeric value.
- Supporting comparison or status.
- Optional icon in a muted square container.
- Avoid decorative charts unless useful.

Selected or highlighted card:

- Teal left border or subtle accent surface.
- Do not use a full bright teal background.

---

## 12.4 Tables

Tables should support high-density operational data without feeling crowded.

Header:

- Background: slate-50.
- Text: slate-600.
- Font size: 12–13px.
- Medium weight.
- Sticky when useful.

Rows:

- Height: 52–60px.
- Bottom border: slate-200.
- Hover: slate-50.
- Selected: accent-50.

Guidelines:

- Left-align text.
- Right-align numeric values.
- Use tabular numbers.
- Freeze key columns in large tables where practical.
- Put row actions in a three-dot menu.
- Use a mobile card-list alternative for small screens.

---

## 12.5 Status Badge

```text
Height: 24px
Padding: 8px horizontal
Radius: full
Font: 12px / 500
Icon or dot: 6px
```

Examples:

- Online: teal text on `accent-50`.
- Delayed: amber text on warning background.
- Offline: slate text on `slate-100`.
- Critical: red text on danger background.

---

## 12.6 Empty State

Include:

- Simple line icon.
- Clear title.
- One-sentence explanation.
- Primary action when relevant.

Example:

```text
No vehicles yet
Add your first vehicle to begin tracking your fleet.

[Add vehicle]
```

---

## 12.7 Alert Banner

For active system-level issues.

Critical:

- Soft red background.
- Red icon.
- Clear action.
- Avoid fully saturated red backgrounds.

Warning:

- Soft amber background.
- State the impact and recommended next step.

Integration-health messages should be visible but not disruptive unless tracking is unavailable.

---

## 12.8 Modal and Drawer

Use a modal for:

- Confirmation.
- Short focused forms.
- Critical alert details.

Use a side drawer for:

- Map filters.
- Vehicle quick details.
- Mobile navigation.
- Long contextual details.

Default modal width:

- Small: 420px.
- Medium: 560px.
- Large: 760px.

---

# 13. Map Design System

## 13.1 Map Style

Use a clean, desaturated map style.

Recommended direction:

- Light gray land.
- Soft white roads.
- Muted blue water.
- Minimal points of interest.
- High contrast vehicle markers.
- Avoid satellite mode as the default.

## 13.2 Vehicle Markers

Marker states:

- Moving: teal marker with navigation arrow.
- Parked: brand-blue marker with parking icon.
- Delayed: amber marker with clock.
- Offline: slate marker with signal-off icon.
- Critical alert: red ring or pulse around marker.

Marker design:

- 36–42px visual size.
- White border.
- Subtle shadow.
- Direction arrow rotates according to heading.
- Cluster markers when many vehicles overlap.

Do not create a constant pulsing animation for every online vehicle. Reserve animation for selected or critical states.

## 13.3 Route Lines

- Current route: accent teal, 4px.
- Historical route: brand-500, 3px.
- Geofence violation segment: danger red, 4px.
- Selected route: add subtle outer casing for contrast.
- Use dashed line for uncertain or missing segments.

## 13.4 Geofences

- Allowed area: teal stroke with low-opacity fill.
- Restricted area: red stroke with low-opacity fill.
- Branch zone: gold stroke with low-opacity fill.
- Selected geofence: thicker border with resize handles.

## 13.5 Map Panel

Map overlays may include:

- Vehicle search.
- Status filters.
- Layer toggle.
- Recenter control.
- Full-screen control.
- Vehicle count.
- Last synchronization status.

Keep map controls within consistent card containers.

---

# 14. Dashboard Components

## 14.1 KPI Cards

Recommended first-row cards:

- Total fleet.
- Active rentals.
- Vehicles moving.
- Tracker alerts.

Each KPI card should display:

- Metric.
- Label.
- Small supporting note.
- Optional icon.
- Click-through behavior when useful.

## 14.2 Fleet Map Panel

Header:

- Title.
- Live status indicator.
- Last sync timestamp.
- Open full map action.

Body:

- Map.
- Small legend.
- Optional side list on wide screens.

## 14.3 Recent Alerts

Alert row:

- Severity icon.
- Event title.
- Vehicle.
- Relative time.
- Status badge.
- Quick acknowledgement action where allowed.

## 14.4 Rentals Due Today

Show:

- Rental reference.
- Customer.
- Vehicle.
- Expected return.
- Status.
- Quick open action.

---

# 15. Vehicle Detail Design

Suggested structure:

```text
Vehicle identity header
├── Plate and vehicle name
├── Status badges
├── Current renter
└── Primary actions

Tabbed content
├── Overview
├── Live tracking
├── Trips
├── Rentals
├── Alerts
└── Device
```

Overview cards:

- Latest location.
- Tracker status.
- Active rental.
- Odometer.
- Recent movement.
- Assigned device.

Use a two-column layout on desktop:

- Main content: map and timeline.
- Side panel: current telemetry and rental information.

---

# 16. Alert Detail Design

Header:

- Alert type.
- Severity.
- Vehicle.
- Event time.
- Acknowledgement status.

Content:

- Location map.
- Event metadata.
- Related geofence.
- Related rental.
- Raw telemetry collapsed by default.
- Resolution note.
- Activity history.

Primary action:

- Acknowledge alert.

Secondary actions:

- Open vehicle.
- Open rental.
- View tracking around event time.

---

# 17. Forms

Use sectioned forms rather than one long unstructured column.

Example for vehicle form:

**Vehicle information**
- Plate number.
- Make.
- Model.
- Year.
- Color.

**Operational information**
- Vehicle category.
- Status.
- Odometer.
- Fuel type.

**GPS assignment**
- GPS device.
- Installation details.

**Additional information**
- Photo.
- Notes.

Form actions:

- Cancel.
- Save changes.
- Save and view, only when helpful.

Place sticky form actions at the bottom on long forms.

---

# 18. Motion and Interaction

Motion should be subtle and purposeful.

Recommended durations:

- Hover: 120–160ms.
- Dropdown/modal: 180–220ms.
- Drawer: 220–280ms.
- Map marker movement: 300–600ms interpolation when practical.

Easing:

```css
cubic-bezier(0.2, 0.8, 0.2, 1)
```

Reduce or disable motion when the user has enabled reduced-motion preferences.

Avoid:

- Bouncing cards.
- Large scaling effects.
- Continuous background animation.
- Excessive loading spinners.

---

# 19. Iconography

Use one icon set consistently, such as Lucide.

Recommended icons:

- Dashboard: LayoutDashboard.
- Live map: Map.
- Vehicles: CarFront.
- Rentals: KeyRound.
- Customers: Users.
- GPS devices: RadioTower.
- Geofences: MapPinned.
- Alerts: TriangleAlert.
- Reports: ChartNoAxesCombined.
- Settings: Settings.
- Online: Wifi.
- Offline: WifiOff.
- Moving: Navigation.
- Parked: CircleParking.
- Maintenance: Wrench.
- Overdue: ClockAlert.

Default icon size:

- Navigation: 20px.
- Buttons: 16px.
- Card icon: 20–24px.
- Empty-state icon: 36–48px.

---

# 20. Accessibility

Minimum requirements:

- WCAG AA color contrast.
- Visible keyboard focus.
- All inputs have labels.
- Icons used alone have accessible names.
- Tables have proper headers.
- Map information has a list-based alternative.
- Status is not represented by color alone.
- Toast messages are announced to assistive technology.
- Modal focus is trapped and restored.
- Touch targets are at least 40px where practical.

---

# 21. Tailwind Theme Extension

Example Tailwind configuration:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F1F6F9",
          100: "#DCE8F0",
          500: "#315E7C",
          600: "#234866",
          700: "#18314D",
          800: "#11233A",
          900: "#0B1728",
          950: "#07111F",
        },
        accent: {
          50: "#EFFBF9",
          100: "#D7F3EF",
          400: "#2BB6A8",
          500: "#14968B",
          600: "#0F766E",
          700: "#0B5E59",
        },
        gold: {
          50: "#FCF8EC",
          100: "#F5EBCB",
          500: "#C5A03A",
          600: "#A98520",
          700: "#8A6B16",
        },
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(15, 23, 42, 0.04)",
        sm: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
        md: "0 8px 24px rgba(15, 23, 42, 0.08)",
        lg: "0 16px 40px rgba(15, 23, 42, 0.12)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

# 22. Component Class Examples

## Primary Button

```tsx
className="
  inline-flex h-10 items-center justify-center gap-2
  rounded-md bg-accent-600 px-4
  text-sm font-medium text-white
  shadow-xs transition-colors
  hover:bg-accent-700
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-accent-500
  focus-visible:ring-offset-2
  disabled:pointer-events-none
  disabled:opacity-50
"
```

## Standard Card

```tsx
className="
  rounded-lg border border-slate-200
  bg-white p-5 shadow-xs
"
```

## Status Badge

```tsx
className="
  inline-flex h-6 items-center gap-1.5
  rounded-full px-2.5
  text-xs font-medium
"
```

## Standard Input

```tsx
className="
  flex h-10 w-full rounded-sm
  border border-slate-300 bg-white px-3
  text-sm text-slate-900
  placeholder:text-slate-400
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-accent-500
  focus-visible:ring-offset-1
  disabled:cursor-not-allowed
  disabled:bg-slate-100
  disabled:text-slate-500
"
```

---

# 23. Responsive Rules

## Desktop

- Full sidebar.
- Dashboard multi-column grid.
- Fleet map and activity panel side by side.
- Tables are the preferred data presentation.

## Tablet

- Collapsible sidebar.
- Two-column dashboard cards.
- Map and activity panels stacked.
- Forms may use two columns.

## Mobile

- Drawer navigation.
- Single-column cards.
- Table views become cards or horizontally scroll.
- Primary actions remain visible.
- Filters open in a bottom sheet or side drawer.
- Map popovers become bottom sheets.
- Avoid showing more than two compact status metrics in one row.

---

# 24. Content Style

Use clear operational language.

Preferred:

- “Last updated 2 minutes ago”
- “Tracker offline”
- “Vehicle left the allowed area”
- “Rental is overdue by 3 hours”
- “No GPS data received”
- “Acknowledge alert”

Avoid:

- “Oops!”
- “Something cool happened”
- “Live” when the timestamp is stale
- Technical protocol wording in normal user-facing screens
- Excessive exclamation marks

Dates should be shown in Philippine local time while stored in UTC.

Example:

```text
13 Jul 2026, 2:45 PM
```

---

# 25. Design QA Checklist

Before considering a screen complete, verify:

- The page has one clear primary action.
- Status is shown with icon, label, and color.
- Last-update timestamps are visible on tracking screens.
- Empty, loading, error, stale, and offline states exist.
- Text and controls meet contrast requirements.
- Mobile layout remains usable.
- Tables do not overflow without an intentional responsive behavior.
- Map controls do not cover important content.
- Destructive actions require confirmation.
- Buttons and inputs have focus states.
- Page spacing follows the 4px system.
- No component uses an arbitrary color outside the design tokens.

---

# 26. Codex Implementation Prompt

After adding this file to the repository, use:

```text
Read DESIGN_SYSTEM.md and APPLICATION_FEATURES.md completely.

Implement the design system as reusable tokens and components before building feature pages.

Tasks:
1. Configure the theme colors, typography, spacing, radius, and shadows.
2. Create reusable Button, Input, Select, Card, Badge, Alert, Modal, Drawer, Table, EmptyState, Skeleton, and PageHeader components.
3. Create the responsive application shell with the City Rentals sidebar and top header.
4. Add Storybook or a protected internal design-system preview page that demonstrates every component and state.
5. Implement light mode first. Prepare tokens for dark mode but do not prioritize dark-mode feature work.
6. Ensure WCAG AA contrast, keyboard focus, reduced-motion handling, and mobile responsiveness.
7. Do not use arbitrary colors inside feature components. Use semantic design tokens.
8. Run linting, formatting, type checking, and tests.
9. Summarize all files changed and any design decisions that differ from this document.

The visual result should feel elegant, professional, calm, and operational. Avoid a generic colorful dashboard appearance.
```

---

# 27. Recommended First Design Deliverables

Codex should complete these before feature implementation:

1. Global CSS variables.
2. Tailwind theme extension.
3. Typography setup.
4. Application shell.
5. Sidebar navigation.
6. Top header.
7. Page header.
8. Button variants.
9. Form controls.
10. Card variants.
11. Status badges.
12. Table styles.
13. Alert components.
14. Skeletons and empty states.
15. Modal and drawer.
16. Map legend and marker tokens.
17. Internal component preview page.
