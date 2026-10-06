# Farm Records v2: Database Schema (Draft 2)

Draft 2, 6 October 2026. Updated with Steph's answers to the draft 1 questions. For review before anything is built.

Read alongside `individual-farm-records-handover.md` (decisions 1 to 27). Where this document and the handover disagree, the handover wins and this document gets fixed.

Database: Supabase (Postgres). One database per client. Every client database gets this exact schema, whatever their tier.

---

## Part 1: How it works, in plain English

### The big ideas

1. **Everything can be edited, and every earlier version is kept.** Any record can be opened and changed after saving: tap it, fix it, save. Behind the scenes the database keeps the previous version, who changed it and when. A record that has been edited shows "Edited" with its history one tap away. Nothing is ever lost, and that kept history is what makes the records believable at an LPA audit. A reason for the edit is optional.

2. **Delete means hide, never destroy.** Deleting a record removes it from screens and totals but keeps it in history, so it can be restored.

3. **Totals are worked out, never typed in.** Head count in a mob, where a mob is, chemicals on hand, hay in the shed, active withholds. All of these are calculated from the records. This is what makes editing safe: fix a head count on a past move and every total that depends on it corrects itself.

4. **Records are created on the phone first.** Every record gets its ID on the phone, so it can be made offline, linked to other offline records, and synced later without duplicates.

5. **One schema, every tier.** The individual animals table exists in a Tier 1 database too, it just isn't shown. Upgrading a client is a settings change, not a migration.

### How stock is tracked

A **mob** is a named group of stock contained within one paddock, on one property. A mob can be split into two or more mobs (each new mob can go to a different paddock), and mobs can be merged.

**Several mobs can share a paddock** (e.g. bulls put in with cows for joining). When a mob is moved into a paddock that already holds another mob, the user chooses **Keep separate** (default) or **Merge**. Keeping them separate makes it easy to draft them apart later, and each mob keeps its own treatment history.

**Treatment history always follows the stock:**
- Keep separate: each mob's history stays its own.
- Split: each new mob's history shows everything from the parent mob up to the split ("Before 4 Oct: see Yellow tag heifers"), then its own records after.
- Merge: the merged mob shows the history of every mob that went into it, labelled by where each record came from.
- Tier 2: individual animals carry their own full treatment history through every split, merge and move.

Nothing is copied or lost. History is worked out from the stock event links, so it is always complete.

Every change to stock is a **stock event**: a paddock move, split, merge, arrival, exit (sale, slaughter, agistment out), death, birth/marking, weaning, reclass or count adjustment. Each event has:

- **count lines**: how many head of which class went up or down in which mob (e.g. Mob A: minus 20 heifers; Mob B: plus 20 heifers), and
- **location changes**: which mob ended up in which paddock (or on which outside property).

A mob's head count is the sum of its count lines. Its location is its latest location change. Days in paddock, grazing history and the livestock reconciliation all come from the same records.

A mob can be just a count ("Yellow tag heifers, 50 hd"). In Tier 2, individual animals can also be assigned to mobs. A mob can hold some tagged animals and some untagged head.

### How withholding works

Withholds come from treatments and from medicated feed. A withhold attaches to the mob at the time (and to any individual animals in it).

When a mob under withhold is split or merged, the user sees a **warning** for each receiving mob: "Mob A is under WHP until 12 Nov (Cydectin). Apply this withhold to [new mob]?" They choose **Apply** or **Don't apply** (for example, when they know the head being drafted off weren't treated). The choice, who made it and when are saved on the event, so it shows in history and in the audit pack.

When stock exit for sale or slaughter, the app checks active withholds (WHP always; ESI too when the market is export or unknown) and blocks the exit unless an override reason is entered. The database checks again when the record syncs (see Part 5 for the rare offline case).

Paddocks have their own **grazing withholds** from spray records. Moving a mob into a paddock under grazing withhold shows a warning.

### Who can see what

| Role | Can do |
|---|---|
| Owner | Everything, including settings, users and all prices and costs. |
| Staff | Record, view and edit all farm records, but **never see prices or costs** (purchase and sale prices, chemical, feed, fertiliser and vehicle costs). Price fields are hidden on their screens and blocked in the database. |
| Contractor | Only their assigned jobs: sees the job's paddocks on the map with areas, and submits spray or fertiliser records for those paddocks. Nothing else. Access ends when the job closes. |

