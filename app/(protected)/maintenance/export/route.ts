import { NextRequest, NextResponse } from "next/server";

import { listMaintenanceSchedule } from "@/features/maintenance";
import { MAINTENANCE_LIST } from "@/features/maintenance/lib/maintenance-options";
import { SCHEDULE_XLSX_COLUMNS, scheduleXlsxRows } from "@/features/maintenance/lib/maintenance-export";
import type { ScheduledPlan } from "@/features/maintenance/lib/maintenance-schedule";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { toXlsx, xlsxResponse } from "@/features/shared/lib/to-xlsx";
import { parseResourceQuery } from "@/features/shared/schemas/resource-query-schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Under PostgREST's 1,000-row cap, since the schedule reads one row past the page. */
const CHUNK = 500;
const MAX_ROWS = 20_000;

/** `/maintenance/export` downloads the fleet service schedule with the page's search, filter and sort. */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (!profile?.is_active || !isAdminRole(profile.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const query = parseResourceQuery(Object.fromEntries(request.nextUrl.searchParams), MAINTENANCE_LIST);
  const plans: ScheduledPlan[] = [];
  for (let page = 1; plans.length < MAX_ROWS; page++) {
    const result = await listMaintenanceSchedule({ ...query, page, pageSize: CHUNK });
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    plans.push(...result.data.rows);
    if (!result.data.hasNextPage) break;
  }

  const workbook = await toXlsx([
    { name: "Maintenance", columns: SCHEDULE_XLSX_COLUMNS, rows: scheduleXlsxRows(plans) },
  ]);
  return xlsxResponse(workbook, "maintenance-schedule");
}
