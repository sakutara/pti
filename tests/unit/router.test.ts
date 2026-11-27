import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshRoute, replaceQuery, route } from '../../src/router'

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

beforeEach(async () => {
  vi.restoreAllMocks()
  location.hash = ''
  refreshRoute()
  await tick()
})

describe('router.query', () => {
  it('router.query.parse: splits the hash query from the path and decodes its values', () => {
    location.hash = '#/facilities?q=bach%20mai&s=inpatient,dental&v=blacklist'
    refreshRoute()

    expect(route.value.path).toBe('/facilities')
    expect(route.value.query).toEqual({ q: 'bach mai', s: 'inpatient,dental', v: 'blacklist' })
  })

  it('router.query.detail: a detail route keeps its id param and the query', () => {
    location.hash = '#/facilities/f-76c24651ba2f?q=mai'
    refreshRoute()

    expect(route.value.path).toBe('/facilities/f-76c24651ba2f')
    expect(route.value.params).toEqual({ id: 'f-76c24651ba2f' })
    expect(route.value.query).toEqual({ q: 'mai' })
  })

  it('router.query.empty: a hash without a query has an empty query object', () => {
    location.hash = '#/facilities'
    refreshRoute()

    expect(route.value.query).toEqual({})
  })

  it('router.query.replace: rewrites the hash without pushing a history entry or firing hashchange', async () => {
    location.hash = '#/facilities'
    refreshRoute()
    await tick()

    const push = vi.spyOn(history, 'pushState')
    const onHashChange = vi.fn()
    window.addEventListener('hashchange', onHashChange)
    try {
      replaceQuery({ q: 'ba', s: 'inpatient,dental' })
      await tick()

      expect(location.hash).toBe('#/facilities?q=ba&s=inpatient,dental')
      expect(route.value.path).toBe('/facilities')
      expect(route.value.query).toEqual({ q: 'ba', s: 'inpatient,dental' })
      expect(push).not.toHaveBeenCalled()
      expect(onHashChange).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('hashchange', onHashChange)
    }
  })

  it('router.query.replace: drops empty values and keeps the detail path', async () => {
    location.hash = '#/facilities/f-76c24651ba2f'
    refreshRoute()
    await tick()

    replaceQuery({ q: '', p: '01', v: '' })

    expect(location.hash).toBe('#/facilities/f-76c24651ba2f?p=01')
    expect(route.value.params).toEqual({ id: 'f-76c24651ba2f' })
    expect(route.value.query).toEqual({ p: '01' })
  })

  it('router.query.replace: with no values left the hash has no query part', async () => {
    location.hash = '#/facilities?q=ba'
    refreshRoute()
    await tick()

    replaceQuery({ q: '' })

    expect(location.hash).toBe('#/facilities')
    expect(route.value.query).toEqual({})
  })
})
