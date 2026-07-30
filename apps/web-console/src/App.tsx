import { Route, Routes } from 'react-router'

import { AppShell } from './components/AppShell'
import { GovernancePage } from './pages/GovernancePage'
import { OverviewPage } from './pages/OverviewPage'
import { ObservabilityPage } from './pages/ObservabilityPage'
import { SafetyLabPage } from './pages/SafetyLabPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route element={<SafetyLabPage />} path="safety" />
        <Route element={<ObservabilityPage />} path="observability" />
        <Route element={<GovernancePage />} path="governance" />
      </Route>
    </Routes>
  )
}
