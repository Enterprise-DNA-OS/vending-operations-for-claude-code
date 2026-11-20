-- Demo data: Harbour Vending Demo, a fictional Sydney operator with 12 machines and one micro
-- market on three routes. Five weeks of route visits are generated from each slot's sales rate,
-- with the problems an operator meets planted on purpose: a visit overdue, a cash box short,
-- a slot that keeps selling out, food past its use-by, a sugary drink at a hospital site,
-- a quiet machine, a host's commission unpaid and a warehouse delivery near its date.
-- Dates are relative to today. Idempotent: a second run does nothing.
do $$
declare
  d0 date := current_date;
  m record;
  s record;
  v_id uuid;
  v_date date;
  v_bound date;
  v_first boolean;
  prev record;
  dem int;
  cnt int;
  rem int;
  fil int;
  sld int;
  ub date;
  expected bigint;
  rate numeric;
begin
  if exists (select 1 from routes where code = 'R1') then return; end if;

  insert into settings (key, value, note) values
    ('cash_tolerance_cents', '500', 'Cash and card within $5.00 of what the counts say sold is not raised'),
    ('date_warning_days', '1', 'Show stock in machines this many days before its date mark'),
    ('service_call_days', '2', 'A service call open this many days needs a person'),
    ('min_weekly_sales_cents', '6000', 'A machine selling under $60.00 a week is a candidate to move'),
    ('min_everyday_default_pct', '75', 'Everyday share used when a site with a healthy policy has none of its own');

  insert into routes (code, name, driver, service_days) values
    ('R1', 'Sydney North', 'Mel Carter', 'Mon,Thu'),
    ('R2', 'Sydney West', 'Tane Wiremu', 'Tue,Fri'),
    ('R3', 'Inner City', 'Priya Nair', 'Mon,Wed,Fri');

  insert into sites (code, name, address, region, country, currency, gst_bps, contact_name, contact_email, commission_bps, commission_basis, healthy_policy, everyday_min_pct, kj_display, agreement_ends) values
    ('S01', 'Harbour Business Park', '12 Wharf Road, Pyrmont', 'NSW', 'AU', 'AUD', 1000, 'Jo Lim', 'facilities@harbourpark.example', 1000, 'net_sales', 'none', null, false, d0 + 40),
    ('S02', 'Demo Northern Hospital', '1 Hospital Drive, St Leonards', 'NSW', 'AU', 'AUD', 1000, 'Retail Services', 'retail@northernhospital.example', 1500, 'net_sales', 'nsw_health', 75, true, d0 + 400),
    ('S03', 'Parramatta Distribution Centre', '40 Freight Lane, Parramatta', 'NSW', 'AU', 'AUD', 1000, 'Sam Doyle', 'site@pdc.example', 800, 'gross_sales', 'none', null, false, d0 + 700),
    ('S04', 'Westside Training Campus', '88 College Street, Blacktown', 'NSW', 'AU', 'AUD', 1000, 'Campus Services', 'services@westside.example', 1200, 'net_sales', 'none', null, false, d0 + 300),
    ('S05', 'Ryde Aquatic Centre', '5 Pool Road, Ryde', 'NSW', 'AU', 'AUD', 1000, 'Centre Manager', 'manager@rydeaquatic.example', 1000, 'net_sales', 'none', null, true, d0 + 500),
    ('S06', 'Botany Freight Depot', '200 Port Road, Botany', 'NSW', 'AU', 'AUD', 1000, 'Depot Office', 'office@botanydepot.example', 0, 'net_sales', 'none', null, false, null),
    ('S07', 'Northside Council Offices', '3 Civic Place, Chatswood', 'NSW', 'AU', 'AUD', 1000, 'Property Team', 'property@northside.example', 500, 'net_sales', 'none', null, false, d0 + 200);

  insert into products (code, name, category, cost_cents, default_price_cents, case_size, date_mark, kj_per_serve, healthy_rating, sugar_sweetened) values
    ('CHIP-SV', 'Salt and vinegar chips 45g', 'snack', 95, 300, 24, 'best_before', 960, 'occasional', false),
    ('CHIP-PL', 'Plain chips 45g', 'snack', 95, 300, 24, 'best_before', 950, 'occasional', false),
    ('CHOC-MB', 'Milk chocolate bar 50g', 'confectionery', 110, 350, 48, 'best_before', 1060, 'not_permitted', false),
    ('NUT-MX', 'Mixed nuts 40g', 'snack', 130, 400, 20, 'best_before', 990, 'everyday', false),
    ('BAR-MU', 'Muesli bar 35g', 'snack', 70, 300, 30, 'best_before', 600, 'occasional', false),
    ('CRK-RC', 'Rice crackers 100g', 'snack', 110, 350, 12, 'best_before', 1700, 'everyday', false),
    ('POP-LT', 'Lightly salted popcorn 25g', 'snack', 80, 300, 24, 'best_before', 480, 'everyday', false),
    ('BAR-PR', 'Protein bar 60g', 'snack', 160, 450, 12, 'best_before', null, 'occasional', false),
    ('WAT-600', 'Spring water 600ml', 'drink', 45, 300, 24, 'best_before', 0, 'everyday', false),
    ('SPK-500', 'Sparkling water 500ml', 'drink', 60, 350, 24, 'best_before', 0, 'everyday', false),
    ('COLA-600', 'Cola 600ml', 'drink', 120, 450, 24, 'best_before', 1080, 'not_permitted', true),
    ('COLAZ-600', 'Cola no sugar 600ml', 'drink', 120, 450, 24, 'best_before', 8, 'occasional', false),
    ('OJ-350', 'Orange juice 350ml', 'drink', 150, 450, 12, 'use_by', 600, 'occasional', false),
    ('MILK-IC', 'Iced coffee milk 500ml', 'drink', 210, 550, 12, 'use_by', 1400, 'occasional', false),
    ('ENRG-250', 'Energy drink 250ml', 'drink', 150, 450, 24, 'best_before', 470, 'not_permitted', true),
    ('SAND-HC', 'Ham and cheese sandwich', 'fresh', 320, 790, 6, 'use_by', 1500, 'occasional', false),
    ('WRAP-CS', 'Chicken salad wrap', 'fresh', 350, 850, 6, 'use_by', 1300, 'everyday', false),
    ('SAL-GB', 'Garden salad bowl', 'fresh', 300, 850, 6, 'use_by', 700, 'everyday', false),
    ('YOG-BY', 'Berry yoghurt 170g', 'fresh', 120, 400, 12, 'use_by', 650, 'everyday', false);

  insert into machines (code, site_id, route_id, kind, location_note, make_model, serial, cashless, telemetry, visit_interval_days, installed_on)
  select x.code, (select id from sites where code = x.site), (select id from routes where code = x.route), x.kind, x.note, x.model, x.serial, true, x.tele, x.every, d0 - 400
  from (values
    ('VM-101', 'S01', 'R3', 'snack', 'Ground floor lobby', 'Snack spiral 40-select', 'SN-40118', false, 7),
    ('VM-102', 'S01', 'R3', 'drink', 'Ground floor lobby', 'Glass-front cooler 36-select', 'DR-36022', false, 7),
    ('VM-103', 'S03', 'R2', 'combo', 'Lunch room', 'Combo 30-select', 'CB-30951', true, 7),
    ('VM-104', 'S03', 'R2', 'drink', 'Dock 4 break area', 'Glass-front cooler 36-select', 'DR-36087', true, 7),
    ('VM-105', 'S02', 'R1', 'snack', 'Emergency waiting room', 'Snack spiral 40-select', 'SN-40263', true, 7),
    ('VM-106', 'S02', 'R1', 'drink', 'Emergency waiting room', 'Glass-front cooler 36-select', 'DR-36301', true, 7),
    ('VM-107', 'S04', 'R2', 'snack', 'Student lounge', 'Snack spiral 40-select', 'SN-40377', false, 7),
    ('VM-108', 'S04', 'R2', 'drink', 'Student lounge', 'Glass-front cooler 36-select', 'DR-36412', false, 7),
    ('VM-109', 'S05', 'R1', 'combo', 'Foyer', 'Combo 30-select', 'CB-30502', true, 7),
    ('VM-110', 'S01', 'R3', 'fresh_food', 'Level 3 kitchen', 'Fresh food lift machine', 'FF-12007', true, 3),
    ('VM-111', 'S07', 'R1', 'snack', 'Level 1 staff room', 'Snack spiral 40-select', 'SN-40519', false, 14),
    ('MM-201', 'S06', 'R2', 'micro_market', 'Driver lounge', 'Micro market fridge and shelving', 'MM-0201', true, 3)
  ) as x(code, site, route, kind, note, model, serial, tele, every);

  -- The planogram. rate = units a day at an average site, used only to make the demo history.
  create temp table _tpl (kind text, slot text, product text, capacity int, par int, price int, rate numeric) on commit drop;
  insert into _tpl values
    ('snack', 'A1', 'CHIP-SV', 12, 10, 300, 0.8), ('snack', 'A2', 'CHIP-PL', 12, 10, 300, 0.6),
    ('snack', 'A3', 'CHOC-MB', 10, 8, 350, 0.9), ('snack', 'A4', 'NUT-MX', 10, 8, 400, 0.4),
    ('snack', 'B1', 'BAR-MU', 12, 10, 300, 0.5), ('snack', 'B2', 'CRK-RC', 10, 8, 350, 0.3),
    ('snack', 'B3', 'POP-LT', 10, 8, 300, 0.3), ('snack', 'B4', 'BAR-PR', 8, 6, 450, 0.3),
    ('drink', 'A1', 'WAT-600', 10, 10, 300, 1.0), ('drink', 'A2', 'SPK-500', 10, 8, 350, 0.4),
    ('drink', 'A3', 'COLA-600', 10, 10, 450, 1.0), ('drink', 'A4', 'COLAZ-600', 10, 8, 450, 0.7),
    ('drink', 'B1', 'OJ-350', 8, 6, 450, 0.3), ('drink', 'B2', 'MILK-IC', 8, 6, 550, 0.5),
    ('drink', 'B3', 'ENRG-250', 8, 6, 450, 0.4),
    ('combo', 'A1', 'CHIP-SV', 12, 10, 300, 0.7), ('combo', 'A2', 'CHOC-MB', 10, 8, 350, 0.6),
    ('combo', 'A3', 'BAR-PR', 8, 6, 450, 0.3), ('combo', 'C1', 'WAT-600', 10, 8, 300, 0.8),
    ('combo', 'C2', 'COLAZ-600', 10, 8, 450, 0.5),
    ('fresh_food', 'A1', 'SAND-HC', 6, 6, 790, 1.2), ('fresh_food', 'A2', 'WRAP-CS', 6, 5, 850, 0.9),
    ('fresh_food', 'A3', 'SAL-GB', 5, 4, 850, 0.6), ('fresh_food', 'A4', 'YOG-BY', 8, 6, 400, 0.8),
    ('micro_market', 'S1', 'SAND-HC', 8, 6, 790, 1.0), ('micro_market', 'S2', 'WRAP-CS', 8, 6, 850, 0.8),
    ('micro_market', 'S3', 'WAT-600', 12, 10, 300, 1.4), ('micro_market', 'S4', 'COLAZ-600', 12, 10, 450, 1.0),
    ('micro_market', 'S5', 'NUT-MX', 10, 8, 400, 0.5), ('micro_market', 'S6', 'BAR-MU', 10, 8, 300, 0.6);

  create temp table _rate (slot_id uuid primary key, rate numeric, product_id uuid, fresh boolean) on commit drop;
  insert into slots (machine_id, slot, product_id, capacity, par, price_cents)
  select mm.id, t.slot, p.id, t.capacity, t.par, t.price
  from machines mm join _tpl t on t.kind = mm.kind join products p on p.code = t.product;

  -- The hospital snack machine was changed to healthier lines; the drink machine was not.
  update slots set product_id = (select id from products where code = 'POP-LT') where slot = 'A3' and machine_id = (select id from machines where code = 'VM-105');
  update slots set product_id = (select id from products where code = 'NUT-MX'), price_cents = 400 where slot = 'A1' and machine_id = (select id from machines where code = 'VM-105');

  insert into _rate
  select sl.id,
         t.rate * case mm.code when 'VM-101' then 1.6 when 'VM-111' then 0.12 when 'MM-201' then 1.4 when 'VM-108' then 0.8 else 1.0 end,
         sl.product_id, p.category = 'fresh'
  from slots sl join machines mm on mm.id = sl.machine_id join _tpl t on t.kind = mm.kind and t.slot = sl.slot
  join products p on p.id = sl.product_id;

  -- Five weeks of visits per machine.
  for m in select mm.*, si.id as sid from machines mm join sites si on si.id = mm.site_id order by mm.code loop
    v_date := d0 - 35 + (abs(hashtext(m.code)) % m.visit_interval_days);
    v_bound := case m.code when 'VM-108' then d0 - 13 else d0 - 1 end;
    v_first := true;
    while v_date <= v_bound loop
      insert into visits (machine_id, site_id, route_id, visit_date, driver)
      values (m.id, m.sid, m.route_id, v_date, (select driver from routes where id = m.route_id))
      returning id into v_id;
      expected := 0;
      for s in select sl.*, r.rate, r.fresh from slots sl join _rate r on r.slot_id = sl.id where sl.machine_id = m.id order by sl.slot loop
        select vl.qty_after, vl.use_by, vv.visit_date into prev
        from visit_lines vl join visits vv on vv.id = vl.visit_id
        where vl.slot_id = s.id order by vv.visit_date desc limit 1;
        if v_first or prev.qty_after is null then
          cnt := 0; sld := null; rem := 0;
        else
          dem := greatest(0, round(s.rate * (v_date - prev.visit_date))::int + (abs(hashtext(s.id::text || v_date::text)) % 3) - 1);
          cnt := greatest(0, prev.qty_after - dem);
          sld := prev.qty_after - cnt;
          rem := case when s.fresh and prev.use_by is not null and prev.use_by <= v_date then cnt else 0 end;
        end if;
        fil := s.par - (cnt - rem);
        ub := case when s.fresh then v_date + 3 + (abs(hashtext(s.id::text || 'shelf' || v_date::text)) % 2)
                   when (select date_mark from products where id = s.product_id) = 'use_by' then v_date + 20
                   else v_date + 150 end;
        insert into visit_lines (visit_id, slot_id, product_id, price_cents, counted, removed, filled, qty_after, sold, use_by)
        values (v_id, s.id, s.product_id, s.price_cents, cnt, rem, fil, cnt - rem + fil, sld, ub);
        expected := expected + coalesce(sld, 0) * s.price_cents;
      end loop;
      update visits set cashless_cents = round(expected * 0.62), cash_cents = expected - round(expected * 0.62) where id = v_id;
      v_first := false;
      v_date := v_date + m.visit_interval_days;
    end loop;
  end loop;

  -- The Inner City cash box came back $23.50 light on the last VM-102 visit.
  update visits set cash_cents = cash_cents - 2350
  where id = (select v.id from visits v join machines mm on mm.id = v.machine_id where mm.code = 'VM-102' order by v.visit_date desc limit 1);

  -- Fresh food: one wrap left in past its use-by, yoghurt due tomorrow.
  update visit_lines set use_by = d0 - 1
  where id = (select vl.id from visit_lines vl join visits v on v.id = vl.visit_id join slots sl on sl.id = vl.slot_id join machines mm on mm.id = sl.machine_id
              where mm.code = 'VM-110' and sl.slot = 'A2' order by v.visit_date desc limit 1);
  update visit_lines set use_by = d0 + 1
  where id = (select vl.id from visit_lines vl join visits v on v.id = vl.visit_id join slots sl on sl.id = vl.slot_id join machines mm on mm.id = sl.machine_id
              where mm.code = 'VM-110' and sl.slot = 'A4' order by v.visit_date desc limit 1);

  -- Price history: chips went up 20 cents across the fleet three weeks ago.
  insert into price_changes (slot_id, old_cents, new_cents, changed_on, actor)
  select sl.id, 280, 300, d0 - 21, 'Demo' from slots sl join products p on p.id = sl.product_id where p.code in ('CHIP-SV', 'CHIP-PL');

  insert into service_calls (machine_id, opened_on, issue, reported_by) values
    ((select id from machines where code = 'VM-104'), d0 - 5, 'Note reader rejecting $10 and $20 notes', 'Sam Doyle (host)');
  insert into service_calls (machine_id, opened_on, issue, reported_by, status, closed_on, resolution) values
    ((select id from machines where code = 'VM-101'), d0 - 18, 'Spiral B2 jammed', 'Jo Lim (host)', 'closed', d0 - 16, 'Spiral replaced on route');

  insert into stock_lots (product_id, received_on, qty_received, qty_left, date_mark_on, supplier_ref)
  select p.id, d0 - 6, x.qty, x.qty, d0 + x.days, x.ref
  from (values
    ('CHIP-SV', 96, 160, 'PO-7712'), ('CHIP-PL', 72, 160, 'PO-7712'), ('CHOC-MB', 96, 200, 'PO-7712'),
    ('NUT-MX', 60, 180, 'PO-7712'), ('BAR-MU', 60, 120, 'PO-7712'), ('CRK-RC', 36, 90, 'PO-7712'),
    ('POP-LT', 48, 120, 'PO-7712'), ('BAR-PR', 24, 150, 'PO-7712'), ('WAT-600', 120, 300, 'PO-7715'),
    ('SPK-500', 48, 300, 'PO-7715'), ('COLA-600', 72, 200, 'PO-7715'), ('COLAZ-600', 8, 200, 'PO-7715'),
    ('OJ-350', 24, 21, 'PO-7715'), ('MILK-IC', 24, 18, 'PO-7715'), ('ENRG-250', 48, 240, 'PO-7715'),
    ('SAND-HC', 12, 2, 'Daily bake'), ('WRAP-CS', 12, 3, 'Daily bake'), ('SAL-GB', 8, 3, 'Daily bake'),
    ('YOG-BY', 24, 5, 'PO-7719')
  ) as x(code, qty, days, ref)
  join products p on p.code = x.code;

  -- Host commission: every site paid for the month before last; Harbour Business Park not yet for last month.
  insert into commission_payments (site_id, month, amount_cents, reference, paid_on, actor)
  select c.site_id, c.month, c.commission_cents, 'EFT ' || c.site || '-' || c.month, (c.month || '-01')::date + 40, 'Demo'
  from site_commission c
  where c.month < to_char(d0, 'YYYY-MM') and not (c.site = 'S01' and c.month = to_char(d0 - interval '1 month', 'YYYY-MM'));

  insert into notes (site_id, actor, body) values
    ((select id from sites where code = 'S02'), 'Demo', 'Retail Services asked for the healthy food and drink review before the agreement is renewed.');
end $$;
