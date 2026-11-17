# Audience Studio: Segments (prototype)

Working prototype of the Segments module in Factori Audience Studio. A buyer builds an audience from offline behaviour segments, sees its reach, and activates it to ad channels.

Spec and change log: [docs/SPEC.md](docs/SPEC.md). Section 14 lists everything built since the original spec.

## What it does

- **Sentence builder.** The audience is written as one editable sentence: "People in Texas who, in the last 90 days, visited ... and who ... excluding ...". Any rule can be flipped to "has not".
- **Campaign brief.** Describe the campaign in plain words and it is written into the sentence, which stays editable by hand. Follow-ups adjust it, with undo.
- **Geography.** United States only, filtered by state and city.
- **Reach panel.** Estimated reach, a size status (too small, narrow, healthy, very broad), and what each requirement costs in reach.
- **Sensitive-place policy.** Restricted kinds of place cannot be used; others are flagged for care.
- **Activation.** Channels with their logos, a unique segment ID, a choice per channel between monthly refresh and a one-time push, and an optional planned-impressions check.
- **Results.** Per channel: devices reachable, share reachable, sync history and next sync.
- **List.** Duplicate and delete segments.

## Run

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. Segments are stored in the browser's `localStorage`; two samples appear on first load.

## What is simulated or placeholder

This is a front-end prototype with no backend.

- Reach is estimated in the browser from segment sizes, assuming segments overlap independently.
- State and city sizes are census populations, not device counts.
- Sync results on the Results page are simulated.
- Size thresholds, destination minimums, credit figures and the sensitive-place list are placeholders.
- Brief planning goes through `src/lib/planner.ts`, a stand-in for an internal planner service.

## Regenerate the catalogue

```bash
CSV="/path/to/segments.csv" npm run data
```

Converts the CSV into `public/data/taxonomy.json` (country, then type, then `[segmentId, name, deviceReach, description]`).

## Layout

- `src/components/Builder.tsx`: sentence builder, with `BriefAssistant.tsx`, `SegmentPicker.tsx`, `GeoPicker.tsx` and `ReachPanel.tsx`
- `src/components/Activation.tsx`, `Results.tsx`, `SegmentList.tsx`
- `src/lib/model.ts`: segment, rule and activation types
- `src/lib/reach.ts`: reach estimate, size status and funnel
- `src/lib/geo.ts`: US states and cities
- `src/lib/sensitive.ts`: sensitive-place policy
- `src/lib/planner.ts`, `brief.ts`, `claude.ts`: brief planning
- `src/lib/taxonomy.ts`: catalogue loader
