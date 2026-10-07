# Farm Records v2: test checklist

Work through these in order on a phone (or the browser at phone size). Each step says what to do and what you should see. Tick it, or note what went wrong next to it.

Tips:
- Use made-up names starting with "TEST" (e.g. "TEST heifers") so they're easy to find and archive afterwards. Records are never truly deleted, so test records stay in the history; archiving hides them.
- "Offline" steps: turn on flight mode (or turn off wifi and mobile data) on the phone.

---

## Phase 1: Foundation

### Sign in and sync
- [ ] 1.1 Open the app. The sign-in screen shows "Rural Data Services · Farm Records".
- [ ] 1.2 Sign in with a wrong password. You see "That email and password didn't match".
- [ ] 1.3 Sign in properly. Home shows the farm name, "Tier 1", and "All synced [time]".
- [ ] 1.4 Tap the sync line. It shows "Syncing…" then "All synced" with a new time.
- [ ] 1.5 Close the app, go offline, open it again. Home still shows your farm, and the sync line says "No signal. Showing the last copy on this phone".
- [ ] 1.6 Still offline: add a paddock (step 1.9). The sync line says "No signal. 1 saved on this phone…". Go back online: within a minute it says "All synced".
- [ ] 1.7 With a change waiting to send (offline), tap More, Sign out. It refuses: "1 change hasn't sent yet…".

### Properties and paddocks (More, Properties and paddocks)
- [ ] 1.8 Add a property with no name. You see "Give the property a name."
- [ ] 1.9 Add "TEST block" with PIC "na12". You see the PIC warning (it still saves). Add paddocks "TEST one" (12.5 ha) and "TEST two" with no area.
- [ ] 1.10 Add a second paddock called "test one". You see "There's already a paddock called…".
- [ ] 1.11 Open "TEST two", change its area, save. The list shows the new area.
- [ ] 1.12 Archive "TEST two". It disappears; "Show archived (1)" brings it back; open it and Restore.
- [ ] 1.13 Archive the "TEST block" property, then restore it from "Show archived".

### Lists, classes, modules
- [ ] 1.14 More, Dropdown lists, Treatment reasons: add "Worms" again. You see "Worms is already in the list".
- [ ] 1.15 Add "TEST reason", move it up with ↑, rename it, archive it, then Restore it from Archived.
- [ ] 1.16 Livestock classes: switch to Sheep, add "TEST hoggets" (Mixed), edit it, archive it.
- [ ] 1.17 More, Modules (owner): switch off Spray records and Pasture. Contractor jobs switched on? A pop-up refuses: "Contractor jobs uses…". Tap OK. Switch Spray back on.
- [ ] 1.18 Switch off Vehicle maintenance. Records shows it greyed: "Switched off. Turn it on in More, Modules." Dropdown lists shows the vehicle lists greyed the same way. Switch it back on: they're back to normal.
- [ ] 1.19 Modules: Individual animals and Stud show "Locked · Tier 2/3".
- [ ] 1.20 More, Farm details: change the farm name. "Not saved yet" shows until you tap Save. Save: Home shows the new name.

### Sync problems
- [ ] 1.21 (Two phones, or phone and computer.) Both offline, both add the same treatment reason "TEST dup". Bring both online. The second one's Home shows a red line "1 change couldn't be saved". Tap it: the reason is "There's already one with that name." Drop it.

---

## Phase 2: Livestock

### Mobs
- [ ] 2.1 Stock, Add mob: "TEST heifers", Cattle, 50, Heifers, Already here, in TEST one. The mob page shows 50 head · TEST one · day 1, and history "Starting count: 50 head in TEST one".
- [ ] 2.2 Add mob "TEST steers", 20, Steers (or Mixed), Bought, with a new vendor (name and PIC), NVD number, NLIS "Lodged", weight 400 kg/head (it shows 8,000 kg in all). Carrier: + Add new asks for name and truck rego, and the list shows only carriers (not vendors). (Owner: a price.) History says "Bought: 20 head into…" with the NVD.
- [ ] 2.3 Stock list groups mobs under their paddock, with on-hand totals at the top and on Home.

