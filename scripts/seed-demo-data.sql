-- ===========================================================================
-- Demo data for a NON-PRODUCTION project: fleet, customers, a year of rentals
-- and payments, expenses, fixed assets and 2307 certificates, so the ops app,
-- /analytics and /finance have something realistic to show.
--
-- NEVER run this against the real business database.
--
-- Re-runnable: every demo row is tagged (reference DEMO-*, notes 'Demo data',
-- or a de0000xx-* id) and deleted before re-inserting. Deterministic: the same
-- run produces the same rows (setseed), apart from dates relative to now().
--
-- Vehicle photos: rows point at vehicle-photos/demo/<slug>.jpg, which must
-- exist in the bucket (uploaded separately) for the gallery to render.
--
-- Tax story: non-VAT until 2025-12-31, VAT-registered from 2026-01-01, so the
-- statement shows both treatments. One vehicle (the A6) has no register entry,
-- and a handful of expenses carry deliberate defects, so Block E has content.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Clear previous demo rows (children first).
-- ---------------------------------------------------------------------------
delete from public.payments
where rental_id in (select id from public.rentals where reference_number like 'DEMO-%');
delete from public.rentals where reference_number like 'DEMO-%';
delete from public.withholding_certificates where notes = 'Demo data';
delete from public.expenses where notes = 'Demo data';
delete from public.fixed_assets where notes = 'Demo data';
delete from public.vehicle_photos where vehicle_id::text like 'de000001-%';
delete from public.vehicles where id::text like 'de000001-%';
delete from public.customers where id::text like 'de000002-%';

-- ---------------------------------------------------------------------------
-- 1. Tax settings: non-VAT while seeding history (re-stamped in step 6).
-- ---------------------------------------------------------------------------
update public.tax_settings set
  registered_name = 'Zeke Car Rental & Services',
  tin = '123-456-789-00000',
  rdo_code = '081',
  registered_address = 'Cebu City, Cebu',
  entity_type = 'sole_proprietor',
  vat_registered = false,
  income_tax_election = null,
  fiscal_year_start_month = 1;

-- ---------------------------------------------------------------------------
-- 2. Fleet. Inserted as maintenance, given a gallery, then made available
--    (the gallery trigger refuses 'available' without six photos).
-- ---------------------------------------------------------------------------
insert into public.vehicles (
  id, plate_number, name, make, model, year, color, category, transmission,
  fuel_type, seating_capacity, current_odometer, status, daily_rate, photo_url, notes, created_at
)
values
  ('de000001-0000-4000-8000-000000000001', 'NDA 1801', 'Toyota Vios 1.3 XLE', 'Toyota', 'Vios', 2024, 'Silver', 'Sedan', 'cvt', 'gasoline', 5, 31200, 'maintenance', 1800, null, 'Demo data', '2025-09-01 08:00+08'),
  ('de000001-0000-4000-8000-000000000002', 'NDB 2002', 'Honda City 1.5 V', 'Honda', 'City', 2024, 'Black', 'Sedan', 'cvt', 'gasoline', 5, 27850, 'maintenance', 2000, null, 'Demo data', '2025-09-01 08:00+08'),
  ('de000001-0000-4000-8000-000000000003', 'NDC 1503', 'Mitsubishi Mirage G4 GLX', 'Mitsubishi', 'Mirage G4', 2023, 'Blue', 'Sedan', 'cvt', 'gasoline', 5, 48900, 'maintenance', 1500, null, 'Demo data', '2025-09-01 08:00+08'),
  ('de000001-0000-4000-8000-000000000004', 'NDD 3204', 'Honda CR-V S', 'Honda', 'CR-V', 2025, 'White', 'SUV', 'cvt', 'gasoline', 5, 15400, 'maintenance', 3200, null, 'Demo data', '2025-09-01 08:00+08'),
  ('de000001-0000-4000-8000-000000000005', 'NDE 3805', 'Toyota Fortuner 2.4 G', 'Toyota', 'Fortuner', 2025, 'Pearl White', 'SUV', 'automatic', 'diesel', 7, 12700, 'maintenance', 3800, null, 'Demo data', '2025-09-01 08:00+08'),
  ('de000001-0000-4000-8000-000000000006', 'NDF 4506', 'Hyundai Staria 2.2 Premium', 'Hyundai', 'Staria', 2025, 'Gaia Brown', 'Van', 'automatic', 'diesel', 11, 9800, 'maintenance', 4500, null, 'Demo data', '2025-09-01 08:00+08'),
  ('de000001-0000-4000-8000-000000000007', 'NDG 7507', 'Ford Mustang 5.0 GT', 'Ford', 'Mustang', 2024, 'Shadow Black', 'Sports', 'automatic', 'gasoline', 4, 8600, 'maintenance', 7500, null, 'Demo data', '2025-09-15 08:00+08'),
  ('de000001-0000-4000-8000-000000000008', 'NDH 6008', 'Audi A6 Avant 45 TFSI', 'Audi', 'A6', 2023, 'Mythos Black', 'Wagon', 'automatic', 'gasoline', 5, 22100, 'maintenance', 6000, null, 'Demo data', '2025-09-15 08:00+08');

