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
- [ ] 1.17 More, Modules (owner): switch off Spray records and Pasture. Contractor jobs switched on? It refuses: "Contractor jobs uses…". Switch Spray back on.
- [ ] 1.18 Switch off Vehicle maintenance. Records no longer lists it; Dropdown lists no longer shows the vehicle lists. Switch it back on: they're back.
- [ ] 1.19 Modules: Individual animals and Stud show "Locked · Tier 2/3".
- [ ] 1.20 More, Farm details: change the farm name, save. Home shows it.

### Sync problems
- [ ] 1.21 (Two phones, or phone and computer.) Both offline, both add the same treatment reason "TEST dup". Bring both online. The second one's Home shows a red line "1 change couldn't be saved". Tap it: the reason is "There's already one with that name." Drop it.

---

## Phase 2: Livestock

### Mobs
- [ ] 2.1 Stock, Add mob: "TEST heifers", Cattle, 50, Heifers, Already here, in TEST one. The mob page shows 50 head · TEST one · day 1, and history "Starting count: 50 head in TEST one".
- [ ] 2.2 Add mob "TEST steers", 20, Steers, Bought, with a new vendor (name and PIC), NVD number, NLIS "Lodged", weight 8000 kg. (Owner: a price.) History says "Bought: 20 head into…" with the NVD.
- [ ] 2.3 Stock list groups mobs under their paddock, with on-hand totals at the top and on Home.

### Moving and counting
- [ ] 2.4 Move TEST heifers to TEST two, count 50. History: "Moved TEST one → TEST two · counted 50 of 50".
- [ ] 2.5 Move them back counting 48, choose Recount later. Head stays 50; "Recount due" shows on the mob, the stock list and Home's Coming up.
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
- [ ] 2.23 Treat with "Not in the list (type it in)": a new product is created; no stock is taken.
- [ ] 2.24 Open the treatment from Records, Treatments. Change the date: the withhold dates move. Delete it: the withhold disappears and the chemical goes back into stock.

### Splits, merges, sales and deaths
- [ ] 2.25 With TEST heifers under withhold, Split 10 into "TEST split". It won't save until you choose Apply / Don't apply the withhold. Choose Apply: TEST split shows the withhold and the inherited treatment ("given in TEST heifers").
- [ ] 2.26 Split again choosing Don't apply: the new mob is clear to sell.
- [ ] 2.27 Merge TEST split back into TEST heifers (Merge button). Head adds up; TEST split is archived.
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
- [ ] 3.1 Tap Map. Satellite imagery shows, with "Imagery © Spatial Services NSW" in the corner. The prompt says to find the property.
- [ ] 3.2 Zoom to the property (or tap ◎ to go to where you are). Tap ✎, Set start view. Leave and come back: the map opens there.
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
