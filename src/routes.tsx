import type { ComponentType } from 'preact'
import type { KnownPattern } from './router'
import { AccountPage } from './pages/AccountPage'
import { CardWallet } from './pages/CardWallet'
import { ClaimsStub, FacilitiesStub } from './pages/stubs'
import { HomePage } from './pages/HomePage'
import { PersonEdit } from './pages/PersonEdit'

// Each known hash pattern maps to the page rendered inside the Shell (the wallet is full-screen, see app.tsx).
export const ROUTES: Record<KnownPattern, ComponentType> = {
  '/': HomePage,
  '/claims': ClaimsStub,
  '/facilities': FacilitiesStub,
  '/account': AccountPage,
  '/account/person/:id': PersonEdit,
  '/wallet/:personId?': () => <CardWallet />,
}
