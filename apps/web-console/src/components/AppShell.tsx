import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'

import { Icon } from './Icon'
import { isCloudBaseConsole } from '../auth/cloudbase'

const navigation = [
  { to: '/', label: '运营总览', end: true },
  { to: '/safety', label: '规则验证', end: false },
  { to: '/observability', label: 'AI 质量', end: false },
  { to: '/support', label: '支持工单', end: false },
  { to: '/developer', label: '开发者工具', end: false },
]

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const visibleNavigation = isCloudBaseConsole()
    ? navigation.filter((item) => item.to === '/support')
    : navigation

  return (
    <div className="min-h-screen bg-[#f4f4ef] text-[#18211c]">
      <header className="sticky top-0 z-50 border-b border-black/8 bg-[#f4f4ef]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
          <NavLink
            aria-label="返回运营总览"
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
                Operations & Safety
              </span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 rounded-full border border-black/8 bg-white/70 p-1 md:flex">
            {visibleNavigation.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-semibold transition ${
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
            {visibleNavigation.map((item) => (
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
          <span>辅食搭子 · 内部运营与安全控制台</span>
          <span>后台不替代家庭授权，规则不让位于模型判断。</span>
        </div>
      </footer>
    </div>
  )
}
