import { render } from 'preact'
import './styles/app.css'
import { App } from './app'
import { db } from './db/db'
import { createSyncEngine } from './sync/sync-engine'
import { initPWA } from './pwa'

initPWA()
createSyncEngine(db).start()
render(<App />, document.getElementById('app')!)