insert into public.vehicle_photos (vehicle_id, kind, storage_path, public_url)
select v.id, k.kind::public.vehicle_photo_kind, 'demo/' || v.slug || '.jpg',
       'https://uttvuimdbiokxgkmruqa.supabase.co/storage/v1/object/public/vehicle-photos/demo/' || v.slug || '.jpg'
from (values
  ('de000001-0000-4000-8000-000000000001'::uuid, 'vios'),
  ('de000001-0000-4000-8000-000000000002'::uuid, 'city'),
  ('de000001-0000-4000-8000-000000000003'::uuid, 'mirage'),
  ('de000001-0000-4000-8000-000000000004'::uuid, 'crv'),
  ('de000001-0000-4000-8000-000000000005'::uuid, 'fortuner'),
  ('de000001-0000-4000-8000-000000000006'::uuid, 'staria'),
  ('de000001-0000-4000-8000-000000000007'::uuid, 'mustang'),
  ('de000001-0000-4000-8000-000000000008'::uuid, 'a6')
) as v(id, slug)
cross join (values ('front'), ('rear'), ('left'), ('right'), ('interior'), ('dashboard')) as k(kind);

update public.vehicles v
set photo_url = p.public_url,
    -- The Mirage is in the shop now; everything else is bookable.
    status = case when v.id = 'de000001-0000-4000-8000-000000000003' then 'maintenance'::public.vehicle_status else 'available'::public.vehicle_status end
from public.vehicle_photos p
where p.vehicle_id = v.id and p.kind = 'front' and v.id::text like 'de000001-%';

