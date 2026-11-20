-- Vending Operations for Claude Code: the schema.
-- A vending and micro market operator's records: sites (the hosts), machines on routes, the
-- planogram (what sits in each slot, at what price and par), warehouse stock by date mark, and
-- every route visit (counted, removed, filled, cash and cashless collected). Sales are worked out
-- from the counts: what was left last visit, minus what is left now.
-- Money is stored in integer cents. Percentages are stored in basis points (1000 = 10.00%).

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table settings (
  key text primary key,
  value text not null,
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  driver text not null default '',
  service_days text not null default '',            -- 'Mon,Thu': the days this route runs
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A site is the host: the business, school, hospital or factory where machines stand.
create table sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text not null default '',
  region text not null default '',                   -- NSW, QLD, VIC, AKL, WLG
  country text not null default 'AU' check (country in ('AU', 'NZ')),
  currency text not null default 'AUD' check (currency in ('AUD', 'NZD')),
  gst_bps int not null default 1000 check (gst_bps between 0 and 3000),  -- 1000 AU, 1500 NZ
  contact_name text not null default '',
  contact_email text not null default '',
  commission_bps int not null default 0 check (commission_bps between 0 and 5000),
  commission_basis text not null default 'net_sales' check (commission_basis in ('net_sales', 'gross_sales')),
  healthy_policy text not null default 'none' check (healthy_policy in ('none', 'nsw_health', 'qld_health', 'nz_health', 'school')),
  everyday_min_pct int check (everyday_min_pct between 0 and 100), -- the healthy policy's Everyday share
  kj_display boolean not null default false,         -- the host asks for kilojoules shown on the machine
  agreement_ends date,                               -- the placement agreement with the host
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                         -- your asset number
  site_id uuid not null references sites(id),
  route_id uuid references routes(id),
  kind text not null default 'snack' check (kind in ('snack', 'drink', 'combo', 'coffee', 'fresh_food', 'micro_market')),
  location_note text not null default '',            -- 'Level 2 staff room'
  make_model text not null default '',
  serial text not null default '',
  cashless boolean not null default true,
  telemetry boolean not null default false,
  visit_interval_days int not null default 7 check (visit_interval_days between 1 and 60),
  installed_on date,
  status text not null default 'active' check (status in ('active', 'repair', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                         -- your SKU or the barcode
  name text not null,
  category text not null default 'snack',            -- snack, confectionery, drink, fresh, coffee
  cost_cents int not null default 0 check (cost_cents >= 0),        -- per unit, ex GST
  default_price_cents int not null default 0 check (default_price_cents >= 0),
  case_size int not null default 1 check (case_size > 0),
  date_mark text not null default 'best_before' check (date_mark in ('use_by', 'best_before', 'none')),
  kj_per_serve int check (kj_per_serve >= 0),        -- what the machine label shows
  healthy_rating text check (healthy_rating in ('everyday', 'occasional', 'not_permitted')),
  sugar_sweetened boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The planogram: one row per slot (coil, spiral, shelf position). Changing the product in a slot
-- keeps the row; visit lines keep the product and price that was there at the time.
create table slots (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  slot text not null,                                -- A1, B4, Shelf 2
  product_id uuid references products(id),
  capacity int not null check (capacity > 0),
  par int not null check (par > 0),                  -- fill to this
  price_cents int not null check (price_cents >= 0),
  active boolean not null default true,
  unique (machine_id, slot),
  check (par <= capacity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table price_changes (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references slots(id) on delete cascade,
  old_cents int not null,
  new_cents int not null,
  changed_on date not null default current_date,
  actor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Warehouse stock by delivery, so the earliest date leaves first.
create table stock_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  received_on date not null default current_date,
  qty_received int not null check (qty_received > 0),
  qty_left int not null check (qty_left >= 0),
  date_mark_on date,                                 -- the use-by or best-before date on the pack
  supplier_ref text not null default '',
  check (qty_left <= qty_received),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  source_file text not null default '',
  rows_read int not null default 0,
  rows_loaded int not null default 0,
  actor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence visit_no_seq start 1001;
create table visits (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('V-' || nextval('visit_no_seq')),
  machine_id uuid not null references machines(id),
  site_id uuid not null references sites(id),       -- where the machine stood on the day
  route_id uuid references routes(id),
  visit_date date not null,
  driver text not null default '',
  status text not null default 'done' check (status in ('done', 'missed')),
  cash_cents bigint not null default 0 check (cash_cents >= 0),        -- counted from the cash box
  cashless_cents bigint not null default 0 check (cashless_cents >= 0), -- card and phone sales since last visit
  import_batch_id uuid references import_batches(id),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visits_machine_date on visits (machine_id, visit_date);

-- One row per slot touched on a visit. sold = what was left last visit minus what was counted
-- now; it is null on the first visit, after a product change, or when the count went up.
create table visit_lines (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  slot_id uuid not null references slots(id),
  product_id uuid references products(id),
  price_cents int not null default 0,
  counted int not null check (counted >= 0),         -- found in the slot on arrival
  removed int not null default 0 check (removed >= 0), -- taken out: past date, damaged
  filled int not null default 0 check (filled >= 0),
  qty_after int not null check (qty_after >= 0),
  sold int check (sold >= 0),
  use_by date,                                       -- earliest date mark in the slot after the visit
  unique (visit_id, slot_id),
  check (removed <= counted),
  check (qty_after = counted - removed + filled),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence call_no_seq start 501;
create table service_calls (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('SC-' || nextval('call_no_seq')),
  machine_id uuid not null references machines(id),
  opened_on date not null default current_date,
  issue text not null,
  reported_by text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_on date,
  resolution text not null default '',
  check ((status = 'closed') = (closed_on is not null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table commission_payments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount_cents bigint not null check (amount_cents >= 0),
  reference text not null default '',
  paid_on date not null,
  actor text not null,
  unique (site_id, month),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references machines(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  actor text not null,
  body text not null,
  check (machine_id is not null or site_id is not null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['settings','routes','sites','machines','products','slots','price_changes','stock_lots','import_batches','visits','visit_lines','service_calls','commission_payments','notes'] loop
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- views

create view slot_last as
select distinct on (vl.slot_id) vl.slot_id, vl.product_id, vl.qty_after, vl.use_by, v.visit_date
from visit_lines vl join visits v on v.id = vl.visit_id
where v.status = 'done'
order by vl.slot_id, v.visit_date desc, v.created_at desc;

-- Daily sales rate per slot from the last 42 days of counts.
create view slot_rate as
select vl.slot_id,
       coalesce(sum(vl.sold) filter (where v.visit_date > current_date - 42), 0)::int as sold_42d,
       min(v.visit_date) as first_visit,
       round(coalesce(sum(vl.sold) filter (where v.visit_date > current_date - 42), 0)::numeric
             / greatest(7, least(42, current_date - min(v.visit_date))), 2) as daily_rate
from visit_lines vl join visits v on v.id = vl.visit_id
where v.status = 'done'
group by vl.slot_id;

create view slot_state as
select s.id as slot_id, m.id as machine_id, m.code as machine, r.code as route, si.name as site, s.slot,
       p.code as product, p.name as product_name, s.capacity, s.par, s.price_cents,
       l.qty_after as last_qty, l.use_by, l.visit_date as last_visit,
       (current_date - l.visit_date) as days_since,
       coalesce(sr.daily_rate, 0) as daily_rate,
       greatest(0, coalesce(l.qty_after, 0) - round(coalesce(sr.daily_rate, 0) * coalesce(current_date - l.visit_date, 0)))::int as est_qty
from slots s
join machines m on m.id = s.machine_id
join sites si on si.id = m.site_id
left join routes r on r.id = m.route_id
left join products p on p.id = s.product_id
left join slot_last l on l.slot_id = s.id
left join slot_rate sr on sr.slot_id = s.id
where s.active and m.status = 'active';

create view machine_due as
select m.id as machine_id, m.code as machine, si.name as site, r.code as route, m.kind, m.visit_interval_days,
       max(v.visit_date) as last_visit,
       (max(v.visit_date) + m.visit_interval_days) as next_due,
       (current_date - (max(v.visit_date) + m.visit_interval_days)) as days_overdue
from machines m
join sites si on si.id = m.site_id
left join routes r on r.id = m.route_id
left join visits v on v.machine_id = m.id and v.status = 'done'
where m.status = 'active'
group by m.id, m.code, si.name, r.code, m.kind, m.visit_interval_days;

-- What each due slot needs: fill to par from the estimated count, never past capacity.
create view pick_needs as
select ss.route, ss.machine, ss.site, ss.slot, ss.product, ss.product_name, ss.par, ss.capacity, ss.est_qty,
       least(ss.capacity, ss.par) - ss.est_qty as to_fill, d.next_due
from slot_state ss
join machine_due d on d.machine_id = ss.machine_id
where ss.product is not null and least(ss.capacity, ss.par) - ss.est_qty > 0;

-- Each visit: what the counts say sold, against what was collected.
create view visit_reconciliation as
select v.id, v.code as visit, m.code as machine, si.code as site, si.currency, v.visit_date, v.driver,
       coalesce(sum(vl.sold * vl.price_cents), 0)::bigint as expected_cents,
       v.cash_cents, v.cashless_cents,
       (v.cash_cents + v.cashless_cents)::bigint as collected_cents,
       (v.cash_cents + v.cashless_cents - coalesce(sum(vl.sold * vl.price_cents), 0))::bigint as variance_cents,
       count(vl.id)::int as slots_counted,
       count(vl.id) filter (where vl.sold is null)::int as slots_unknown
from visits v
join machines m on m.id = v.machine_id
join sites si on si.id = v.site_id
left join visit_lines vl on vl.visit_id = v.id
where v.status = 'done'
group by v.id, v.code, m.code, si.code, si.currency, v.visit_date, v.driver, v.cash_cents, v.cashless_cents;

create view cash_variance as
select r.*, (select value::int from settings where key = 'cash_tolerance_cents') as tolerance_cents
from visit_reconciliation r
where r.slots_unknown = 0
  and abs(r.variance_cents) > coalesce((select value::int from settings where key = 'cash_tolerance_cents'), 500);

-- The last 28 days, per machine.
create view machine_performance as
select m.code as machine, si.name as site, m.kind, si.currency,
       coalesce(sum(vl.sold), 0)::int as units,
       coalesce(sum(vl.sold * vl.price_cents), 0)::bigint as sales_cents,
       coalesce(sum(vl.sold * p.cost_cents), 0)::bigint as product_cost_cents,
       coalesce(sum(vl.removed * p.cost_cents), 0)::bigint as waste_cents,
       round(coalesce(sum(vl.sold * vl.price_cents), 0) / 4.0)::bigint as weekly_sales_cents,
       (coalesce(sum(vl.sold * vl.price_cents), 0) * 10000 / (10000 + si.gst_bps)
         - coalesce(sum(vl.sold * vl.price_cents), 0) * 10000 / (10000 + si.gst_bps) * si.commission_bps / 10000
         - coalesce(sum(vl.sold * p.cost_cents), 0) - coalesce(sum(vl.removed * p.cost_cents), 0))::bigint as margin_cents
from machines m
join sites si on si.id = m.site_id
left join visits v on v.machine_id = m.id and v.status = 'done' and v.visit_date > current_date - 28
left join visit_lines vl on vl.visit_id = v.id
left join products p on p.id = vl.product_id
where m.status = 'active'
group by m.code, si.name, m.kind, si.currency, si.gst_bps, si.commission_bps;

create view site_commission as
select si.id as site_id, si.code as site, si.name, to_char(v.visit_date, 'YYYY-MM') as month, si.currency,
       sum(v.cash_cents + v.cashless_cents)::bigint as collected_cents,
       round(sum(v.cash_cents + v.cashless_cents) * si.gst_bps / (10000.0 + si.gst_bps))::bigint as gst_cents,
       (sum(v.cash_cents + v.cashless_cents) - round(sum(v.cash_cents + v.cashless_cents) * si.gst_bps / (10000.0 + si.gst_bps)))::bigint as net_sales_cents,
       si.commission_bps, si.commission_basis,
       round(case when si.commission_basis = 'gross_sales' then sum(v.cash_cents + v.cashless_cents)
                  else sum(v.cash_cents + v.cashless_cents) - round(sum(v.cash_cents + v.cashless_cents) * si.gst_bps / (10000.0 + si.gst_bps)) end
             * si.commission_bps / 10000.0)::bigint as commission_cents,
       coalesce(max(cp.amount_cents), 0)::bigint as paid_cents,
       max(cp.paid_on) as paid_on
from visits v
join sites si on si.id = v.site_id
left join commission_payments cp on cp.site_id = si.id and cp.month = to_char(v.visit_date, 'YYYY-MM')
where v.status = 'done' and si.commission_bps > 0
group by si.id, si.code, si.name, to_char(v.visit_date, 'YYYY-MM'), si.currency, si.gst_bps, si.commission_bps, si.commission_basis;

create view expiry as
select ss.machine, ss.site, ss.route, ss.slot, ss.product, ss.product_name, p.date_mark, ss.use_by,
       (ss.use_by - current_date) as days_left, ss.est_qty
from slot_state ss join products p on p.code = ss.product
where ss.use_by is not null and p.date_mark <> 'none' and coalesce(ss.last_qty, 0) > 0
  and ss.use_by <= current_date + coalesce((select value::int from settings where key = 'date_warning_days'), 1);

create view warehouse as
select p.code as product, p.name, p.date_mark, coalesce(sum(l.qty_left), 0)::int as on_hand,
       min(l.date_mark_on) filter (where l.qty_left > 0) as earliest_date,
       coalesce((select sum(ss.daily_rate) from slot_state ss where ss.product = p.code), 0) as fleet_daily_rate,
       case when coalesce((select sum(ss.daily_rate) from slot_state ss where ss.product = p.code), 0) > 0
            then round(coalesce(sum(l.qty_left), 0) / (select sum(ss.daily_rate) from slot_state ss where ss.product = p.code), 1) end as days_cover
from products p left join stock_lots l on l.product_id = p.id
where p.active
group by p.id, p.code, p.name, p.date_mark;

-- Slots found empty on arrival in the last 28 days: sales lost between visits.
create view stockouts as
select m.code as machine, si.name as site, s.slot, p.name as product,
       count(*)::int as times_empty, max(v.visit_date) as last_empty, s.par, s.capacity
from visit_lines vl
join visits v on v.id = vl.visit_id
join slots s on s.id = vl.slot_id
join machines m on m.id = s.machine_id
join sites si on si.id = m.site_id
left join products p on p.id = vl.product_id
where v.status = 'done' and v.visit_date > current_date - 28 and vl.counted = 0 and vl.sold is not null
group by m.code, si.name, s.slot, p.name, s.par, s.capacity;

create view attention as
select 'visit overdue' as item, machine || ' at ' || site as what,
       'due ' || next_due || ', ' || days_overdue || ' days ago' as why, next_due as due
from machine_due where days_overdue > 0
union all
select 'service call open', c.code || ' ' || m.code, c.issue || ' (open ' || (current_date - c.opened_on) || ' days)', c.opened_on
from service_calls c join machines m on m.id = c.machine_id
where c.status = 'open' and current_date - c.opened_on >= coalesce((select value::int from settings where key = 'service_call_days'), 2)
union all
select case when e.days_left < 0 and e.date_mark = 'use_by' then 'past use-by in machine' when e.days_left < 0 then 'past best-before in machine' else 'date mark due' end,
       e.machine || ' ' || e.slot || ' ' || e.product_name, 'date ' || e.use_by, e.use_by
from expiry e
union all
select 'cash short', visit || ' ' || machine, 'collected ' || (collected_cents / 100.0)::numeric(12,2) || ', counts say ' || (expected_cents / 100.0)::numeric(12,2), visit_date
from cash_variance where variance_cents < 0 and visit_date > current_date - 14
union all
select 'selling out', machine || ' ' || slot || ' ' || coalesce(product, ''), 'empty on arrival ' || times_empty || ' times in 28 days', last_empty
from stockouts where times_empty >= 2
union all
select 'warehouse date mark', product || ' ' || name, on_hand || ' on hand, earliest date ' || earliest_date, earliest_date
from warehouse where on_hand > 0 and earliest_date <= current_date + 7
union all
select 'commission unpaid', site || ' ' || month, (commission_cents / 100.0)::numeric(12,2) || ' ' || currency || ' due to the host', ((month || '-01')::date + interval '1 month' + interval '14 days')::date
from site_commission
where paid_cents < commission_cents and month < to_char(current_date, 'YYYY-MM')
  and current_date > (month || '-01')::date + interval '1 month' + interval '14 days'
union all
select 'placement agreement ending', code || ' ' || name, 'ends ' || agreement_ends, agreement_ends
from sites where active and agreement_ends is not null and agreement_ends <= current_date + 60;

-- Row level security on: the CLI connects as the table owner. Grant other roles explicitly.
do $$
declare t text;
begin
  foreach t in array array['settings','routes','sites','machines','products','slots','price_changes','stock_lots','import_batches','visits','visit_lines','service_calls','commission_payments','notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public', t);
  end loop;
end $$;
