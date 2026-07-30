import { Navigate, Route, Routes } from 'react-router'

import { AppShell } from './components/AppShell'
import { CollaborationPage } from './pages/CollaborationPage'
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
        <Route element={<CollaborationPage />} path="collaboration" />
        <Route
          element={<Navigate replace to="/collaboration" />}
          path="governance"
        />
      </Route>
    </Routes>
  )
}
