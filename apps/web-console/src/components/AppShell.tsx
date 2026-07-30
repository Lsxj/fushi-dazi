import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'

import { Icon } from './Icon'

const navigation = [
  { to: '/', label: '方案总览', end: true },
  { to: '/safety', label: '安全规则实验室', end: false },
  { to: '/observability', label: '可观测性与评估', end: false },
  { to: '/governance', label: '权限与审计', end: false },
]

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f4f4ef] text-[#18211c]">
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#f4f4ef]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
          <NavLink
            aria-label="返回方案总览"
            className="flex items-center gap-3"
            to="/"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#183f35] text-white shadow-sm">
              <Icon name="spark" size={18} />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight">
                辅食搭子
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#68756e]">
                Solution Console
              </span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 rounded-full border border-black/8 bg-white/70 p-1 md:flex">
            {navigation.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `rounded-full px-5 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[#183f35] text-white shadow-sm'
                      : 'text-[#59675f] hover:text-[#183f35]'
                  }`
                }
                end={item.end}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <a
            className="hidden items-center gap-2 text-sm font-semibold text-[#183f35] hover:text-[#df5c34] lg:flex"
            href="https://github.com/Lsxj/fushi-dazi"
            rel="noreferrer"
            target="_blank"
          >
            GitHub <Icon name="external" size={16} />
          </a>
          <button
            aria-expanded={menuOpen}
            aria-label="切换导航"
            className="grid size-10 place-items-center rounded-xl border border-black/10 md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <Icon name={menuOpen ? 'x' : 'menu'} />
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-black/8 bg-[#f4f4ef] px-5 py-3 md:hidden">
            {navigation.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `block rounded-xl px-4 py-3 text-sm font-semibold ${
                    isActive ? 'bg-[#183f35] text-white' : 'text-[#59675f]'
                  }`
                }
                end={item.end}
                key={item.to}
                onClick={() => setMenuOpen(false)}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-black/8 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-xs text-[#68756e] sm:flex-row">
          <span>© 2026 Lsxj · AI Solution Architecture Portfolio</span>
          <span>规则负责安全边界，AI 负责理解与编排。</span>
        </div>
      </footer>
    </div>
  )
}
