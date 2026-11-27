import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { strFromU8, unzipSync } from 'fflate'
import { AppDB } from '../../src/db/db'
import type { Claim, ClaimEvent } from '../../src/domain/claim-types'
import { exportBackup, importBackup } from '../../src/data/backup'

const opened: AppDB[] = []
const names: string[] = []

function freshDb() {
  const name = 't-' + crypto.randomUUID()
  names.push(name)
  const db = new AppDB(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close()
  for (const name of names.splice(0)) await Dexie.delete(name)
})

function claim(id: string, overrides: Partial<Claim> = {}): Claim {
  return {
    id,
    personId: 'person-1',
    type: 'outpatient',
    status: 'draft',
    treatmentDate: '2026-11-20',
    facilityId: null,
    facilityName: 'Phòng khám ABC',
    reason: 'khám tổng quát',
    originalsSubmittedAt: null,
    daysOff: 0,
    admissionDate: null,
    dischargeDate: null,
    bank: null,
    notApplicable: [],
    diagnosis: null,
    flags: {},
    totalClaimed: 300000,
    approvedAmount: null,
    rejectionReason: null,
    submittedAt: null,
    bundleFileIds: [],
    wizardStep: 2,
    sentVia: null,
    gmailThreadId: null,
    lastSubmittedFileIds: [],
    updatedAt: 100,
    deleted: 0,
    ...overrides,
  }
}

function event(id: string, claimId: string, overrides: Partial<ClaimEvent> = {}): ClaimEvent {
  return { id, claimId, at: 1000, status: 'ready', note: '', amount: null, updatedAt: 100, deleted: 0, ...overrides }
}

describe('backup.export.content: claims', () => {
  it('backup.export.content: zip has the claims and claimEvents tables with their rows', async () => {
    const db = freshDb()
    await db.claims.add(claim('claim-1'))
    await db.claimEvents.add(event('event-1', 'claim-1'))

    const zip = unzipSync(new Uint8Array(await (await exportBackup(db)).blob.arrayBuffer()))

    const claims = JSON.parse(strFromU8(zip['tables/claims.json'])) as Claim[]
    const events = JSON.parse(strFromU8(zip['tables/claimEvents.json'])) as ClaimEvent[]
    expect(claims).toEqual([claim('claim-1')])
    expect(events).toEqual([event('event-1', 'claim-1')])
  })
})

describe('backup.import.merge: claims', () => {
  it('backup.import.merge: claims and claimEvents are restored and queue claim.upsert and claimEvent.upsert ops', async () => {
    const source = freshDb()
    const target = freshDb()
    await source.claims.add(claim('claim-1'))
    await source.claimEvents.add(event('event-1', 'claim-1'))
    const backup = (await exportBackup(source)).blob

    const result = await importBackup(target, backup)

    expect(result.imported).toBe(2)
    expect(await target.claims.get('claim-1')).toEqual(claim('claim-1'))
    expect(await target.claimEvents.get('event-1')).toEqual(event('event-1', 'claim-1'))
    const ops = await target.outbox.toArray()
    expect(ops.map((op) => op.type).sort()).toEqual(['claim.upsert', 'claimEvent.upsert'])
    expect(ops.find((op) => op.type === 'claim.upsert')).toMatchObject({ entity: 'claim', entityId: 'claim-1' })
    expect(ops.find((op) => op.type === 'claimEvent.upsert')).toMatchObject({ entity: 'claimEvent', entityId: 'event-1' })
  })

  it('backup.import.resync: a deleted claim queues a claim.delete op', async () => {
    const source = freshDb()
    const target = freshDb()
    await source.claims.add(claim('claim-2', { deleted: 1, updatedAt: 200 }))
    const backup = (await exportBackup(source)).blob
    await target.claims.add(claim('claim-2', { updatedAt: 100 }))

    await importBackup(target, backup)

    const ops = await target.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ type: 'claim.delete', entity: 'claim', entityId: 'claim-2' })
  })
})
