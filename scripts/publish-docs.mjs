// Publish the production build into docs/ on main. GitHub Pages serves main /docs.
// Only node:fs is used: no git is run here. Committing and pushing docs/ is a manual step.
import { existsSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function publishDocs({ from = 'dist', to = 'docs' } = {}) {
  for (const required of ['index.html', 'CNAME']) {
    if (!existsSync(join(from, required))) {
      throw new Error(`publish-docs: missing ${join(from, required)}; run the build first`)
    }
  }
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishDocs()
  console.log('publish-docs: docs/ is ready; commit and push docs/ to main to deploy.')
}