These rules are enforced inside the database (Supabase row-level security), not just hidden in the app.

---

## Part 2: Conventions (for the build assistant)

- **Primary keys:** `id uuid`, generated on the device (`crypto.randomUUID()`), so offline records can be created and linked before sync. Inserts are idempotent on `id`.
- **Standard columns on every record table:**
  - `created_by uuid` (the logged-in user, from `auth.uid()`)
  - `recorded_at timestamptz` (when it was entered on the phone)
  - `synced_at timestamptz default now()` (when the server received it)
  - `device_id text` (which phone)
- **Editing and history (every table):**
  - Every table also has `updated_at timestamptz`, `updated_by uuid`, `edit_reason text` (optional) and `deleted_at timestamptz`.
  - UPDATE is allowed (within each role's rights). A trigger copies the previous version of the row into `change_log` before every update, so every version is kept.
  - DELETE is never a real delete: the app sets `deleted_at`, and screens, totals and reports ignore deleted rows. Restore = clear `deleted_at`. Real SQL DELETE is blocked for every role.
  - Setup items that are retired rather than wrong (a sold vehicle, an old paddock) use `archived_at` instead: still valid in history, just no longer offered in dropdowns.
  - Linked rows follow their parent: editing a treatment's quantity updates its chemical ledger entry; deleting a stock event also hides its count lines and location changes. Done in the app's save logic and checked by triggers.
- **Offline edits of the same record:** if two phones edit the same record while offline, the later sync wins on screen, both versions stay in `change_log`, and the record is flagged `edit_conflict` so the owner can check it.
- **Dates:** `date` for the day something happened; `timestamptz` for exact times. The farm's time zone is in `farm_settings`.
- **Money:** `numeric(12,2)`, Australian dollars, **including GST**. All prices and costs live in ONE separate table, `record_prices` (section 3.11), which only the owner role can read or write. Row-level security works on whole rows, not columns, so keeping prices out of the main tables is what actually stops staff seeing them. Staff forms simply don't show price fields.
- **Quantities:** `numeric(14,3)` with the unit stored on the product or feed item, never mixed within one ledger.
- **Species:** `cattle`, `sheep`, `goat`, `other`. Never hard-code cattle-only field names.
- **Geometry:** GeoJSON in `jsonb` (paddock boundaries, map features). Area and point-in-paddock are worked out on the phone. PostGIS only if a later need appears.
- **Attachments:** files live in Supabase Storage; the `attachments` table holds the details and `attachment_links` connects a file to any record.
- **Field names:** plain English, snake_case, no abbreviations that only Steph would know.
- **Tables marked [T2]** are only shown to Tier 2 clients. **[Later]** marks hooks built now for future features.

---

## Part 3: The tables

### 3.1 Farm setup

**farm_settings** (one row)

| Column | Type | Notes |
|---|---|---|
| farm_name | text | |
| tier | int | 1 or 2 (3 later) |
| time_zone | text | e.g. Australia/Sydney |
| lpa_template_version | text | e.g. "ISC LPA-02 Dec-23" |
| gestation_days | jsonb | defaults: cattle 283, sheep 150, goat 150 |
| voice_entry_enabled | boolean | default false |
| schema_version | text | set by the migration tooling |

**properties**: the client's own properties AND outside ones (agistment, regular buyers' PICs).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| pic | text | |
| address | text | |
| is_own | boolean | false for agistment and other outside properties |
| contact_id | uuid → contacts | owner of an outside property |
| centre_lat, centre_lng, default_zoom | numeric | map start position |
| archived_at | timestamptz | |

**paddocks**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| property_id | uuid → properties | |
| name | text | |
| boundary | jsonb | GeoJSON polygon, drawn on the map |
| area_ha | numeric(10,2) | calculated from boundary on save, can be overridden |
| area_overridden | boolean | |
| notes | text | |
| archived_at | timestamptz | |

