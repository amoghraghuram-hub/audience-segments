export type DestinationKind = 'dsp' | 'social' | 'ctv' | 'onboarding' | 'file'

export interface Destination {
  id: string
  name: string
  kind: DestinationKind
  /** short label rendered in the logo tile */
  mark: string
  accountLabel: string
  accountPlaceholder: string
  minReach: number
  idType: 'MAID' | 'MAID + hashed IDs' | 'CSV'
  color: string
}

export const DESTINATIONS: Destination[] = [
  { id: 'ttd', name: 'The Trade Desk', kind: 'dsp', mark: 'TTD', accountLabel: 'Advertiser ID', accountPlaceholder: 'e.g. 8f2k3jd', minReach: 1000, idType: 'MAID', color: '#1b5a63' },
  { id: 'dv360', name: 'Display & Video 360', kind: 'dsp', mark: 'DV', accountLabel: 'Partner / Advertiser ID', accountPlaceholder: 'e.g. 1234567', minReach: 1000, idType: 'MAID', color: '#1961ED' },
  { id: 'amazon', name: 'Amazon DSP', kind: 'dsp', mark: 'AMZ', accountLabel: 'Advertiser ID', accountPlaceholder: 'e.g. 5901234567', minReach: 2000, idType: 'MAID', color: '#743B1B' },
  { id: 'xandr', name: 'Microsoft Invest (Xandr)', kind: 'dsp', mark: 'MSX', accountLabel: 'Member ID', accountPlaceholder: 'e.g. 12345', minReach: 1000, idType: 'MAID', color: '#483473' },
  { id: 'yahoo', name: 'Yahoo DSP', kind: 'dsp', mark: 'Y!', accountLabel: 'MDM ID', accountPlaceholder: 'e.g. 2345678', minReach: 1000, idType: 'MAID', color: '#702C61' },
  { id: 'meta', name: 'Meta Ads', kind: 'social', mark: 'M', accountLabel: 'Ad account ID', accountPlaceholder: 'act_1234567890', minReach: 1000, idType: 'MAID + hashed IDs', color: '#18356D' },
  { id: 'google', name: 'Google Ads', kind: 'social', mark: 'G', accountLabel: 'Customer ID', accountPlaceholder: '123-456-7890', minReach: 1000, idType: 'MAID + hashed IDs', color: '#2A5822' },
  { id: 'tiktok', name: 'TikTok Ads', kind: 'social', mark: 'TT', accountLabel: 'Advertiser ID', accountPlaceholder: 'e.g. 7001234567890', minReach: 1000, idType: 'MAID', color: '#222222' },
  { id: 'samsung', name: 'Samsung Ads (CTV)', kind: 'ctv', mark: 'SA', accountLabel: 'Seat ID', accountPlaceholder: 'e.g. SEAT-4821', minReach: 5000, idType: 'MAID', color: '#0E6874' },
  { id: 'liveramp', name: 'LiveRamp', kind: 'onboarding', mark: 'LR', accountLabel: 'Destination account', accountPlaceholder: 'e.g. 4421', minReach: 1000, idType: 'MAID + hashed IDs', color: '#166747' },
  { id: 'csv', name: 'Download device IDs', kind: 'file', mark: 'CSV', accountLabel: 'File name', accountPlaceholder: 'audience.csv', minReach: 1, idType: 'CSV', color: '#4C4C4C' },
]

export const KIND_LABEL: Record<DestinationKind, string> = {
  dsp: 'Programmatic DSPs',
  social: 'Walled gardens',
  ctv: 'Connected TV',
  onboarding: 'Onboarding / clean rooms',
  file: 'Export',
}

/** Illustrative credit pricing: 1 credit per 10K devices per sync, min 5. Replace with the real rate card. */
export function creditsFor(reach: number, syncsPerMonth: number) {
  return Math.max(5, Math.ceil(reach / 10_000)) * syncsPerMonth
}
