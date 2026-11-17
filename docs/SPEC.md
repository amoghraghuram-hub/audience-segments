# Audience Studio — Offline Behaviour Segments

**Status:** prototype + spec · **Owner:** Amogh Raghuram · **Catalogue:** Segments_v2.86 (24,379 segments, 37 countries)

## 1. Problem

Audience Studio can activate audiences, but customers can't yet build one from Factori's offline behaviour catalogue (brand visits, place categories, movement personas). Today those segments are sold through sales or shipped as flat IDs to DSPs. Customers want to self-serve: combine catalogue segments with simple boolean logic, see the size before they commit, and push the result to their ad platforms.

## 2. Goal and scope

Let a signed-in Audience Studio user create a segment from the catalogue in under five minutes and activate it to one or more ad destinations, with credits deducted per sync.

In scope: new "Offline behaviour" source in the New segment flow, rule builder, live reach preview, destination selection and configuration, segment list with activation status. Out of scope for v1: lookalike expansion of a catalogue segment, cross-country segments, custom lookback windows, hashed-email matching for walled gardens (MAID only).

## 3. Users and jobs

- **Agency trader / performance marketer.** "Reach people who go to competitor QSRs so I can conquest them on TTD."
- **Brand marketer.** "Target gym-goers aged 25-44 in Singapore on Meta without buying a third-party segment."
- **Factori sales engineer** building a segment on a customer's behalf during a pilot.

## 4. UX

Entry: Segments list → **New segment** → source picker shows **Offline behaviour** (new) alongside the existing sources (Place visitors, Upload a list, Lookalike).

