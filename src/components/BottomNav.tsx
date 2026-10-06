import { NavLink } from 'react-router';

const ITEMS = [
  { to: '/', label: 'Hoy', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { to: '/calendario', label: 'Calendario', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { to: '/rutinas', label: 'Rutinas', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/progreso', label: 'Progreso', icon: 'M4 19h16M6 15l4-4 3 3 5-6' },
  { to: '/ajustes', label: 'Ajustes', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.4-1.4.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L5.8 7.3 4 7l-1 3 2 1v2l-2 1 1 3 2-.3 1.4 1.4-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.4-1.4 2 .3 1-3-2-1z' },
];

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITEMS.map(it => (
          <li key={it.to}>
            <NavLink to={it.to} end={it.to === '/'}
              className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'text-lime-400' : 'text-zinc-400'}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={it.icon} />
              </svg>
              {it.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