### Moving and counting
- [ ] 2.4 Move TEST heifers to TEST two, count 50. History: "Moved TEST one → TEST two · counted 50 of 50".
- [ ] 2.5 Move them back counting 48, choose Recount later. The button says "Move to …: counted 48, recount later". Head stays 50; "Recount due" shows on the mob, the stock list and Home's Coming up.
- [ ] 2.6 Count them: 49, Accept, Missing. Head is 49; the recount reminder is gone.
- [ ] 2.7 Move again counting 47, Accept, Dead found. History shows "2 dead (dead found)"; head 47.
- [ ] 2.8 Put TEST steers in the same paddock. Count TEST heifers 48 (one over), Accept, Boxed with another mob, choose TEST steers. Heifers +1, steers −1.
- [ ] 2.9 Stock list: the shared paddock has "Move all". Move both together; untick one; then do it again with both ticked. Each mob gets its own history entry.
- [ ] 2.10 Move a mob into a paddock that has another mob. Choose "Merge into…". One mob remains with both lots of head; the other is archived.
- [ ] 2.11 Move a mob to the other property. It asks for an NVD number.
- [ ] 2.12 Open a move in a mob's history: change its date with a reason. Then delete it: the head and paddock go back to before (and any linked adjustment is deleted too).

### Chemicals (Records, Chemicals)
- [ ] 2.13 Add product "TEST Cydectin", Animal, counted in L, group ML, WHP 42, ESI 42.
- [ ] 2.14 Received: new batch 4471K, expiry next year, 3 L. On hand 3 L. (Owner: a cost; staff don't see the cost field.)
- [ ] 2.15 Write off 0.4 L, Leaked or spilled. On hand 2.6 L; the ledger shows both lines.
- [ ] 2.16 Stocktake: actually there 2.5 L. An adjustment of −0.1 L appears. On hand 2.5 L.
- [ ] 2.17 Tap a ledger line, change the quantity, save. On hand updates. Delete it: on hand updates again.
- [ ] 2.18 Receive a batch expiring within 30 days. The list shows "1 batch expires within 30 days"; Home's Coming up lists it.

### Treatments and withholds
- [ ] 2.19 From TEST heifers, Treat: TEST Cydectin from batch 4471K, used 1.79 L, Worms, Pour-on. WHP/ESI fill in from the label and show "Until [date]" (treatment date + 42).
- [ ] 2.20 Save. The mob shows "Under withhold. WHP until…" in red, "At a glance" shows the drench with "Group ML", and the history shows "Treated…". Stock list shows a "WHP until" badge; Home shows 1 mob under withhold.
- [ ] 2.21 Chemicals: TEST Cydectin is down by 1.79 L, with "Used on TEST heifers" in the ledger.
- [ ] 2.22 Treat again with another group ML product: you see "…same group, so consider rotating".
- [ ] 2.23 Open the treatment. Change the product to "Not in the list" and type a new one: WHP and ESI clear and can be typed in. A warning says it replaces the saved product. Save: only that treatment changes. Typing a name that already exists uses that product (no duplicate).
- [ ] 2.24 Open the treatment from Records, Treatments. Change the date: the withhold dates move. Delete it: the withhold disappears and the chemical goes back into stock.

### Splits, merges, sales and deaths
- [ ] 2.25 With TEST heifers under withhold, Split 10 into "TEST split". It won't save until you choose Apply / Don't apply the withhold. Choose Apply: TEST split shows the withhold and the inherited treatment ("given in TEST heifers").
- [ ] 2.26 Split again choosing Don't apply: the new mob is clear to sell.
- [ ] 2.27 Merge TEST split back into TEST heifers (Merge button). Head adds up; TEST split is archived. If the mob going in is under withhold and you choose "Don't apply", a warning says the treated stock won't show as under withhold. If the mob it goes into is under withhold, a note says to keep track of the untreated ones.
- [ ] 2.28 Sold or left: Saleyard, domestic, today, while under WHP. A red warning shows; it won't save without a reason. Give one: it saves. NLIS "To do" shows in Coming up until you open the record and set NLIS to Lodged.
- [ ] 2.29 (Optional, two phones.) Phone A offline: treat TEST steers. Phone B offline: sell TEST steers. Bring B online, then A. Home on the owner's phone shows a red "Check now" alert for the sale inside the withhold. Open it, Mark resolved with a note.
- [ ] 2.30 Deaths: 1, cause "TEST snake bite". Head drops by 1; history "1 dead (test snake bite)".
- [ ] 2.31 Add stock to a mob: Bought, 5 head, vendor, NVD. Head goes up by 5.
- [ ] 2.32 A mob sold down to 0 shows under "No head left"; its page says to archive it. Archive it from Edit.

### Roles
- [ ] 2.33 (Needs a staff login.) Staff can do all of the above except: no price or cost fields, can't change Modules or the farm name.

---

## Phase 3: Map, issues, people and contractor jobs

Before you start: in Supabase, Authentication, URL Configuration, set the Site URL to the app's web address (e.g. the Netlify link) and add it under Redirect URLs. Invite and password-reset emails link back there. (Supabase's built-in email sends only a few emails an hour; fine for testing.)

