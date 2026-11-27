import { useEffect, useRef, useState } from 'preact/hooks'
import { mapsEnabled } from '../config'
import { loadDataset, loadManifest } from '../data/datasets'
import { locateUser, userLocation } from '../data/user-location'
import { formatDistance, parseFacilityGeo, sortByDistance, type GeoPoint } from '../domain/facility-geo'
import { parseFacilities, SERVICES, type FacilitiesDataset, type Service } from '../domain/facilities-schema'
import { searchFacilities } from '../domain/facility-search'
import type { Result } from '../domain/benefits-schema'
import { t } from '../i18n'
import { todayIso } from '../lib/dates'
import { formatDateVi } from '../lib/format-date'
import { encodeQuery, navigate, replaceQuery, route } from '../router'
import { FacilityDetail } from '../ui/FacilityDetail'
import { FacilityFilters, type FacilityFacets } from '../ui/FacilityFilters'
import { FacilityMap } from '../ui/FacilityMap'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

const SEARCH_DEBOUNCE_MS = 150

type DataState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; dataset: FacilitiesDataset }

/** Reads the manifest, then the facilities file it lists. Any failure fails the whole load. */
async function loadFacilities(): Promise<Result<FacilitiesDataset>> {
  const manifest = await loadManifest()
  if (!manifest.ok) return manifest
  const file = manifest.data.datasets.facilities?.files[0]
  if (!file) return { ok: false, error: 'manifest thiếu facilities' }
  return loadDataset(file, parseFacilities)
}

/** Filters live in the hash query: #/facilities?q=&p=&s=inpatient,dental&v=blacklist */
function filtersFrom(query: Record<string, string>) {
  return {
    q: query.q ?? '',
    province: query.p ? query.p : null,
    services: (query.s ?? '')
      .split(',')
      .filter((s): s is Service => (SERVICES as readonly string[]).includes(s)),
    blacklisted: query.v === 'blacklist',
  }
}

