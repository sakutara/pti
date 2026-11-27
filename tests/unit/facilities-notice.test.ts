import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import { dismissNotice, pendingNotice } from '../../src/data/facilities-notice'
import { loadManifest, resetDatasetCache, type Manifest } from '../../src/data/datasets'
import { t } from '../../src/i18n'
import { formatDateVi } from '../../src/lib/format-date'

const opened: AppDB[] = []
const names: string[] = []

function freshDb(): AppDB {
  const name = 't-' + crypto.randomUUID()
  names.push(name)
  const db = new AppDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close()
  for (const name of names.splice(0)) await Dexie.delete(name)
  vi.unstubAllGlobals()
})

function manifestWith(version: string, changes?: { added: number; removed: number; changed: number }): Manifest {
  return {
    schema: 1,
    datasets: {
      facilities: {
        files: ['facilities/pti.json'],
        updatedAt: '2026-11-01',
        version,
        ...(changes ? { changes } : {}),
      },
    },
  }
}

async function seedSeen(db: AppDB, version: string): Promise<void> {
  await db.settings.put({ key: 'seenFacilitiesVersion', value: version, updatedAt: Date.now() })
}

describe('facilities.freshness.notice', () => {
  it('facilities.freshness.notice: a new bundled version returns the notice with the counts', async () => {
    const db = freshDb()
    await seedSeen(db, '2026-10')

    const notice = await pendingNotice(
      manifestWith('2026-11', { added: 3, removed: 1, changed: 2 }),
      db,
    )

    expect(notice).toEqual({ version: '2026-11', added: 3, removed: 1, changed: 2 })
  })

  it('facilities.freshness.notice: the notice text reads "thêm 3, bỏ 1, thay đổi 2"', () => {
    expect(
      t('facilities.notice', { added: 3, removed: 1, changed: 2 }),
    ).toBe('Danh sách cơ sở y tế đã cập nhật: thêm 3, bỏ 1, thay đổi 2')
  })

  it('facilities.freshness.notice: after dismissNotice the same version never returns the notice', async () => {
    const db = freshDb()
    await seedSeen(db, '2026-10')
    const manifest = manifestWith('2026-11', { added: 3, removed: 1, changed: 2 })

    expect(await pendingNotice(manifest, db)).not.toBeNull()
    await dismissNotice('2026-11', db)

    expect(await pendingNotice(manifest, db)).toBeNull()
  })

  it('facilities.freshness.notice: dismissing is device-only and writes no outbox op', async () => {
    const db = freshDb()
    await seedSeen(db, '2026-10')

    await dismissNotice('2026-11', db)

    expect((await db.settings.get('seenFacilitiesVersion'))?.value).toBe('2026-11')
    expect(await db.outbox.count()).toBe(0)
  })

  it('facilities.freshness.notice: the first run stores the version and shows no notice', async () => {
    const db = freshDb()
    const manifest = manifestWith('2026-11', { added: 3, removed: 1, changed: 2 })

    expect(await pendingNotice(manifest, db)).toBeNull()
    expect((await db.settings.get('seenFacilitiesVersion'))?.value).toBe('2026-11')
    expect(await pendingNotice(manifest, db)).toBeNull()
  })

  it('facilities.freshness.notice: the same version as last seen shows no notice', async () => {
    const db = freshDb()
    await seedSeen(db, '2026-11')

    expect(await pendingNotice(manifestWith('2026-11', { added: 1, removed: 0, changed: 0 }), db)).toBeNull()
  })

  it('facilities.freshness.notice: a manifest without a facilities entry shows no notice', async () => {
    const db = freshDb()
    await seedSeen(db, '2026-10')

    expect(await pendingNotice({ schema: 1, datasets: {} }, db)).toBeNull()
  })

  it('facilities.freshness.notice: changes read from the fetched manifest JSON reach the notice', async () => {
    const db = freshDb()
    await seedSeen(db, '2026-10')
    resetDatasetCache()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schema: 1,
            datasets: {
              facilities: {
                files: ['facilities/pti.json'],
                updatedAt: '2026-11-01',
                version: '2026-11',
                changes: { added: 3, removed: 1, changed: 2 },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const loaded = await loadManifest()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(await pendingNotice(loaded.data, db)).toEqual({
      version: '2026-11',
      added: 3,
      removed: 1,
      changed: 2,
    })
  })
})

describe('facilities.freshness.date', () => {
  it('facilities.freshness.date: the date line reads "Dữ liệu PTI cập nhật ngày 01/11/2026"', () => {
    expect(t('facilities.freshness.date', { date: formatDateVi('2026-11-01') })).toBe(
      'Dữ liệu PTI cập nhật ngày 01/11/2026',
    )
  })

  it('facilities.freshness.date: the call-before-visit note is present', () => {
    expect(t('facilities.freshness.callFirst')).not.toMatch(/^⟦/)
  })
})