### Map
- [ ] 3.1 Tap Map. Aerial imagery shows for anywhere in Australia, with town names and roads over it ("Imagery © Esri" in the corner). Layers, Map: the Geoscience Australia map instead. The prompt says to find the property.
- [ ] 3.2 Tap Find, search the nearest town or road (or tap ◎ to go to where you are). Zoom to the property. Layers: switch between Imagery and Map. Tap ✎, Set start view. Leave and come back: the map opens there.
- [ ] 3.3 ✎, Paddock boundary: tap the corners, then tap the first corner to finish. Choose which paddock it is (or "A new paddock"). The area in ha is worked out. Its name shows on the map.
- [ ] 3.4 A paddock with an area you typed keeps your area; its sheet shows the mapped area too, with "Use the mapped area".
- [ ] 3.5 ✎, tap a paddock, Reshape the boundary: drag a corner, Save. The area updates.
- [ ] 3.6 ✎, Point: add an Energiser unit ("Unit 1 - House block"). ✎, Fence or pipe: draw an electric fence and choose Unit 1; it shows in that unit's colour. Draw a pipe (blue, dashed). Add a trough and a gate.
- [ ] 3.7 ✎, tap the fence: rename it, Reshape, Save. Remove from the map: it disappears.
- [ ] 3.8 Mobs show as labels on their paddock ("Cows · 14"); a mob under withhold is red-outlined.
- [ ] 3.9 Tap a mob, Move (tap a paddock), tap another paddock: the Move screen opens with that paddock chosen.
- [ ] 3.10 Tap a paddock (not editing): its sheet shows the area, who's grazing it, or "Rested N days".
- [ ] 3.11 Layers: switch each layer off and on. Close and reopen the app: your choices are remembered. NDVI and Elevation show as "Coming later".
- [ ] 3.12 ◎ (My location): the blue dot and accuracy ring show, and the map centres on you. (The phone asks for location permission the first time.)
- [ ] 3.13 With two properties, the property name at the top switches between them.

### Issues
- [ ] 3.14 Out in a paddock, tap the orange + on the map. The date/time, GPS (±m), paddock and nearest feature within 50 m fill in. Drag the pin: it says "Pin placed by hand".
- [ ] 3.15 Pick two categories, take two photos, add a note, Save. The issue page shows the photos.
- [ ] 3.16 Offline: report an issue with a photo. Home says it's saved on the phone. Back online: it sends; check the photo is in Supabase, Storage, attachments, issues/….
- [ ] 3.17 The issue shows as an orange ! on the map. Set it to Being fixed, then Done: it leaves the map and the Open list (All still shows it).
- [ ] 3.18 From a paddock or trough sheet, "Report an issue here" puts the pin there.