**contacts**: vendors, buyers, agents, carriers, contractors, vets, agistment partners.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| business_name | text | |
| kinds | text[] | e.g. {vendor, agent} |
| phone, email | text | |
| pic | text | if they have one |
| licence_number | text | e.g. chemical applicator licence |
| archived_at | timestamptz | |

**profiles**: one per login.

| Column | Type | Notes |
|---|---|---|
| user_id | uuid → auth.users | |
| full_name | text | |
| phone | text | fills LPA "treated by" |
| role | text | `owner`, `staff`, `contractor` |
| contact_id | uuid → contacts | for contractors, their business |
| active | boolean | |

**pick_lists**: the simple editable dropdowns (same idea as v1's LISTS).

| Column | Type | Notes |
|---|---|---|
| list_name | text | e.g. `vehicle_work_done`, `treatment_reason`, `issue_category`, `breed`, `pasture_species` |
| value | text | |
| sort_order | int | |
| archived_at | timestamptz | |

Defaults loaded at setup, including vehicle work-done checkboxes: engine oil, oil filter, fuel filter, air filter, cabin filter, hydraulic oil, hydraulic filter, coolant, transmission/diff oil, grease, tyres, brakes, belts, battery, wipers, other.

**livestock_classes**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| species | text | |
| name | text | e.g. Weaner steers, Cows, Calves, Ewes, Lambs |
| sex | text | `male`, `female`, `mixed`, `castrate` |
| sort_order | int | |
| archived_at | timestamptz | |

### 3.2 Livestock

**mobs**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "Yellow tag heifers" |
| species | text | |
| owner_contact_id | uuid → contacts | null = owned by the farm; set for agisted-in or trading partner stock |
| colour | text | for the map |
| notes | text | |
| archived_at | timestamptz | set when a mob is merged away or sold out |

**stock_events**: the header for every stock change.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| event_date | date | |
| event_type | text | `paddock_move`, `split`, `merge`, `arrival`, `exit`, `death`, `birth_marking`, `weaning`, `reclass`, `count_adjustment`, `transfer_between_mobs` |
| reason | text | exits: `sale`, `saleyard`, `slaughter`, `agistment_out`, `return_from_agistment`, `other`. Adjustments: `dead_found`, `missing`, `boxed_with_other_mob`, `strays_extra`, `earlier_miscount`, `unknown` |
| from_property_id, to_property_id | uuid → properties | |
| counterparty_contact_id | uuid → contacts | vendor, buyer or agent |
| nvd_number | text | arrivals, exits, moves between properties |
| market | text | `domestic`, `export`, `unknown` (decides whether ESI is checked) |
| carrier_contact_id | uuid → contacts | |
| truck_rego | text | |
| nlis_transfer_status | text | `to_do`, `lodged`, `carrier_to_lodge`, `not_required` |
| total_weight_kg | numeric(12,1) | |
| average_weight_kg | numeric(8,1) | |
| expected_head | int | moves: the book count shown |
| counted_head | int | moves: what was counted |
| discrepancy_action | text | `recount_later`, `accepted` (an accepted difference creates a linked count_adjustment event) |
| related_event_id | uuid → stock_events | links an adjustment to the move that found it |
| withhold_override_reason | text | required to exit stock under withhold |
| needs_review | boolean | set by the database if a synced exit breaks a withhold with no override |
| notes | text | |
| + standard columns | | |

NVD photos and scans attach through `attachment_links`.

**stock_event_lines**: the count changes.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| stock_event_id | uuid → stock_events | |
| mob_id | uuid → mobs | |
| livestock_class_id | uuid → livestock_classes | |
| head_change | int | plus or minus |
| withhold_choice | text | splits and merges only, when the source mob is under withhold: `applied` or `not_applied` |

**mob_location_changes**: where mobs ended up.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| stock_event_id | uuid → stock_events | |
| mob_id | uuid → mobs | |
| property_id | uuid → properties | |
| paddock_id | uuid → paddocks | null when on an outside property |

**animals** [T2]

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| species | text | |
| visual_tag | text | |
| nlis_id | text | NLIS device / RFID |
| sex | text | |
| livestock_class_id | uuid → livestock_classes | |
| birth_date | date | or birth_year when only the drop is known |
| birth_year | int | |
| breed | text | |
| colour_markings | text | |
| owner_contact_id | uuid → contacts | null = owned by the farm |
| registry_ident | text | for a future Tier 3 stud link |
| dam_id, sire_id | uuid → animals | [Later] Tier 3 |
| notes | text | |
| archived_at | timestamptz | |

Status (on hand, sold, dead, missing) is worked out from events, not stored.

**animal_tags** [T2]: tag history, for replacement tags and NLIS.

| Column | Type | Notes |
|---|---|---|
| animal_id | uuid → animals | |
| tag_type | text | `visual`, `nlis` |
| value | text | |
| applied_date | date | |
| replaced_date | date | |

**animal_event_links** [T2]: which individual animals took part in a stock event (moved, sold, died, missing on a count).

| Column | Type | Notes |
|---|---|---|
| stock_event_id | uuid → stock_events | |
| animal_id | uuid → animals | |
| to_mob_id | uuid → mobs | the mob the animal is in after the event |
| was_scanned | boolean | true if picked up by an RFID scan or CSV import |

**import_batches**: one row per CSV or Sheet import (RFID wand sessions, AgriWebb, Mobble, spreadsheets, the v1 Google Sheet).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| source | text | |
| file_name | text | |
| rows_read, rows_imported, rows_rejected | int | |
| notes | text | |

Records created by an import carry `import_batch_id`, so a bad import can be found and corrected.

### 3.3 Chemicals

**products**: animal treatments, spray chemicals and fertilisers in one list.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | trade name |
| product_kind | text | `animal_treatment`, `spray`, `fertiliser`, `other` |
| active_constituent | text | |
| chemical_group | text | for drench and herbicide rotation |
| apvma_number | text | |
| stock_unit | text | `mL`, `L`, `g`, `kg`, `t`, `dose` |
| label_whp_days | int | farmer-entered from the label |
| label_esi_days | int | |
| label_grazing_whp_days | int | sprays |
| label_harvest_whp_days | int | sprays |
| default_dose_rate | text | e.g. "1 mL/10 kg" |
| default_route | text | |
| track_stock | boolean | fertiliser may not need a ledger |
| archived_at | timestamptz | |

The app shows a note on every WHP field: values are entered by the farmer from the product label, which is the source of truth.

**product_batches**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| product_id | uuid → products | |
| batch_number | text | |
| expiry_date | date | |
| storage_location | text | e.g. Chem shed |

**chemical_ledger**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| batch_id | uuid → product_batches | |
| entry_date | date | |
| entry_type | text | `received`, `used`, `written_off`, `stocktake_adjustment` |
| quantity | numeric(14,3) | plus for received, minus for used and written off |
| write_off_reason | text | `expired`, `leaked_spilled`, `damaged`, `disposed`, `returned`, `other` |
| supplier_contact_id | uuid → contacts | |
| source_table, source_id | text, uuid | the treatment or spray record that used it |
| quick_added | boolean | added on the spot from a treatment or spray form |
| notes | text | |
| + standard columns | | |

### 3.4 Treatments

**treatments**: one per treatment session, following the ISC LPA livestock treatment record.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| treatment_date | date | |
| property_id | uuid → properties | |
| paddock_id | uuid → paddocks | |
| mob_id | uuid → mobs | null if only individual animals |
| head_treated | int | |
| livestock_description | text | |
| treated_by_user_id | uuid → profiles | |
| treated_by_name, treated_by_phone | text | when a vet or contractor without a login did it |
| equipment_cleaned_calibrated | boolean | |
| equipment_cleaned_by | text | |
| notes | text | |
| + standard columns | | |

**treatment_items**: one per product given (multiple products per session).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| treatment_id | uuid → treatments | |
| product_id | uuid → products | |
| batch_id | uuid → product_batches | gives batch number and expiry |
| not_from_inventory | boolean | flagged for tidy-up |
| dose_rate | text | |
| approx_live_weight_kg | numeric(8,1) | |
| route | text | |
| quantity_used | numeric(14,3) | suggested from dose x head x weight, confirmed by the user; creates the ledger `used` entry |
| reason | text | |
| whp_days, esi_days | int | |
| whp_until, esi_until | date | calculated, can be overridden |
| adverse_reactions | text | |
| broken_needle | boolean | |

**treatment_animals** [T2]: individual animals treated, when not the whole mob.

| treatment_id | animal_id |
|---|---|

### 3.5 Breeding (mob level, Tier 1)

**joinings**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| mob_id | uuid → mobs | the females |
| sire_mob_id | uuid → mobs | |
| sire_description | text | e.g. "3 Angus bulls" |
| paddock_id | uuid → paddocks | |
| start_date, end_date | date | |
| expected_birth_start, expected_birth_end | date | calculated from gestation |
| notes | text | |
| + standard columns | | |

**joining_sires** [T2]: individual sires used.

| joining_id | animal_id |
|---|---|

**pregnancy_tests**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| test_date | date | |
| mob_id | uuid → mobs | |
| joining_id | uuid → joinings | |
| tester_name | text | |
| head_tested | int | |
| pregnant, empty | int | |
| early, mid, late | int | stage counts where scanned |
| singles, twins, multiples | int | sheep and goats |
| notes | text | |
| + standard columns | | |

**animal_pregnancy_results** [T2]: per-animal result for a test.

**birth_markings**: marking and branding counts. Each creates a `birth_marking` stock event (the young are added to the mob), so it is linked rather than duplicated.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| stock_event_id | uuid → stock_events | |
| joining_id | uuid → joinings | |
| marking_date | date | |
| males, females | int | |
| notes | text | |

Weaning is a `weaning` stock event (a split by class), so it needs no table of its own.

### 3.6 Land: spray, pasture and fertiliser

**spray_records**: NSW Pesticides Regulation fields, plus grazing withhold.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| spray_date | date | |
| start_time | time | |
| property_id | uuid → properties | |
| situation | text | crop, pasture, fenceline, spot spray |
| target | text | weed or pest |
| water_rate | text | |
| area_ha | numeric(10,2) | |
| wind_speed_direction | text | |
| temperature_c | numeric(4,1) | |
| humidity_delta_t | text | |
| applicator_user_id | uuid → profiles | |
| applicator_name | text | |
| licence_number | text | |
| grazing_withhold_until | date | the latest across all products in the mix |
| harvest_withhold_until | date | |
| job_id | uuid → jobs | when a contractor did it |
| contractor_entered | boolean | for the owner to review |
| notes | text | |
| + standard columns | | |

**spray_record_paddocks**

| spray_record_id | paddock_id |
|---|---|

**spray_record_items**: one per product in the tank mix.

| Column | Type | Notes |
|---|---|---|
| spray_record_id | uuid → spray_records | |
| product_id | uuid → products | |
| batch_id | uuid → product_batches | |
| not_from_inventory | boolean | |
| application_rate | text | e.g. 1.5 L/ha |
| quantity_used | numeric(14,3) | creates the ledger entry |
| grazing_whp_days, harvest_whp_days | int | |

**pasture_records**: fertiliser and pasture improvement (from v1's Pasture & Fertiliser area).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| record_date | date | |
| record_type | text | `fertiliser`, `pasture_improvement` |
| property_id | uuid → properties | |
| whole_property | boolean | |
| area_ha | numeric(10,2) | |
| overall_rate | text | |
| contractor_contact_id | uuid → contacts | |
| job_id | uuid → jobs | |
| contractor_entered | boolean | |
| notes | text | |
| + standard columns | | |

**pasture_record_paddocks**

| pasture_record_id | paddock_id |
|---|---|

**pasture_record_items**: fertiliser products and/or pasture species, each with its own rate.

| Column | Type | Notes |
|---|---|---|
| pasture_record_id | uuid → pasture_records | |
| item_kind | text | `fertiliser`, `species` |
| product_id | uuid → products | fertilisers |
| species_name | text | from the pasture_species pick list |
| rate | text | |
| quantity_used | numeric(14,3) | if the product's stock is tracked |

### 3.7 Feed

**feed_storage_sites**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| property_id | uuid → properties | |
| name | text | e.g. "Big hay shed", "Silo 2" |
| site_type | text | `hay_shed`, `silo`, `bunker_pit`, `other` |
| capacity | numeric(12,2) | optional |
| capacity_unit | text | |
| map_feature_id | uuid → map_features | to show it on the map |
| archived_at | timestamptz | |

**feed_items**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "Lucerne hay", "Barley" |
| feed_type | text | `hay`, `silage`, `grain`, `pellets`, `supplement_lick`, `other` |
| unit | text | `round_bale`, `square_bale`, `t`, `kg` |
| kg_per_unit | numeric(8,1) | for bales, so rations in kg can draw down bales |
| whp_days, esi_days | int | medicated feeds and licks |
| archived_at | timestamptz | |

**feed_lots**: one lot per purchase or on-farm harvest, so quality and paperwork stay with the feed.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| feed_item_id | uuid → feed_items | |
| source | text | `purchased`, `produced_on_farm` |
| supplier_contact_id | uuid → contacts | |
| produced_from_paddock_id | uuid → paddocks | |
| received_date | date | |
| dry_matter_pct, me_mj_kg, crude_protein_pct | numeric(5,2) | from a feed test |
| notes | text | |

The Commodity Vendor Declaration and the feed test attach through `attachment_links`.

**feed_ledger**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| feed_lot_id | uuid → feed_lots | |
| storage_site_id | uuid → feed_storage_sites | |
| entry_date | date | |
| entry_type | text | `purchased`, `produced`, `fed_out`, `written_off`, `stocktake_adjustment`, `moved_between_sites` |
| quantity | numeric(14,3) | in the feed item's unit |
| write_off_reason | text | `spoiled`, `wet`, `vermin`, `other` |
| feeding_event_id | uuid → feeding_events | for `fed_out` |
| notes | text | |
| + standard columns | | |

**rations**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "Weaner backgrounding" |
| notes | text | |
| archived_at | timestamptz | |

**ration_items**

| ration_id | feed_item_id | kg_per_head_per_day |
|---|---|---|

**ration_assignments**

| Column | Type | Notes |
|---|---|---|
| ration_id | uuid → rations | |
| mob_id | uuid → mobs | |
| start_date | date | |
| end_date | date | an end is recorded as a new row ending the assignment |

**feeding_events**: "fed mob X today".

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| feed_date | date | |
| mob_id | uuid → mobs | |
| ration_id | uuid → rations | |
| head_fed | int | pre-filled from the current head count |
| paddock_id | uuid → paddocks | |
| notes | text | |
| + standard columns | | |

Each feeding event creates its `fed_out` ledger rows, pre-filled from ration x head and editable.

### 3.8 Map and field work

**map_features**: everything from the Fence Map except paddocks.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| property_id | uuid → properties | |
| feature_type | text | `fence`, `pipe`, `trough`, `tank`, `dam`, `gate`, `yard`, `electric_unit`, `point`, `other` |
| name | text | |
| geometry | jsonb | GeoJSON point or line |
| electric_unit_id | uuid → map_features | which energiser a fence runs from |
| notes | text | |
| archived_at | timestamptz | |

**issues**: field reports (trough leaking, fence down, weeds).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| reported_at | timestamptz | |
| reported_by | uuid → profiles | |
| categories | text[] | from the issue_category pick list |
| notes | text | |
| lat, lng | numeric(9,6) | |
| paddock_id | uuid → paddocks | auto-tagged on the phone from the pin |
| map_feature_id | uuid → map_features | optional |
| status | text | `new`, `in_progress`, `done` |
| resolved_at | timestamptz | |
| resolved_by | uuid → profiles | |

Issues are editable (status changes), logged in `change_log`. Photos attach through `attachment_links`.

**jobs**: contractor work.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| job_type | text | `spray`, `fertiliser`, `sowing`, `other` |
| contractor_user_id | uuid → profiles | |
| property_id | uuid → properties | |
| start_date, end_date | date | |
| status | text | `open`, `closed` |
| instructions | text | |

**job_paddocks**

| job_id | paddock_id |
|---|---|

**readings**: rainfall now; sensors and NDVI later.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| source | text | `manual`, `sensor`, `satellite` |
| measure | text | `rainfall_mm`, `tank_level_pct`, `ndvi_mean` and later others |
| value | numeric(12,3) | |
| observed_at | timestamptz | |
| property_id | uuid → properties | |
| paddock_id | uuid → paddocks | |
| map_feature_id | uuid → map_features | e.g. a rain gauge or tank |
| external_ref | text | sensor ID or satellite scene ID |

### 3.9 Vehicles

**vehicles**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. Hilux, MF tractor |
| vehicle_type | text | |
| rego, serial_number | text | |
| reading_unit | text | `km`, `hours` |
| archived_at | timestamptz | |

**vehicle_services**

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| service_date | date | |
| vehicle_id | uuid → vehicles | |
| reading | numeric(10,1) | km or hours at service |
| service_type | text | routine service, repair, tyres, inspection, other |
| work_done | text[] | the checkboxes, values from the vehicle_work_done pick list |
| work_done_other | text | |
| parts_used | text | |
| done_by | text | |
| next_due_date | date | feeds reminders |
| next_due_reading | numeric(10,1) | feeds reminders |
| notes | text | |

Editable, with changes logged. Invoices attach through `attachment_links`.

### 3.10 Documents and files

**attachments**: one row per file in Supabase Storage.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| storage_path | text | |
| file_name | text | |
| mime_type | text | |
| size_bytes | bigint | |
| uploaded_by | uuid → profiles | |

**attachment_links**: connects a file to any record (NVD photo to a stock event, soil test to paddocks, CVD to a feed lot).

| attachment_id | record_table | record_id |
|---|---|---|

**documents**: named documents with review dates (biosecurity plan, property risk assessment, animal welfare plan, soil tests, agronomist reports, feed tests).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| title | text | |
| document_kind | text | `biosecurity_plan`, `property_risk_assessment`, `welfare_plan`, `soil_test`, `agronomist_report`, `feed_test`, `other` |
| document_date | date | |
| review_due | date | feeds reminders |
| notes | text | |

Files attach through `attachment_links`, and so do links to paddocks or pasture records, so one soil test can sit in four paddocks' histories.

### 3.11 System tables

**record_prices**: every price and cost, owner-only (staff and contractors can't read or write it).

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| record_table | text | e.g. `stock_events`, `chemical_ledger`, `feed_ledger`, `pasture_records`, `vehicle_services` |
| record_id | uuid | |
| price_per_head | numeric(12,2) | incl. GST |
| price_per_kg | numeric(12,4) | incl. GST |
| total_amount | numeric(12,2) | incl. GST |
| notes | text | |

**change_log**: written by a trigger on every table. Holds every earlier version of every record.

| Column | Type | Notes |
|---|---|---|
| table_name | text | |
| row_id | uuid | |
| action | text | `insert`, `update`, `delete` (soft), `restore`, `archive` |
| old_values, new_values | jsonb | the full row before and after |
| edit_reason | text | optional, from the edit form |
| changed_by | uuid | |
| changed_at | timestamptz | |
| edit_conflict | boolean | two offline edits of the same record |

Price changes are logged too, but those log rows are owner-only.

**alerts**: messages aimed at particular people (unlike reminders, which everyone sees). Used for urgent problems such as a sale found inside a withhold at sync.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid → profiles | who it is for (one row per person) |
| severity | text | `urgent`, `normal` |
| message | text | e.g. "20 steers recorded as sold on Tue 14 Oct while under Cydectin WHP until 12 Nov. Check now." |
| record_table, record_id | text, uuid | the record it is about |
| created_at | timestamptz | |
| read_at | timestamptz | |
| resolved_at, resolved_by | timestamptz, uuid | an owner marks it dealt with, with a note |
| resolution_note | text | |

Shown as a banner in the app until read. Push notifications to phones can be added later using the same table.

**schema_migrations**: which schema version this client database is on. Used by the update tooling.

| version | applied_at | applied_by |
|---|---|---|

---

## Part 4: Worked-out views (no tables of their own)

| View | What it shows |
|---|---|
| `mob_head_counts` | Head per mob per class, from count lines |
| `mob_current_location` | Each mob's paddock or outside property, and days there |
| `active_withholds` | Every mob, animal and paddock still under WHP, ESI or grazing withhold, with the "clear on" date. Includes withholds carried through splits and merges |
| `unaccounted_stock` | Open missing head waiting to be found or written off |
| `chemical_on_hand` | Quantity per product and batch, with expiry warnings |
| `feed_on_hand` | Quantity per feed lot and storage site |
| `feed_days_remaining` | Days of feed left at current rations |
| `mob_history` | Last treatments (with chemical group), moves, preg tests, feeding |
| `paddock_history` | Grazing (which mob, dates, days rested), spray, fertiliser, pasture, rainfall, documents |
| `vehicle_history` | Last service, work done, km or hours since |
| `reminders` | WHP/ESI ending, batch expiry, NLIS to do, recounts, services due, document reviews, expected calving/lambing |
| `livestock_reconciliation` | Opening + births + purchases − sales − deaths ± adjustments = closing, by species and class, for any date range |
| `lpa_audit_pack` | Everything LPA-relevant for a date range, for export |

### Database rules (triggers and checks)

1. **Every change keeps the old version.** A trigger copies the previous row to `change_log` before every update, soft delete and restore.
2. **No real deletes.** SQL DELETE is blocked for every role; deleting sets `deleted_at`.
3. **Withhold check on exits.** An `exit` for sale, saleyard or slaughter is checked against `active_withholds` (ESI too if the market is export or unknown). If there's no override reason, the record is accepted, flagged `needs_review`, and an urgent `alerts` row is created for the person who recorded the exit and for every owner (Part 5, decision 2). The same check runs again when an exit, or a treatment dated before it, is added or edited.
4. **Split and merge withhold choice is required.** When the source mob is under withhold, each receiving mob's line must record `withhold_choice` (`applied` or `not_applied`).
5. **Stock can't go below zero without a flag.** A count line that takes a mob or class below zero is allowed (offline and late entries happen) but raises a reminder to recount.
6. **Chemical and feed stock can go negative but get flagged** for a stocktake.
7. **Contractors are fenced in.** A contractor can only see paddocks in their open jobs, and can only add or edit spray or pasture records with that `job_id`.
8. **Prices are owner-only.** `record_prices` and its change log rows are readable and writable by the owner role only.
9. **Everything is stamped** with who entered it, who last edited it, and when.

---

## Part 5: Decisions

Answered by Steph, 6 Oct 2026:

| # | Question | Decision |
|---|---|---|
| 1 | Can staff see prices? | No. Owner only. |
| 3 | What is a mob? | A mob is contained within one paddock, on one property. It can be split into two or more mobs. |
| 4 | Withholds on split or merge | A warning; the user chooses to apply the withhold to the receiving mob or not. The choice is recorded. |
| 5 | GST | Prices stored including GST. |
| 6 | Editing | Everything can be edited. Every change is logged and earlier versions are kept, but editing must always be possible. |
| 2 | Sale under withhold found only at sync (very rare) | Option (a): keep the record, flag it `needs_review`, and send an urgent alert to BOTH the person who recorded the exit and every owner. |

Background to decision 2, kept for reference:

2. **A sale under withhold that only shows up when phones sync.** Example: Jim drenches the steers on Monday at the yards with no signal, so his phone hasn't synced. On Tuesday Sue, also out of signal, records 20 of those steers as sold to the works. Her phone doesn't know about Monday's drench, so it can't warn her. When both phones get signal, the database sees a sale that happened inside the WHP. What should it do?
   - (a) **Keep the sale record and raise an urgent alert** to the owner: "20 steers recorded as sold on Tuesday while under Cydectin WHP until 12 Nov. Check now." The record of what actually happened is kept, and the owner can contact the agent or buyer straight away. **Recommended.**
   - (b) Refuse the sale record. Sue's phone shows a sync error. The sale isn't in the records until someone re-enters it, and it's lost if her phone is reset. The stock are gone either way, so refusing only hides the problem.

---

## Part 6: What this schema does NOT include yet

- Tier 3 stud: pedigree, EBVs, registry links (only `registry_ident`, `dam_id` and `sire_id` hooks exist).
- Weighing sessions and scale imports (weights are only on arrival and exit for now).
- Sensor, NDVI and elevation imports (the `readings` table is ready for them).
- Voice entry (needs no tables, just a server function).
- Billing or anything to do with Steph's own business: that lives in her CRM, never in a client database.
