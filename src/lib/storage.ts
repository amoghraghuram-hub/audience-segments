import type { SavedSegment } from './model'

const KEY = 'factori.audienceStudio.segments.v1'

export function loadSegments(): SavedSegment[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as SavedSegment[]
  } catch { /* storage unavailable: fall through to seed */ }
  return seed()
}

export function saveSegments(list: SavedSegment[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

function seed(): SavedSegment[] {
  const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString()
  return [
    {
      id: 'seed-1', source: 'offline_behaviour', status: 'active', estimatedReach: 457_000, segmentCode: 'FCT_USA_GYM_GOERS_WHO_SHOP_AT_TARGET_ED01',
      createdAt: d(12), updatedAt: d(2),
      definition: {
        name: 'Gym-goers who shop at Target', country: 'USA', geo: { states: [], cities: [] },
        include: [
          { id: 'g1', conditions: [{ id: 'c1', type: 'CATEGORY', segmentIds: ['LSCUSA255'] }] },
          { id: 'g2', conditions: [{ id: 'c2', type: 'BRAND', segmentIds: ['LSBUSA1717'] }] },
        ],
        exclude: [],
      },
      activations: [
        { destinationId: 'ttd', accountId: '8f2k3jd', cadence: 'weekly', status: 'active', lastSyncAt: d(2), matchedReach: 388_410, history: [{ at: d(9), sent: 451_200, matched: 383_500 }, { at: d(2), sent: 457_000, matched: 388_410 }] },
        { destinationId: 'meta', accountId: 'act_2210098', cadence: 'weekly', status: 'active', lastSyncAt: d(2), matchedReach: 301_200, history: [{ at: d(9), sent: 451_200, matched: 296_900 }, { at: d(2), sent: 457_000, matched: 301_200 }] },
      ],
    },
    {
      id: 'seed-2', source: 'offline_behaviour', status: 'draft', estimatedReach: 424_000,
      createdAt: d(1), updatedAt: d(1),
      definition: {
        name: 'Texas in-market furniture buyers', country: 'USA', geo: { states: ['TX'], cities: [] },
        include: [{ id: 'g1', conditions: [{ id: 'c1', type: 'GEO_BEHAVIOUR', segmentIds: ['LSGUSA37'] }] }],
        exclude: [],
      },
      activations: [],
    },
  ]
}
