import type { ComponentType } from 'preact'
import type { KnownPattern } from './router'
import { AccountPage } from './pages/AccountPage'
import { BenefitsPage } from './pages/BenefitsPage'
import { CardWallet } from './pages/CardWallet'
import { ClaimWizard } from './pages/ClaimWizard'
import { ClaimsPage } from './pages/ClaimsPage'
import { InvoiceGuidePage } from './pages/InvoiceGuidePage'
import { DocumentsPage } from './pages/DocumentsPage'
import { FacilitiesPage } from './pages/FacilitiesPage'
import { HomePage } from './pages/HomePage'
import { PersonEdit } from './pages/PersonEdit'

// Each known hash pattern maps to the page rendered inside the Shell (the wallet is full-screen, see app.tsx).
// Both facility patterns share one component so moving between list and detail keeps the search box mounted.
const FacilitiesRoute = () => <FacilitiesPage />
// Same for the documents list and its editor: one mounted page, the id only selects the document.
const DocumentsRoute = () => <DocumentsPage />
// The wizard reads the claim id from the route itself, so both claim patterns share one mounted wizard.
const ClaimWizardRoute = () => <ClaimWizard />
// The list and the detail share one mounted page, so moving between them keeps the filters.
const ClaimsRoute = () => <ClaimsPage />

export const ROUTES: Record<KnownPattern, ComponentType> = {
  '/': () => <HomePage />,
  '/claims': ClaimsRoute,
  '/claims/new': ClaimWizardRoute,
  '/claims/:id/edit': ClaimWizardRoute,
  '/claims/:id': ClaimsRoute,
  '/facilities': FacilitiesRoute,
  '/facilities/:id': FacilitiesRoute,
  '/account': AccountPage,
  '/account/person/:id': PersonEdit,
  '/wallet/:personId?': () => <CardWallet />,
  '/benefits/:personId?': () => <BenefitsPage />,
  '/documents': DocumentsRoute,
  '/documents/:id': DocumentsRoute,
  '/invoice-guide/:personId?': () => <InvoiceGuidePage />,
}
