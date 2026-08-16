import { describe, expect, it } from 'vitest'
import type { ScanHistoryEntry } from '../types/history'
import {
  BACKUP_SCHEMA_VERSION,
  createCsvExport,
  createJsonBackup,
  parseHistoryBackup,
} from './historyTransfer'

const legacyEntry: ScanHistoryEntry = {
  id: 'legacy-entry',
  janCode: '4580563378953',
  readAt: '2026-08-05T00:00:00.000Z',
  method: 'camera',
}

const marketEntry: ScanHistoryEntry = {
  ...legacyEntry,
  id: 'market-entry',
  poizon: {
    savedAt: '2026-08-05T00:01:00.000Z',
    state: 'resolved',
    product: {
      spuId: '1045489',
      title: 'Test sneaker',
      brandName: 'Test brand',
      skuId: '600297001',
      globalSkuId: '10600297001',
      janCode: '4580563378953',
      sizes: [{ system: 'JP', value: '28.5' }],
    },
    price: {
      currency: 'JPY',
      globalMinPrice: 33_900,
      asiaMinPrice: 33_900,
      dataAsOf: '2026-08-05T00:00:01.000Z',
    },
  },
}

describe('history backup compatibility', () => {
  it('accepts schema v1 backups without market data', () => {
    const parsed = parseHistoryBackup(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-08-05T00:02:00.000Z',
        history: [legacyEntry],
      }),
    )

    expect(parsed.history).toEqual([legacyEntry])
    expect(parsed.failedCount).toBe(0)
  })

  it('exports schema v3 JSON with saved product data', async () => {
    const backup = createJsonBackup(
      [marketEntry],
      new Date('2026-08-05T00:03:00.000Z'),
    )
    const text = await backup.blob.text()
    const parsed = JSON.parse(text) as {
      schemaVersion: number
      history: ScanHistoryEntry[]
    }

    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(parsed.history[0].poizon?.product?.spuId).toBe('1045489')
  })

  it('adds product columns to the CSV export', async () => {
    const csv = createCsvExport([marketEntry])
    const text = await csv.blob.text()

    expect(text).toContain('商品名')
    expect(text).toContain('Test sneaker')
    expect(text).toContain('1045489')
    expect(text).toContain('33900')
  })
})
