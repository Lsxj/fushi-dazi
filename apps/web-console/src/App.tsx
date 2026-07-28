import { Route, Routes } from 'react-router'

import { AppShell } from './components/AppShell'
import { OverviewPage } from './pages/OverviewPage'
import { SafetyLabPage } from './pages/SafetyLabPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route element={<SafetyLabPage />} path="safety" />
      </Route>
    </Routes>
  )
}
