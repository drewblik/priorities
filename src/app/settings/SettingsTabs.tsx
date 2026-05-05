'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = {
  href: string;
  label: string;
  enabled: boolean;
  comingIn?: string;
};

const TABS: Tab[] = [
  { href: '/settings/profile', label: 'Profile', enabled: true },
  { href: '/settings/api-key', label: 'API Key', enabled: true },
  { href: '/settings/calendar', label: 'Calendar', enabled: true },
  { href: '/settings/planning', label: 'Planning', enabled: false, comingIn: 'M14' },
  { href: '/settings/data', label: 'Data', enabled: false, comingIn: 'M19' },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Settings sections">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const base = 'rounded-t-md px-3 py-2 text-sm';
        if (!tab.enabled) {
          return (
            <span
              key={tab.href}
              className={`${base} cursor-not-allowed text-muted-foreground/60`}
              title={`Coming in ${tab.comingIn}`}
              aria-disabled="true"
            >
              {tab.label}
              <span className="ml-1 text-[10px] uppercase opacity-70">{tab.comingIn}</span>
            </span>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${base} ${
              active
                ? 'border-b-2 border-primary font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
