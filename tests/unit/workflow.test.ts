import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reads the workflow file as text. No YAML parser is added as a dependency; the checks below match the
// exact lines the workflow must contain and the commands it must not run.
const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/refresh-pti-data.yml'), 'utf8')
const lines = workflow.split('\n').map((line) => line.trim())

describe('data-refresh.workflow', () => {
  it('data-refresh.workflow.triggers: has a monthly cron on day 1 at 02:00 UTC', () => {
    expect(workflow).toMatch(/^on:/m)
    expect(workflow).toMatch(/schedule:\s*\[\s*\{\s*cron:\s*['"]0 2 1 \* \*['"]\s*\}\s*\]/)
  })

  it('data-refresh.workflow.triggers: has a workflow_dispatch trigger for manual runs', () => {
    expect(workflow).toMatch(/^\s*workflow_dispatch:/m)
  })

  it('data-refresh.workflow.no-deploy: no step runs build or deploy', () => {
    expect(workflow).not.toMatch(/npm (run )?(build|deploy|test|ci)\b/)
    expect(workflow).not.toMatch(/npm ci/)
    expect(workflow).not.toMatch(/vite build|tsc -b/)
  })

  it('data-refresh.workflow.no-deploy: creates no branch and no pull request', () => {
    expect(workflow).not.toMatch(/git (checkout -b|switch -c|branch\b)/)
    expect(workflow).not.toMatch(/gh pr\b|pull-requests:\s*write|create-pull-request/)
  })

  it('data-refresh.workflow.no-deploy: stages only public/data and pushes HEAD to main', () => {
    const adds = lines.filter((line) => /git add\b/.test(line))
    expect(adds).toEqual(['git add public/data'])
    expect(workflow).toMatch(/git push origin HEAD:main/)
    expect(workflow).not.toMatch(/git add (-A|--all|\.)(\s|$)/)
    expect(workflow).not.toMatch(/docs\//)
  })

  it('data-refresh.workflow.no-deploy: runs the refresh script with the design arguments and no install step', () => {
    expect(workflow).toMatch(
      /node scripts\/refresh-facilities\.mjs --out public\/data\/facilities\/pti\.json --manifest public\/data\/manifest\.json > summary\.md/,
    )
    expect(workflow).toMatch(/node-version:\s*22/)
    expect(workflow).toMatch(/permissions:\s*\{\s*contents:\s*write\s*\}/)
  })
})
