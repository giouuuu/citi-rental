import { NextRequest, NextResponse } from "next/server";

import { alertDefinition } from "@/features/alerts";
import { customerDefinition } from "@/features/customers";
import { deviceDefinition } from "@/features/devices";
import { driverDefinition } from "@/features/drivers";
import {
  expenseDefinition,
  fixedAssetDefinition,
  withholdingCertificateDefinition,
} from "@/features/finance";
import { geofenceDefinition } from "@/features/geofences";
import { chargeTypeDefinition, rentalDefinition } from "@/features/rentals";
import { reviewDefinition } from "@/features/reviews";
import { parseResourceQuery } from "@/features/shared/schemas/resource-query-schema";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { flatResourceColumns } from "@/features/shared/lib/resource-table-url";
import { toXlsx, xlsxResponse } from "@/features/shared/lib/to-xlsx";
import { selectResourceRows } from "@/features/shared/services/select-resource-rows";
import type { ResourceDefinition, ResourceRow } from "@/features/shared/types/resource";
import { userDefinition } from "@/features/users";
import { vehicleExpenseDefinition } from "@/features/vehicle-costs";
import { vehicleDefinition } from "@/features/vehicles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Every `ResourceIndexScreen` list, by its route. `/export/<route>` downloads it. */
const exportable = new Map<string, ResourceDefinition>(
  [
    alertDefinition,
    chargeTypeDefinition,
    customerDefinition,
    deviceDefinition,
    driverDefinition,
    expenseDefinition,
    fixedAssetDefinition,
    geofenceDefinition,
    rentalDefinition,
    reviewDefinition,
    userDefinition,
    vehicleDefinition,
    vehicleExpenseDefinition,
    withholdingCertificateDefinition,
  ].map((definition) => [definition.route, definition]),
);

/** PostgREST caps a response at 1,000 rows, so the export pages through. */
const CHUNK = 1000;
const MAX_ROWS = 20_000;

export async function GET(request: NextRequest, ctx: RouteContext<"/export/[...route]">) {
  const { route } = await ctx.params;
  const definition = exportable.get(`/${route.join("/")}`);
  if (!definition) return NextResponse.json({ error: "Unknown list." }, { status: 404 });

  const query = parseResourceQuery(
    Object.fromEntries(request.nextUrl.searchParams),
    definition,
  );
  const sheet = (rows: ResourceRow[]) =>
    toXlsx([
      {
        name: definition.plural,
        columns: flatResourceColumns(definition.columns).map((column) => ({
          key: column.key,
          header: column.label,
          format: column.format,
        })),
        rows,
      },
    ]);
  const fileName = definition.plural.toLowerCase().replaceAll(/\s+/g, "-");

  if (!isSupabaseConfigured())
    return xlsxResponse(await sheet(definition.demoRows ?? []), fileName);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  const allowed = definition.route.startsWith("/finance/")
    ? profile?.role === "owner"
    : isAdminRole(profile?.role);
  if (!profile?.is_active || !allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows: ResourceRow[] = [];
  try {
    while (rows.length < MAX_ROWS) {
      const chunk = await selectResourceRows(supabase, definition, query, {
        from: rows.length,
        to: rows.length + CHUNK - 1,
      });
      rows.push(...chunk);
      if (chunk.length < CHUNK) break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return xlsxResponse(await sheet(rows), fileName);
}
