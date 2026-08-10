import { Navigate, Route, Routes } from 'react-router'

import { AppShell } from './components/AppShell'
import { isCloudBaseConsole } from './auth/cloudbase'
import { CollaborationPage } from './pages/CollaborationPage'
import { HouseholdSupportPage } from './pages/HouseholdSupportPage'
import { OperationsDashboardPage } from './pages/OperationsDashboardPage'
import { OverviewPage } from './pages/OverviewPage'
import { ObservabilityPage } from './pages/ObservabilityPage'
import { SafetyLabPage } from './pages/SafetyLabPage'

export function App() {
  const cloudConsole = isCloudBaseConsole()
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={
            cloudConsole ? (
              <Navigate replace to="/support" />
            ) : (
              <OperationsDashboardPage />
            )
          }
        />
        <Route element={<SafetyLabPage />} path="safety" />
        <Route element={<ObservabilityPage />} path="observability" />
        <Route element={<HouseholdSupportPage />} path="support" />
        <Route element={<OverviewPage />} path="developer" />
        <Route
          element={<CollaborationPage />}
          path="developer/scenarios/collaboration"
        />
        <Route
          element={<Navigate replace to="/support" />}
          path="collaboration"
        />
        <Route
          element={<Navigate replace to="/support" />}
          path="governance"
        />
      </Route>
    </Routes>
  )
}