/** Shared by the list and the detail route; the same component type keeps the search box mounted. */
export function FacilitiesPage() {
  const query = route.value.query
  const selectedId = route.value.params.id ?? null
  const filters = filtersFrom(query)
  const [data, setData] = useState<DataState>({ status: 'loading' })
  const [sheetOpen, setSheetOpen] = useState(false)
  // The text field shows what was typed; the URL catches up after the debounce.
  const [draft, setDraft] = useState(filters.q)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [points, setPoints] = useState<Record<string, GeoPoint>>({})
  const location = userLocation.value
  const origin = location.status === 'ready' ? location.position : null

  // Map points are an extra: without them the list still works, unsorted by distance.
  useEffect(() => {
    let alive = true
    void loadDataset('facilities/geo.json', parseFacilityGeo).then((result) => {
      if (alive && result.ok) setPoints(result.data.points)
    })
    locateUser()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    void loadFacilities().then((result) => {
      if (!alive) return
      setData(result.ok ? { status: 'ready', dataset: result.data } : { status: 'error' })
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    setDraft(filters.q)
  }, [filters.q])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  // Escape closes the narrow filter sheet; the listener exists only while it is open.
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  if (data.status === 'error') {
    return (
      <p role="alert" class="py-4 text-fluid-base text-red-600 dark:text-red-400">
        {t('facilities.error')}
      </p>
    )
  }
  if (data.status === 'loading') {
    return <p class="py-4 text-fluid-base text-ink-muted">{t('facilities.loading')}</p>
  }

  const { dataset } = data
  const qs = encodeQuery(query)
  const results = searchFacilities(dataset.facilities, {
    q: filters.q,
    province: filters.province,
    services: filters.services,
    blacklisted: filters.blacklisted,
  })
  const nearby = sortByDistance(results, points, origin)
  const selected = selectedId === null ? null : dataset.facilities.find((f) => f.id === selectedId) ?? null
  const facetsActive = filters.province !== null || filters.services.length > 0
  const anyFilterActive = facetsActive || filters.q !== ''

  /** Writes filter keys into the hash without a new history entry; empty values are dropped. */
  const setParams = (patch: Record<string, string>) => replaceQuery({ ...route.value.query, ...patch })

  const onSearchInput = (value: string) => {
    setDraft(value)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      setParams({ q: value })
    }, SEARCH_DEBOUNCE_MS)
  }

  const onFacetsChange = (next: FacilityFacets) =>
    setParams({ p: next.province ?? '', s: next.services.join(',') })

  const reset = () => {
    setDraft('')
    setParams({ q: '', p: '', s: '' })
  }

  return (
    <section class="grid gap-4 py-4 xl:grid-cols-[16rem_1fr_24rem] xl:grid-rows-[auto_1fr] xl:items-start">
      <h2 class="sr-only">{t('facilities.title')}</h2>

      {/* Narrow: sticky search with the filter sheet button. Wide: search sits above the filters column. */}
      <div class="sticky top-[3.25rem] z-[5] flex items-center gap-2 bg-surface py-2 xl:static xl:col-start-1 xl:row-start-1 xl:block xl:p-0">
        <div class="relative min-w-0 flex-1">
          <Icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            aria-label={t('facilities.search.label')}
            placeholder={t('facilities.search.placeholder')}
            value={draft}
            onInput={(e) => onSearchInput(e.currentTarget.value)}
            class="min-h-11 w-full min-w-0 rounded-xl border border-surface-2 bg-surface-2 pl-10 pr-3 text-fluid-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <span class="relative shrink-0 xl:hidden">
          <IconButton
            icon="filter"
            label={t('facilities.filters.open')}
            data-active={facetsActive ? 'true' : 'false'}
            onClick={() => setSheetOpen(true)}
          />
          {facetsActive && (
            <span aria-hidden="true" class="pointer-events-none absolute right-2 top-2 size-2.5 rounded-full bg-accent" />
          )}
        </span>
      </div>

      {/* Narrow: a full-screen sheet while open. Wide: always the left column. */}
      <section
        role={sheetOpen ? 'dialog' : undefined}
        aria-modal={sheetOpen ? true : undefined}
        aria-label={t('facilities.filters')}
        class={
          sheetOpen
            ? 'fixed inset-0 z-30 grid auto-rows-max content-start gap-4 overflow-y-auto bg-surface p-gutter xl:static xl:z-auto xl:col-start-1 xl:row-start-2 xl:grid xl:overflow-visible xl:p-0'
            : 'hidden xl:col-start-1 xl:row-start-2 xl:grid xl:gap-4'
        }
      >
        <div class="flex items-center justify-between gap-2 xl:hidden">
          <h2 class="text-fluid-lg font-semibold text-ink">{t('facilities.filters')}</h2>
          <IconButton icon="close" label={t('facilities.filters.close')} onClick={() => setSheetOpen(false)} />
        </div>
        <FacilityFilters
          provinces={dataset.provinces}
          value={{ province: filters.province, services: filters.services }}
          onChange={onFacetsChange}
        />
      </section>

      <section
        aria-label={t('facilities.title')}
        class={`grid min-w-0 content-start gap-4 xl:col-start-2 xl:row-span-2 xl:row-start-1 ${selectedId === null ? 'grid' : 'hidden xl:grid'}`}
      >
        <div class="grid gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <IconButton
              icon="ban"
              label={t('facilities.view.blacklist')}
              showLabel
              aria-pressed={filters.blacklisted}
              onClick={() => setParams({ v: filters.blacklisted ? '' : 'blacklist' })}
            />
            <p class="text-fluid-sm font-semibold tabular-nums text-ink">{t('facilities.count', { n: results.length })}</p>
            {anyFilterActive && (
              <IconButton icon="close" label={t('facilities.filters.reset')} showLabel onClick={reset} />
            )}
          </div>
          {filters.blacklisted && (
            <p class="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-fluid-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <Icon name="ban" class="mt-0.5 size-5" />
              <span>{t('facilities.blacklist.warning')}</span>
            </p>
          )}
          <div class="flex flex-wrap items-center gap-2 text-fluid-sm text-ink-muted">
            <p role="status">
              {location.status === 'ready'
                ? t('facilities.location.sorted')
                : location.status === 'locating'
                  ? t('facilities.location.locating')
                  : location.status === 'denied'
                    ? t('facilities.location.denied')
                    : location.status === 'unavailable'
                      ? t('facilities.location.unavailable')
                      : ''}
            </p>
            {(location.status === 'denied' || location.status === 'unavailable' || location.status === 'ready') && (
              <IconButton icon="map-pin" label={t('facilities.location.retry')} showLabel onClick={() => locateUser(true)} />
            )}
          </div>
          {mapsEnabled() && (
            <FacilityMap
              facilities={nearby.map((r) => r.facility)}
              points={points}
              origin={origin}
              selectedId={selectedId}
              onSelect={(id) => navigate(`/facilities/${id}${qs}`)}
            />
          )}
          <div class="grid gap-0.5 text-fluid-sm text-ink-muted">
            <p>{t('facilities.freshness.date', { date: formatDateVi(todayIso(new Date(dataset.fetchedAt))) })}</p>
            <p>{t('facilities.freshness.callFirst')}</p>
          </div>
        </div>

        {results.length === 0 ? (
          <div class="grid gap-1 py-6">
            <p class="text-fluid-base text-ink">{t('facilities.empty')}</p>
            <p class="text-fluid-sm text-ink-muted">{t('facilities.emptyReset')}</p>
          </div>
        ) : (
          <ul class="grid gap-2">
            {nearby.map(({ facility: f, km, approximate }) => (
              <li key={f.id}>
                <a
                  href={`#/facilities/${f.id}${qs}`}
                  aria-current={f.id === selectedId ? 'true' : undefined}
                  class="flex min-h-11 items-start justify-between gap-3 rounded-xl bg-surface-2 p-3 text-ink transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent aria-[current=true]:ring-2 aria-[current=true]:ring-accent"
                >
                  <div class="grid min-w-0 gap-0.5">
                    <span class="text-fluid-base font-semibold">{f.name}</span>
                    <span class="text-fluid-sm text-ink-muted">{f.address}</span>
                  </div>
                  {km !== null && (
                    <span
                      class="shrink-0 whitespace-nowrap pt-0.5 text-fluid-sm font-medium tabular-nums text-accent"
                      title={approximate ? t('facilities.distance.approximate') : undefined}
                    >
                      {approximate ? `≈ ${formatDistance(km)}` : formatDistance(km)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label={selected?.name ?? t('facilities.title')}
        class={`grid min-w-0 content-start gap-4 xl:col-start-3 xl:row-span-2 xl:row-start-1 ${selectedId === null ? 'hidden xl:block' : 'grid'}`}
      >
        {selectedId !== null && (
          <IconButton
            icon="chevron-left"
            label={t('facilities.detail.back')}
            showLabel
            class="justify-self-start xl:hidden"
            onClick={() => navigate(`/facilities${qs}`)}
          />
        )}
        {selectedId !== null &&
          (selected ? <FacilityDetail facility={selected} /> : <p class="text-fluid-base text-ink-muted">{t('facilities.detail.notFound')}</p>)}
      </section>
    </section>
  )
}