### People (owner)
- [ ] 3.19 More, People: add a Staff person with your second email. The invite email arrives; the link opens the app at "Choose a password"; after that they're in.
- [ ] 3.20 Signed in as staff: no price or cost fields, no People, no Modules switches.
- [ ] 3.21 Sign-in screen: type an email, tap Forgot password. The email arrives; the link opens "Choose a password".
- [ ] 3.22 Stop a person's access: they can no longer see the farm's records. Give it back.

### Contractor jobs
- [ ] 3.23 Add a contractor in People (role Contractor).
- [ ] 3.24 Records, Contractor jobs, New job: Spraying, the contractor, tick two paddocks (one with stock). The red "Stock are in job paddocks" warning lists the mobs.
- [ ] 3.25 Signed in as the contractor: the app shows only "Your jobs" and More. Open the job: the job paddocks are highlighted on the map, with the instructions. No stock, other paddocks or other records are visible.
- [ ] 3.26 Owner closes the job: the contractor's list is empty.

---

## Phase 4: Spray, pasture, feed, breeding, vehicles, rainfall, documents, reports

### Spray records (Records, Spray records)
- [ ] 4.1 Add a spray product in Chemicals (Spray, counted in L, grazing WHP 7). Receive some.
- [ ] 4.2 Record spraying: date, start and finish time, tick paddocks (ones with stock say "stock in"), target, the product from the batch, rate and amount used, water rate, wind, temperature, humidity, equipment, applicator and licence. A red note says "Don't graze these paddocks until…" (date + the longest grazing WHP).
- [ ] 4.3 The list shows the "Don't graze until" badge. The Map's Spray withholds layer shows those paddocks red-dashed; the paddock sheet says "Spray withhold: don't graze until…".
- [ ] 4.4 Chemicals: the product's stock went down by the amount used, with "Sprayed" in its ledger. Tap the line: it opens the spray record.
- [ ] 4.5 Add a product "Not in the list" (e.g. the contractor's own) with a batch number. It saves without touching stock.
- [ ] 4.6 Edit the record (change a paddock), then delete it: the withhold and chemical use go away.

### Pasture and fertiliser
- [ ] 4.7 Record fertiliser for two paddocks: a product from the shed (amount used comes off stock) or typed in, rate 125 kg/ha. Area fills from the paddocks if mapped.
- [ ] 4.8 Record a pasture improvement for the whole property: species (Phalaris 4 kg/ha) and fertiliser. Next time you type a species, the earlier ones are suggested.
- [ ] 4.9 Attach an agronomist report (PDF) and a soil-test photo. They show on the record and open when tapped (online).
- [ ] 4.10 More, Properties and paddocks, open a paddock: History lists grazing, sprays, fertiliser, pasture work and issues, newest first.

### Contractor recording
- [ ] 4.11 As the contractor, open their job: "Record spraying" only offers the job paddocks. Save. The owner sees it on the job ("Recorded for this job") and in Spray records ("by contractor").

### Feed (Records, Feed)
- [ ] 4.12 Add a feed "Pasture hay", round bales of 400 kg. Add a hay shed (Holds 300 round bales). Feed received: 100 bales into the shed (owner: a cost; DM/ME/CP optional). On the feed's page, Move 10 bales to another shed: both sheds update.
- [ ] 4.13 New ration "Hay": Fed every 2 days, 2 round bales to the mob (or 6 kg per head every day). Put a mob on it. Feed shows days left; Home shows "Days of feed left".
- [ ] 4.14 Feed a mob: it suggests one feed of the ration in whole bales (− / + to change). Save: stock goes down. Delete the feeding: it goes back.
- [ ] 4.15 Write off 2 bales (wet), and Count the shed (stocktake). On hand updates; the ledger lists both.
- [ ] 4.16 A medicated lick with WHP 14: Feed a mob with no ration and choose the lick straight away (no need for + Another feed). A note warns about the withhold; saving puts the mob under withhold, like a treatment.
- [ ] 4.17 Under 14 days of feed left shows in Coming up.

### Breeding (Records, Breeding)
- [ ] 4.18 Joining: cows with a bull mob (or "3 Angus bulls"), start and end. It shows calves due (283 days for cattle; 150 for sheep and goats). The mob's At a glance shows the joining.
- [ ] 4.19 Pregnancy test: tested, pregnant, empty, early/mid/late (sheep also singles/twins).
- [ ] 4.20 Marking: 20 males, 22 females as Calves. The mob's head goes up 42; Reports, reconciliation counts them as Born.
- [ ] 4.21 Weaning: wean the calves into "2027 weaners" in another paddock. Under withhold, it asks to apply or not.
- [ ] 4.22 Calving due within 30 days shows in Coming up.

### Vehicles, rainfall, documents
- [ ] 4.23 Add a vehicle (Hilux, km). Record a service: reading, type, tick Engine oil and Oil filter, parts, done by, next due date, (owner) cost, photo of the invoice.
- [ ] 4.24 A next due date within 14 days shows in Coming up and in red on the vehicle list.
- [ ] 4.25 Rainfall: add 12.5 mm today. This month and this year totals show; By month lists it. Add a Rain gauge point on the map and record against it.
- [ ] 4.26 Documents: add a Biosecurity plan with a review date and attach the PDF. A review due within 30 days shows in Coming up.

### NVD photos
- [ ] 4.27 Sold or left (or Add stock): take a photo of the NVD. Open the record from the mob's history: the photo shows, and more can be added.
- [ ] 4.28 Move a mob to another property: it asks for the NVD number and a photo.

### Reports (Records, Reports)
- [ ] 4.29 The dates start as this financial year. The livestock reconciliation adds up: Open + Born + Bought − Sold − Died ± Other = Close. Starting counts show as Open. Download gives a spreadsheet.
- [ ] 4.30 Open the audit pack: treatment register, movements on and off (with PICs and NVDs), spray records, chemicals on hand, documents. Print or save as PDF: the bottom bar doesn't print.
- [ ] 4.31 Download the treatment, movement and spray registers as spreadsheets and open them in Excel.

---

## Phase 5: Ready to sell

### Install and offline
- [ ] 5.1 On a phone, open the app's web address, sign in, and Add to Home Screen. The Farm Records icon (FR on green) appears; it opens full screen.
- [ ] 5.2 Open it once with signal. Turn on flight mode, close the app fully, open it again: it opens, shows your farm, and the sync line says "No signal".
- [ ] 5.3 After a new version is uploaded: within an hour (or on reopening) the app shows "A new version of Farm Records is ready". Tap Update: it reloads, nothing lost. More, About shows the version.

### Import (More, Import records, owner)
- [ ] 5.4 Import samples/import/"v1 Mob Treatments.csv" (or your own v1 sheet's CSV). The preview counts 4 treatments; 2 skipped rows say why (no date, no product). Import: the treatments appear under Records, Treatments, linked to Cows and Weaners (withholds show).
- [ ] 5.5 Import samples/import/"v1 Stock Movements.csv": 3 movements appear in Reports, the movement register, with PICs and NVDs; 1 skipped (no date); head counts don't change.
- [ ] 5.6 Import the Spray Records, Pasture & Fertiliser and Vehicle Maintenance samples. Check one of each looks right (the John Deere is added to Vehicles; "Top Hill" is kept in the spray notes).
- [ ] 5.7 Fence Map: import samples/import/data.js into The Block. Fences (coloured by unit), pipe, troughs, tank, gate, yards, dam and the five paddock boundaries appear. (The location is made up, west of Tamworth.)
- [ ] 5.8 Undo one import: everything it created disappears (boundaries it added are cleared, and the start view it set).

### RDS tooling (on your computer, from the farm-records-v2 folder)
- [ ] 5.9 node scripts/build-farm.mjs with a farm's config.js makes deploy/<farm>/. Try it with a config containing a secret key: it refuses.
- [ ] 5.10 Make a demo Supabase project. Run scripts/apply-migrations.mjs against it (dry run, then --apply): it ends "Up to date". Run it again: "Up to date" with nothing to apply. (The --apply step is untested until this first real run.)
- [ ] 5.11 Run supabase/seed/demo.sql in the demo project's SQL editor and add a demo login (see the top of the file). Sign in: Kooringa Pastoral shows mobs, a mob under withhold, a spray withhold, feed days, a service due, calving due, an open issue.
- [ ] 5.12 Deploy the invite-user function to the demo project and invite a staff login from the app.
- [ ] 5.13 Work through docs/NEW-FARM.md for the demo project end to end; note anything unclear.

---

## Layout and your own settings

- [ ] N.1 The bottom bar shows Home, Map, Stock, Paddocks, More. Stock has a row of tiles (Treatments, Chemicals, Feed, Breeding) above the mobs; Paddocks and More are tiles. Switched-off modules show greyed (tap: Modules).
- [ ] N.2 Open Treatments, then a treatment. At the bottom, above the bar: "‹ Back" and "Stock ›" without scrolling up. Back goes to the list; Stock goes to Stock. Same for Spray (Paddocks ›) and Vehicles (More ›).
- [ ] N.3 More, Customise: change the bottom bar to Map, Feed, Issues. Save: the bar changes. Sign in on another phone (or browser): the same bar.
- [ ] N.4 Customise Home: untick Coming up, move Quick buttons to the top, choose tiles (e.g. Open issues, Rain this month) and buttons (e.g. Feed, Rain). Save: Home shows them in that order. Another person's Home is unchanged.
- [ ] N.5 "Start again from the standard layout", Save: back to the standard Home and bar.
- [ ] N.6 Report an issue: the map is big, opens on your property with paddock names, fences and water. Tap inside a paddock to put the pin there (or drag it). An issue's own page shows the same map with its pin.
- [ ] N.7 Customise Home: add the Vehicles quick button and the Vehicle services due tile. Save: they show, and Vehicles opens vehicle maintenance.

---

## Elevation and NDVI

- [ ] E.1 Map, Layers: switch on Elevation and contours. Hills are shaded and contour lines appear (wider apart zoomed out). Needs signal.
- [ ] E.2 Tap a trough or tank: it shows its ground height. Tap a pipe or fence: it shows the height at each end, how much it rises or falls, and the highest and lowest points (for gravity feed).
- [ ] E.3 Tap a paddock: it shows its height range (e.g. Height 856–908 m).
- [ ] E.4 Layers: switch on NDVI. The strip at the bottom says "Finding the latest clear satellite pass…" (up to about 15 seconds), then the date; the map shows greener colour for more growth. Cloudy passes are skipped.
- [ ] E.5 Tap a paddock: NDVI value, in words (e.g. good), and the date; next pass, whether it went up or down. The paddock's page (Paddocks, Properties, the paddock) shows Pasture growth (NDVI) bars over time, offline too.
- [ ] E.6 Map, the ruler button: tap along a route. The bar shows the total distance, the last leg and (with signal) the rise or fall. Undo last point and Clear work; Done leaves nothing behind. "Save as a fence or pipe" opens the new-line form with the route.
- [ ] E.7 Tap a fence or pipe: its length shows. Tap a paddock: its perimeter (fencing needed). While drawing a fence or boundary, the bar shows the length so far.

---

## Before going live with a client

- [ ] L.1 Imagery licence confirmed in writing with NSW Spatial Services (or the client's state). Until then the map works online but doesn't save imagery for offline use.
- [ ] L.2 Supabase project is in the client's own account; Site URL and Redirect URLs set; custom SMTP if they'll invite several people.
- [ ] L.3 Supabase Advisors (Security and Performance) are clear on the client's project.
- [ ] L.4 The owner has signed in on their phone, installed it, and synced once with signal.
- [ ] L.5 Prices: a staff login can't see any $ amounts (Reports, chemicals received, sales, vehicle services).
- [ ] L.6 The client has docs/USER-GUIDE.md.