-- ---------------------------------------------------------------------------
-- 3. Customers (all consented to tracking; one blocked).
-- ---------------------------------------------------------------------------
insert into public.customers (
  id, full_name, email, phone_number, address, drivers_license_number,
  drivers_license_expires_at, is_blocked, tracking_consent_at, tracking_disclosure_version, notes, created_at
)
select
  ('de000002-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  c.full_name, c.email, c.phone, c.address, 'DEMO-N' || lpad(n::text, 2, '0') || '-24-' || (100000 + n * 7919),
  '2028-06-30', c.blocked, '2025-09-20 09:00+08', 'v1', 'Demo data', '2025-09-20 09:00+08'
from (values
  (1, 'Maria Clara Dela Cruz', 'maria.delacruz@example.com', '0917 555 0101', 'Lahug, Cebu City', false),
  (2, 'Jose Rizal Mercado', 'jose.mercado@example.com', '0918 555 0102', 'Mabolo, Cebu City', false),
  (3, 'Andrea Villanueva', 'andrea.v@example.com', '0927 555 0103', 'Talamban, Cebu City', false),
  (4, 'Paolo Santos', 'paolo.santos@example.com', '0919 555 0104', 'Mandaue City', false),
  (5, 'Kristine Reyes', 'kristine.reyes@example.com', '0905 555 0105', 'Lapu-Lapu City', false),
  (6, 'Miguel Fernandez', 'miguel.f@example.com', '0916 555 0106', 'Banilad, Cebu City', false),
  (7, 'Liza Gonzales', 'liza.g@example.com', '0928 555 0107', 'Talisay City', false),
  (8, 'Rafael Navarro', 'rafael.navarro@example.com', '0917 555 0108', 'Consolacion', false),
  (9, 'Camille Aquino', 'camille.aquino@example.com', '0939 555 0109', 'Minglanilla', false),
  (10, 'Daniel Tan', 'daniel.tan@example.com', '0915 555 0110', 'IT Park, Cebu City', false),
  (11, 'Isla Agri Trading Corp. (driver: R. Bautista)', 'fleet@islaagri.example.com', '032 555 0111', 'North Reclamation, Cebu City', false),
  (12, 'Mactan Events & Tours Corp. (driver: J. Lim)', 'ops@mactanevents.example.com', '032 555 0112', 'Lapu-Lapu City', false),
  (13, 'Gabriel Ramos', 'gab.ramos@example.com', '0906 555 0113', 'Cebu City', false),
  (14, 'Noel Castillo', null, '0910 555 0114', 'Danao City', true)
) as c(n, full_name, email, phone, address, blocked);

-- ---------------------------------------------------------------------------
-- 4. Rentals + payments, Oct 2025 to a month ahead. Sequential per vehicle so
--    nothing overlaps; status follows the dates.
-- ---------------------------------------------------------------------------
do $$
declare
  v record;
  v_now timestamptz := now();
  v_cursor timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_days integer;
  v_seq integer := 0;
  v_rental uuid;
  v_customer uuid;
  v_status public.rental_status;
  v_total numeric;
  v_deposit numeric;
  v_created timestamptz;
  v_source text;
  v_late boolean;
  v_penalty numeric;
  v_actual timestamptz;
  v_cancel boolean;
  v_stop timestamptz;
  v_overdue_done boolean := false;
  v_locations text[] := array[
    'Mactan-Cebu International Airport', 'IT Park, Lahug', 'Ayala Center Cebu',
    'SM Seaside City', 'Hotel delivery — Mandaue', 'Garage — Banilad'
  ];
begin
  perform setseed(0.4242);

  for v in
    select id, daily_rate, plate_number
    from public.vehicles
    where id::text like 'de000001-%'
    order by plate_number
  loop
    v_cursor := '2025-10-01 09:00+08'::timestamptz + make_interval(days => floor(random() * 4)::int);
    -- The Mirage went into the shop mid-September; nothing after that.
    v_stop := case when v.id = 'de000001-0000-4000-8000-000000000003'
                   then '2026-09-15 00:00+08'::timestamptz
                   else v_now + interval '30 days' end;

    loop
      -- Idle gap, then a 1-6 day rental (short rentals are most common).
      v_cursor := v_cursor + make_interval(days => 1 + floor(random() * 4)::int);
      v_days := 1 + floor(power(random(), 1.6) * 6)::int;
      v_start := (date_trunc('day', v_cursor at time zone 'Asia/Manila')
                  + make_interval(hours => 8 + floor(random() * 5)::int)) at time zone 'Asia/Manila';
      v_end := v_start + make_interval(days => v_days);
      exit when v_start >= v_stop;

      v_seq := v_seq + 1;
      v_rental := gen_random_uuid();
      -- Customers 1-13 rent; 14 is blocked and only appears in old history.
      v_customer := ('de000002-0000-4000-8000-'
        || lpad((1 + floor(random() * (case when v_end < '2026-03-01' then 14 else 13 end))::int)::text, 12, '0'))::uuid;
      v_total := v.daily_rate * v_days;
      v_deposit := round(v_total * 0.30, 2);
      v_created := greatest('2025-09-20 09:00+08'::timestamptz,
                            v_start - make_interval(days => 1 + floor(random() * 12)::int, hours => floor(random() * 10)::int));
      v_source := case when random() < 0.45 then 'public_web' else 'ops' end;
      v_cancel := random() < 0.07;
      v_late := false;
      v_penalty := 0;
      v_actual := null;

      if v_cancel and v_start > v_created + interval '1 day' then
        v_status := 'cancelled';
      elsif v_end <= v_now then
        v_status := 'completed';
        v_late := random() < 0.12;
        v_actual := case when v_late then v_end + make_interval(hours => 2 + floor(random() * 6)::int)
                         else v_end - make_interval(mins => floor(random() * 90)::int) end;
      elsif v_start <= v_now then
        v_status := 'active';
      else
        v_status := 'reserved';
      end if;

      -- One unit is overdue right now: out past its return time, not back.
      if not v_overdue_done and v.id = 'de000001-0000-4000-8000-000000000001'
         and v_end > v_now - interval '3 days' and v_start < v_now - interval '1 day' then
        v_end := v_now - interval '20 hours';
        v_days := greatest(1, ceil(extract(epoch from (v_end - v_start)) / 86400)::int);
        v_total := v.daily_rate * v_days;
        v_deposit := round(v_total * 0.30, 2);
        v_status := 'overdue';
        v_actual := null;
        v_late := false;
        v_overdue_done := true;
      end if;

      insert into public.rentals (
        id, reference_number, customer_id, vehicle_id, start_at, expected_return_at,
        actual_return_at, pickup_location, return_location, status, tracking_consent_at,
        quoted_daily_rate, quoted_days, quoted_total, deposit_percent, deposit_amount,
        booking_source, cancellation_reason, cancelled_at, notes, created_at
      ) values (
        v_rental, 'DEMO-' || lpad(v_seq::text, 4, '0'), v_customer, v.id, v_start, v_end,
        v_actual,
        v_locations[1 + floor(random() * array_length(v_locations, 1))::int],
        v_locations[1 + floor(random() * array_length(v_locations, 1))::int],
        v_status,
        case when v_status in ('active', 'overdue') then v_start end,
        v.daily_rate, v_days, v_total, 30, v_deposit,
        v_source,
        case when v_status = 'cancelled'
             then (array['customer_request', 'no_show', 'payment_not_received', 'other'])[1 + floor(random() * 4)::int] end,
        case when v_status = 'cancelled'
             then least(v_created + interval '2 days', v_start - interval '2 hours') end,
        'Demo data', v_created
      );

      -- Deposit: confirmed a few hours after booking (a few upcoming ones are
      -- still waiting for confirmation).
      if v_status = 'reserved' and random() < 0.25 then
        insert into public.payments (rental_id, payment_type, amount, method, status, external_reference, submitted_at)
        values (v_rental, 'deposit', v_deposit, 'gcash', 'submitted',
                'GC' || (100000000 + floor(random() * 899999999))::bigint, v_created + interval '1 hour');
      elsif v_status <> 'cancelled' or random() < 0.5 then
        insert into public.payments (rental_id, payment_type, amount, method, status, external_reference, submitted_at, confirmed_at)
        values (v_rental, 'deposit', v_deposit,
                (array['gcash', 'gcash', 'maya', 'bank'])[1 + floor(random() * 4)::int], 'confirmed',
                'REF' || (100000000 + floor(random() * 899999999))::bigint,
                v_created + interval '1 hour', v_created + interval '3 hours');
        if v_status = 'cancelled' then
          insert into public.payments (rental_id, payment_type, amount, method, status, notes, submitted_at, confirmed_at)
          values (v_rental, 'refund', v_deposit, 'gcash', 'confirmed', 'Deposit refunded on cancellation',
                  v_created + interval '2 days', least(v_created + interval '2 days', v_start - interval '2 hours'));
        end if;
      end if;

      if v_status = 'completed' then
        if v_late then
          v_penalty := 500 * ceil(extract(epoch from (v_actual - v_end)) / 3600 / 4);
          insert into public.payments (rental_id, payment_type, amount, method, status, notes, submitted_at, confirmed_at)
          values (v_rental, 'penalty', v_penalty, 'other', 'confirmed', 'Late return', v_actual, v_actual);
        elsif random() < 0.10 then
          v_penalty := 650;
          insert into public.payments (rental_id, payment_type, amount, method, status, notes, submitted_at, confirmed_at)
          values (v_rental, 'penalty', v_penalty, 'other', 'confirmed', 'Fuel top-up charge', v_actual, v_actual);
        end if;
        insert into public.payments (rental_id, payment_type, amount, method, status, submitted_at, confirmed_at)
        values (v_rental, 'balance', v_total - v_deposit + v_penalty,
                (array['cash', 'cash', 'gcash', 'bank'])[1 + floor(random() * 4)::int], 'confirmed',
                coalesce(v_actual, v_end), coalesce(v_actual, v_end) + interval '15 minutes');
        -- Occasional goodwill refund for an early return.
        if random() < 0.04 then
          insert into public.payments (rental_id, payment_type, amount, method, status, notes, submitted_at, confirmed_at)
          values (v_rental, 'refund', round(v.daily_rate * 0.5, 2), 'gcash', 'confirmed', 'Early return goodwill',
                  coalesce(v_actual, v_end) + interval '1 day', coalesce(v_actual, v_end) + interval '1 day');
        end if;
      end if;

      perform private.refresh_rental_payment_summary(v_rental);
      v_cursor := v_end;
      exit when v_status = 'overdue';
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Expenses, Oct 2025 to today, filed by BIR line. A few carry deliberate
--    defects so the exceptions block has something to show.
-- ---------------------------------------------------------------------------
create temporary table demo_months on commit drop as
select gs::date as month_start
from generate_series('2025-10-01'::date, date_trunc('month', now() at time zone 'Asia/Manila')::date, interval '1 month') gs;

create temporary table demo_cat on commit drop as
select code, id from public.expense_categories;

-- Monthly overheads.
insert into public.expenses (
  expense_date, category_id, vehicle_id, description, supplier_name, supplier_tin, supplier_vat_registered,
  document_type, document_number, gross_amount, input_vat, withholding_required, ewt_percent, ewt_remitted,
  payment_method, notes
)
select
  m.month_start + x.day_offset,
  (select id from demo_cat where code = x.code),
  null,
  x.description || ' — ' || to_char(m.month_start, 'Mon YYYY'),
  x.supplier, x.tin, x.vat_supplier, x.doc,
  case when x.doc = 'payroll' then null else x.prefix || to_char(m.month_start, 'YYMM') end,
  x.amount,
  case when x.vat_supplier then round(x.amount * 12 / 112, 2) else 0 end,
  x.ewt is not null, x.ewt,
  -- The latest month's garage-rent EWT is not remitted yet.
  case when x.ewt is null then false
       else m.month_start < date_trunc('month', now() at time zone 'Asia/Manila')::date end,
  x.method,
  'Demo data'
from demo_months m
cross join (values
  ('rental', 4, 'Garage and parking rent', 'Banilad Property Holdings', '210-555-301-00000', false, 'non_vat_invoice', 'GR-', 18000::numeric, 5::numeric, 'bank'),
  ('salaries_wages', 14, 'Salaries — 2 drivers, 1 front desk', null, null, false, 'payroll', null, 38000, null, 'bank'),
  ('salaries_wages', 28, 'Salaries — 2 drivers, 1 front desk', null, null, false, 'payroll', null, 38000, null, 'bank'),
  ('statutory_contributions', 9, 'SSS, PhilHealth, Pag-IBIG employer share', null, null, false, 'payroll', null, 6200, null, 'bank'),
  ('light_water', 11, 'Electricity — garage and office', 'Visayan Electric Co.', '000-555-111-00000', true, 'vat_invoice', 'VE-', 4850, null, 'gcash'),
  ('light_water', 12, 'Water — garage car wash', 'Metro Cebu Water District', '000-555-112-00000', false, 'non_vat_invoice', 'MW-', 1650, null, 'gcash'),
  ('communication', 6, 'Fiber internet and mobile plans', 'Globe Telecom', '000-555-113-00000', true, 'vat_invoice', 'GT-', 3499, null, 'gcash'),
  ('advertising', 2, 'Facebook and Google ads', 'Meta Platforms Ireland', null, false, 'acknowledgement_receipt', 'FB-', 6500, null, 'bank'),
  ('janitorial', 19, 'Car wash and detailing service', 'Spotless Auto Detailing', '311-555-114-00000', false, 'non_vat_invoice', 'SD-', 7200, 2, 'cash')
) as x(code, day_offset, description, supplier, tin, vat_supplier, doc, prefix, amount, ewt, method)
where m.month_start + x.day_offset <= (now() at time zone 'Asia/Manila')::date;

-- Fuel for deliveries and top-ups, roughly weekly. Every ninth one lost its receipt.
insert into public.expenses (
  expense_date, category_id, vehicle_id, description, supplier_name, supplier_tin, supplier_vat_registered,
  document_type, document_number, gross_amount, input_vat, payment_method, notes
)
select
  d,
  (select id from demo_cat where code = 'fuel_oil'),
  ('de000001-0000-4000-8000-' || lpad((1 + (row_number() over (order by d))::int % 8)::text, 12, '0'))::uuid,
  'Fuel top-up and delivery run',
  case when (row_number() over (order by d)) % 9 = 0 then null else 'Petron Banilad' end,
  case when (row_number() over (order by d)) % 9 = 0 then null else '000-555-120-00000' end,
  (row_number() over (order by d)) % 9 <> 0,
  case when (row_number() over (order by d)) % 9 = 0 then 'none' else 'vat_invoice' end,
  case when (row_number() over (order by d)) % 9 = 0 then null else 'PB-' || to_char(d, 'YYMMDD') end,
  2400 + ((extract(doy from d)::int * 37) % 900),
  case when (row_number() over (order by d)) % 9 = 0 then 0
       else round((2400 + ((extract(doy from d)::int * 37) % 900)) * 12 / 112.0, 2) end,
  'cash',
  'Demo data'
from generate_series('2025-10-03'::date, (now() at time zone 'Asia/Manila')::date, interval '7 days') as g(d);

-- Per-vehicle servicing every quarter, plus one-off repairs.
insert into public.expenses (
  expense_date, category_id, vehicle_id, description, supplier_name, supplier_tin, supplier_vat_registered,
  document_type, document_number, gross_amount, input_vat, withholding_required, ewt_percent, ewt_remitted,
  payment_method, notes
)
select
  q.d + (v.n * 3),
  (select id from demo_cat where code = 'repairs_labor'),
  ('de000001-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  'Periodic maintenance service — ' || v.plate,
  v.dealer, v.dealer_tin, true, 'vat_invoice', 'PMS-' || v.n || to_char(q.d, 'YYMM'),
  v.pms, round(v.pms * 12 / 112, 2),
  true, 2, true,
  'bank',
  'Demo data'
from (values ('2025-11-05'::date), ('2026-02-05'), ('2026-05-05'), ('2026-08-05')) as q(d)
cross join (values
  (1, 'NDA 1801', 'Toyota Cebu (Mandaue)', '004-555-201-00000', 6800::numeric),
  (2, 'NDB 2002', 'Honda Cars Cebu', '004-555-202-00000', 7400),
  (3, 'NDC 1503', 'Mitsubishi Motors Cebu', '004-555-203-00000', 5600),
  (4, 'NDD 3204', 'Honda Cars Cebu', '004-555-202-00000', 9800),
  (5, 'NDE 3805', 'Toyota Cebu (Mandaue)', '004-555-201-00000', 11200),
  (6, 'NDF 4506', 'Hyundai Cebu', '004-555-206-00000', 12600),
  (7, 'NDG 7507', 'Ford Cebu', '004-555-207-00000', 18500),
  (8, 'NDH 6008', 'Audi Cebu', '004-555-208-00000', 21000)
) as v(n, plate, dealer, dealer_tin, pms)
where q.d + (v.n * 3) <= (now() at time zone 'Asia/Manila')::date;

insert into public.expenses (
  expense_date, category_id, vehicle_id, description, supplier_name, supplier_tin, supplier_vat_registered,
  document_type, document_number, gross_amount, input_vat, withholding_required, ewt_percent, ewt_remitted,
  payment_method, notes
)
values
  ('2026-01-08', (select id from demo_cat where code = 'insurance'), null, 'Comprehensive + CTPL fleet policy 2026 (8 units)', 'Pioneer Insurance Cebu', '000-555-301-00000', false, 'official_receipt', 'POL-26-0081', 186400, 0, false, null, false, 'bank', 'Demo data'),
  ('2026-01-20', (select id from demo_cat where code = 'taxes_licenses'), null, 'Mayor''s permit and business tax 2026', 'Cebu City Treasurer', '000-555-901-00000', false, 'official_receipt', 'CTO-26-55102', 21850, 0, false, null, false, 'cash', 'Demo data'),
  ('2026-03-12', (select id from demo_cat where code = 'taxes_licenses'), 'de000001-0000-4000-8000-000000000001', 'LTO registration renewal — NDA 1801', 'Land Transportation Office', '000-555-902-00000', false, 'official_receipt', 'LTO-1801-26', 2860, 0, false, null, false, 'cash', 'Demo data'),
  ('2026-06-18', (select id from demo_cat where code = 'taxes_licenses'), 'de000001-0000-4000-8000-000000000002', 'LTO registration renewal — NDB 2002', 'Land Transportation Office', '000-555-902-00000', false, 'official_receipt', 'LTO-2002-26', 2860, 0, false, null, false, 'cash', 'Demo data'),
  ('2026-02-24', (select id from demo_cat where code = 'repairs_materials'), 'de000001-0000-4000-8000-000000000005', 'Four tires — NDE 3805', 'Gulf Tire Center', '402-555-310-00000', true, 'vat_invoice', 'GT-88231', 38400, 4114.29, true, 1, true, 'bank', 'Demo data'),
  ('2026-04-09', (select id from demo_cat where code = 'repairs_labor'), 'de000001-0000-4000-8000-000000000007', 'Rear bumper respray after parking scrape — NDG 7507', 'Cebu Auto Body Works', null, false, 'non_vat_invoice', 'CAB-1188', 24500, 0, false, null, false, 'cash', 'Demo data'),
  ('2026-07-15', (select id from demo_cat where code = 'repairs_materials'), 'de000001-0000-4000-8000-000000000003', 'Battery replacement — NDC 1503', 'Motolite Express', '402-555-311-00000', false, 'non_vat_invoice', 'ME-5521', 6950, 744.64, false, null, false, 'cash', 'Demo data'),
  ('2026-09-16', (select id from demo_cat where code = 'repairs_labor'), 'de000001-0000-4000-8000-000000000003', 'Transmission overhaul — NDC 1503 (in shop)', 'Mitsubishi Motors Cebu', '004-555-203-00000', true, 'vat_invoice', 'MMC-20931', 58800, 6300, true, 2, false, 'bank', 'Demo data'),
  ('2025-12-15', (select id from demo_cat where code = 'professional_fees'), null, 'Bookkeeping and Q4 2025 filings', 'R. Sison CPA', '501-555-401-00000', false, 'non_vat_invoice', 'RS-2025-14', 15000, 0, true, 10, true, 'bank', 'Demo data'),
  ('2026-04-15', (select id from demo_cat where code = 'professional_fees'), null, 'Annual ITR and Q1 2026 filings', 'R. Sison CPA', '501-555-401-00000', false, 'non_vat_invoice', 'RS-2026-04', 25000, 0, true, 10, true, 'bank', 'Demo data'),
  ('2026-07-15', (select id from demo_cat where code = 'professional_fees'), null, 'Q2 2026 filings', 'R. Sison CPA', '501-555-401-00000', false, 'non_vat_invoice', 'RS-2026-07', 15000, 0, false, null, false, 'bank', 'Demo data'),
  ('2026-05-02', (select id from demo_cat where code = 'transportation_travel'), null, 'Unit pickup trip to Manila dealership', 'Cebu Pacific Air', '000-555-501-00000', true, 'vat_invoice', 'CEB-77120', 9800, 1050, false, null, false, 'gcash', 'Demo data'),
  ('2026-06-01', (select id from demo_cat where code = 'interest'), null, 'Auto loan interest H1 2026 — NDG 7507, NDF 4506', 'BDO Unibank', '000-555-601-00000', false, 'official_receipt', 'BDO-LN-6612', 96500, 0, false, null, false, 'bank', 'Demo data'),
  ('2026-03-03', (select id from demo_cat where code = 'office_supplies'), null, 'Rental agreement forms and printer ink', 'National Book Store', null, true, 'vat_invoice', 'NBS-30117', 3850, 412.50, false, null, false, 'cash', 'Demo data'),
  ('2026-08-22', (select id from demo_cat where code = 'representation'), null, 'Client dinner — Mactan Events renewal', 'Casa Verde', '312-555-701-00000', true, 'vat_invoice', 'CV-90812', 4680, 501.43, false, null, false, 'cash', 'Demo data'),
  ('2026-09-05', (select id from demo_cat where code = 'security_services'), null, 'Garage CCTV monitoring Q3', 'Vigilant Security Systems', '312-555-702-00000', false, 'non_vat_invoice', 'VSS-0933', 9000, 0, false, null, false, 'bank', 'Demo data'),
  ('2026-06-27', (select id from demo_cat where code = 'miscellaneous'), null, 'Toll fees and parking (no receipts)', null, null, false, 'none', null, 1850, 0, false, null, false, 'cash', 'Demo data');

-- ---------------------------------------------------------------------------
-- 6. Fixed-asset register. The A6 is deliberately missing (Block E).
-- ---------------------------------------------------------------------------
insert into public.fixed_assets (
  vehicle_id, name, asset_class, acquisition_date, acquisition_cost, salvage_value,
  useful_life_months, depreciation_method, supplier_name, document_number, notes
)
values
  ('de000001-0000-4000-8000-000000000001', 'Toyota Vios 1.3 XLE — NDA 1801', 'vehicle', '2024-03-10', 830000, 150000, 60, 'straight_line', 'Toyota Cebu (Mandaue)', 'TC-24-1180', 'Demo data'),
  ('de000001-0000-4000-8000-000000000002', 'Honda City 1.5 V — NDB 2002', 'vehicle', '2024-06-01', 1050000, 180000, 60, 'straight_line', 'Honda Cars Cebu', 'HC-24-0612', 'Demo data'),
  ('de000001-0000-4000-8000-000000000003', 'Mitsubishi Mirage G4 GLX — NDC 1503', 'vehicle', '2023-11-15', 760000, 120000, 60, 'straight_line', 'Mitsubishi Motors Cebu', 'MMC-23-4471', 'Demo data'),
  ('de000001-0000-4000-8000-000000000004', 'Honda CR-V S — NDD 3204', 'vehicle', '2025-02-01', 1850000, 400000, 60, 'straight_line', 'Honda Cars Cebu', 'HC-25-0203', 'Demo data'),
  ('de000001-0000-4000-8000-000000000005', 'Toyota Fortuner 2.4 G — NDE 3805', 'vehicle', '2025-05-20', 2100000, 500000, 60, 'straight_line', 'Toyota Cebu (Mandaue)', 'TC-25-0520', 'Demo data'),
  ('de000001-0000-4000-8000-000000000006', 'Hyundai Staria 2.2 Premium — NDF 4506', 'vehicle', '2025-08-01', 2600000, 600000, 60, 'sum_of_years_digits', 'Hyundai Cebu', 'HY-25-0801', 'Demo data'),
  ('de000001-0000-4000-8000-000000000007', 'Ford Mustang 5.0 GT — NDG 7507', 'vehicle', '2025-09-15', 3600000, 1100000, 72, 'straight_line', 'Ford Cebu', 'FC-25-0915', 'Demo data'),
  (null, 'Office laptops and printer', 'equipment', '2025-09-01', 118000, 8000, 36, 'straight_line', 'PC Express Cebu', 'PCX-25-3321', 'Demo data'),
  (null, 'Garage CCTV system', 'equipment', '2025-10-06', 46500, 0, 36, 'declining_balance', 'Vigilant Security Systems', 'VSS-25-1006', 'Demo data');

-- ---------------------------------------------------------------------------
-- 7. 2307s from the two corporate clients (withheld 5% of their payments).
-- ---------------------------------------------------------------------------
insert into public.withholding_certificates (
  payor_name, payor_tin, customer_id, atc_code, period_from, period_to, income_payment, tax_withheld,
  status, received_on, certificate_reference, notes
)
values
  ('Isla Agri Trading Corp.', '201-555-801-00000', 'de000002-0000-4000-8000-000000000011', 'WC100', '2025-10-01', '2025-12-31', 64000, 3200, 'received', '2026-01-18', '2307-IA-25Q4', 'Demo data'),
  ('Isla Agri Trading Corp.', '201-555-801-00000', 'de000002-0000-4000-8000-000000000011', 'WC100', '2026-01-01', '2026-03-31', 72500, 3625, 'received', '2026-04-20', '2307-IA-26Q1', 'Demo data'),
  ('Isla Agri Trading Corp.', '201-555-801-00000', 'de000002-0000-4000-8000-000000000011', 'WC100', '2026-04-01', '2026-06-30', 58000, 2900, 'pending', null, null, 'Demo data'),
  ('Mactan Events & Tours Corp.', '201-555-802-00000', 'de000002-0000-4000-8000-000000000012', 'WC100', '2026-01-01', '2026-03-31', 96000, 4800, 'received', '2026-04-11', '2307-ME-26Q1', 'Demo data'),
  ('Mactan Events & Tours Corp.', '201-555-802-00000', 'de000002-0000-4000-8000-000000000012', 'WC100', '2026-04-01', '2026-06-30', 112000, 5600, 'received', '2026-07-14', '2307-ME-26Q2', 'Demo data'),
  ('Mactan Events & Tours Corp.', '201-555-802-00000', 'de000002-0000-4000-8000-000000000012', 'WC100', '2026-07-01', '2026-09-30', 104500, 5225, 'pending', null, null, 'Demo data');

-- ---------------------------------------------------------------------------
-- 8. VAT-registered from 2026-01-01: flip the setting and re-stamp 2026
--    payments (the trigger re-derives treatment when it is set to null).
-- ---------------------------------------------------------------------------
update public.tax_settings set vat_registered = true;
update public.payments
set vat_treatment = null
where rental_id in (select id from public.rentals where reference_number like 'DEMO-%')
  and coalesce(confirmed_at, submitted_at) >= '2026-01-01 00:00+08';

commit;