**Step 1 — Define.** Three-pane builder.
- Left: segment name, country (segments are country-scoped; countries without offline coverage are grouped as "Digital coverage only" with a warning), lookback (fixed 90 days, matches the catalogue), source badge.
- Centre: rule groups. Group 1 "Include devices that match any of these"; further groups are AND'd ("Narrow further"); a final **Exclude** group. Each condition is one dimension (Brand visitors, Place category visitors, Geo behaviour, Age range, Gender, Mobile carrier, Purchase intent, Content interest (IAB), Online brand affinity, Online interest events, App category) with one or more segments, shown as chips with their device reach.
- Picker modal: dimensions grouped as Offline behaviour / Demographics & device / Digital behaviour, with counts per country; search across name and description; "Select all" for the filtered list; multi-dimension selection in one visit (each dimension becomes its own OR'd condition in the group).
- Right: estimated reach, share of modelled universe, per-group breakdown, devices removed by exclusions, plain-English description, warning under 1,000 devices.
- Footer: Save as draft, Continue to activation. Both require a name and at least one condition.

**Step 2 — Activate.** Destination grid grouped by Programmatic DSPs, Walled gardens, Connected TV, Onboarding / clean rooms, Export (CSV). Each selected destination gets an account/seat ID and refresh cadence (one-time, daily, weekly). Right rail: segment summary, estimated reach, ID type, estimated credits per month, balance after first month. Per-destination minimum-size warnings. **Activate** sets the segment to Syncing; the list shows Active when the activation service reports success, with matched reach per destination.

**Segments list.** Name + plain-English description, source, country, est. reach, status (Draft / Ready / Syncing / Active), destination marks, updated time. Four tiles: segments, active on channels, est. devices, connected destinations.

## 5. Rule semantics

```
audience = (G1 OR-set) AND (G2 OR-set) AND … AND NOT (Exclude OR-set)
```
- Within a group, segments across all conditions are OR'd.
- Groups are AND'd.
- Exclusions are applied last.
- A condition is one dimension; a group may hold several dimensions.
- Catalogue segments are referenced by `segmentId` (e.g. `LSBSGP1628`), never by name, so renames in the catalogue don't break saved definitions.

## 6. Reach estimation

The prototype models reach client-side from catalogue `deviceReach`:
- Convert each segment to a share `p = reach / U` of a modelled country universe `U = 2.5 × max(largest segment, Σ age bands, Σ gender)`.
- Combine under independence: OR → `1 − Π(1 − p)`, AND → `Π p`, NOT → `p × (1 − q)`.

This is a preview only. Production must compute the exact count from the device-level segment membership tables when the definition is saved, and refresh it with each sync. The response should carry `exactReach`, `computedAt`, and the catalogue version. The UI already labels the number as modelled and explains that the exact count arrives on save.

Why independence is acceptable for a preview: it produces the right order of magnitude and the right direction when the user adds or removes rules, which is what they need while building. It under-counts correlated ORs (Starbucks ∪ coffee-shop category) and over-counts correlated ANDs.

## 7. Data model

```ts
Condition  { id, type: SegmentType, segmentIds: string[] }
Group      { id, conditions: Condition[] }          // OR inside
Definition { name, country, include: Group[], exclude: Condition[] }  // AND across include
Activation { destinationId, accountId, cadence: once|daily|weekly, status: queued|syncing|active|failed, lastSyncAt?, matchedReach? }
Segment    { id, source: 'offline_behaviour', definition, estimatedReach, status: draft|ready|syncing|active, activations[], createdAt, updatedAt }
```

## 8. API contract (proposed)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/audience/catalogue?country=SGP` | Dimensions and segments for one country (cacheable; ~2 MB for all countries, so serve per country). |
| POST | `/api/audience/segments/estimate` | Body: definition. Returns exact or modelled reach with `method: exact|modelled`. Debounce from the UI at ~400 ms. |
| POST / PUT | `/api/audience/segments[/{id}]` | Create or update a definition; returns segment with `exactReach`. |
| POST | `/api/audience/segments/{id}/activations` | Create activations; one job per destination. |
| GET | `/api/audience/segments/{id}` | Includes activation statuses for polling. |
| DELETE | `/api/audience/segments/{id}/activations/{dest}` | Stop refreshing a destination. |

Access check order per request: valid session → active core subscription → active Audience Builder app subscription (platform rules).

## 9. Credits

Activation is usage inside the app, so it burns credits from the shared pool on top of the app subscription fee. Prototype rate card (illustrative): 1 credit per 10,000 devices per sync, minimum 5 per sync, charged when the sync completes. Daily refresh of a 1M-device audience ≈ 3,000 credits/month, so show the monthly estimate before Activate and emit `credits_low` when the projected monthly burn exceeds balance.

## 10. Catalogue data quality (from Segments_v2.86)

Fix before launch, or filter in the catalogue loader:
- 38 of 562 mobile-carrier rows have a description naming a different carrier than the segment (e.g. "VODAFONE ITALIA" described as T-Mobile) and carriers appear under the wrong country (Chunghwa Telecom, StarHub under BRA).
- 146 segments have fewer than 100 devices (56 carrier, 41 IAB, 31 age). Hide or badge anything under the destination minimum.
- 18 duplicate names within the same country and dimension (e.g. two "Avis Visitors" in USA with different IDs). Merge or disambiguate.
- USA has no Age, Gender or Mobile carrier rows; 13 countries (ARG, AUT, BEL, BRA, CHL, COL, DEU, FRA, MCO, MEX, NLD, PER, ZAF) have no offline dimensions.
- Reach magnitudes are not comparable across dimensions (USA "Puzzle & Board games" events = 773M devices vs 2.4K brand rows mostly under 10M). Confirm the counting window per dimension before exposing a single "reach" number.
- Typos in names ("Hobbies & Interets", "liqours"); one brand name lowercase ("xtendbarre visitors").

## 11. Open questions

1. Is the 90-day window fixed by the pipeline, or can we expose 30/60/90?
2. Which destinations have an existing integration today? The grid lists the usual set; remove any we can't fulfil.
3. Minimum audience sizes per destination are placeholders. Replace with each platform's documented floor.
4. Do we want exact counts on every rule change (cost) or only on save (prototype behaviour)?
5. Per-customer vs per-user ownership of segments follows the platform decision on app subscriptions.

## 12. Success metrics

- Segments created from the offline source per active customer per month.
- Define→Activate completion rate; median time to first activation.
- Credits burned through activations.
- Matched-rate per destination (matched / estimated), target ≥ 60%.

## 13. Build sequence

1. Catalogue endpoint + builder UI (this prototype's components, swapped onto the API).
2. Exact-count estimate on save.
3. Activation jobs for two destinations (TTD, Meta), status polling, credit deduction.
4. Remaining destinations, CSV export, refresh scheduler.
5. Lookalike from a catalogue segment (post-v1).

## 14. Changes since this spec (prototype, November 2026)

The prototype has moved on from the sections above. Where they disagree, this section wins.

- **Offline behaviour only.** Digital behaviour types in the catalogue file (purchase intent, content interest, online brand affinity, online interest events, app category) are not offered. They are dropped when the catalogue loads.
- **Coverage is the United States only.** There is no country picker. Geography is a State and City filter (`src/lib/geo.ts`). State and city sizes are census placeholders until per-area device counts are available.
- **The builder is a sentence**, not a rule table: "People in <place> who, in the last 90 days, visited … and who … excluding …".
- **"Has not" rules.** Any include rule can be flipped to its negative by clicking its verb. Several segments in a negated rule means none of them.
- **One way in, two ways to build.** "Offline behaviour" is the only source. Its builder has a campaign brief box below the sentence, offered as a second way to fill it in. A brief is planned by one internal planner service and written straight into the sentence. The app does not expose how planning works. In the prototype `src/lib/planner.ts` stands in for that service, which stays editable by hand. A follow-up that only adds keeps hand edits; one that drops or regroups rules rewrites the sentence and offers an undo. States and cities in the brief become the geography filter. The conversation is stored on the segment (`brief`), so it survives the activation step, saving, reopening and a reload.
- **Reach panel.** Shows a size status (too small, narrow, healthy, very broad) on a log scale and a funnel of what each requirement costs. Thresholds in `src/lib/reach.ts` are placeholders. A too-small audience can be saved as a draft but not activated.
- **Segment ID.** Set at first activation, unique, fixed afterwards. It is the name a buyer searches for in each destination.
- **Looks like the console.** Dark theme, 56px icon rail, slim header and one content panel, with buttons, tabs, inputs and tables sized as measured in console.factori.ai. The segments list follows My Audiences: tabs, search, and a row menu for Results, Edit, Duplicate and Delete. The builder has no left panel.
- **Segments can be deleted** from the list.
- **Sensitive-place policy** (`src/lib/sensitive.ts`). Restricted segments (medical providers, care homes, schools and childcare, worship and social services, pawn and payday, justice and military) cannot be picked, are never suggested by a brief, are hidden from the Claude planner, and block activation if found in an older segment. Use-with-care segments (alcohol, tobacco, gambling, pharmacies) are allowed with a notice. The list is a name-matched placeholder for legal and privacy to replace.
- **Planned impressions.** Activation takes an optional planned impressions figure and checks the frequency it implies against estimated devices reachable on the channel. Campaign start and end dates, scheduling and auto-expiry were built and then removed: timing is managed in the ad channel.
- **Results view.** Every completed sync is recorded per destination (devices sent, devices matched). An activated segment has a Results page with match rate, trend, sync history and next sync. Segments are rebuilt once a month over a 90-day lookback, which is fixed. Per channel the user chooses Monthly refresh or One-time push; due refreshes run automatically. Sync outcomes are simulated in the prototype.
- **Duplicate.** A segment can be copied from the list. The copy keeps rules and geography and drops activations, segment ID and conversation.

Open items: real per-destination minimum sizes, real state and city device counts, US device totals in the catalogue that exceed the population, per-rule lookback and visit frequency (needs visit-level data), and an end-to-end test of the Claude planner.
