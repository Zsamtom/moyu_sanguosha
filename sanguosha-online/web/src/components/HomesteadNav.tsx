import { Button } from 'antd';

export type HomesteadView = 'homestead' | 'farm' | 'ranch' | 'mine';

interface HomesteadNavProps {
  active: HomesteadView;
  onNavigate: (view: HomesteadView) => void;
  onExit: () => void;
}

export const HOMESTEAD_NAV_ENTRIES: ReadonlyArray<{
  view: HomesteadView;
  label: string;
}> = [
  { view: 'homestead', label: '庄园总览' },
  { view: 'farm', label: '农场' },
  { view: 'ranch', label: '牧场' },
  { view: 'mine', label: '矿山' },
];

export function HomesteadNav({ active, onNavigate, onExit }: HomesteadNavProps) {
  return (
    <nav className="homestead-nav" aria-label="庄园功能">
      {HOMESTEAD_NAV_ENTRIES.map((entry) => (
        <Button
          key={entry.view}
          aria-current={active === entry.view ? 'page' : undefined}
          type={active === entry.view ? 'primary' : 'text'}
          onClick={() => onNavigate(entry.view)}
        >
          {entry.label}
        </Button>
      ))}
      <Button className="homestead-nav__exit" onClick={onExit}>
        退出庄园
      </Button>
    </nav>
  );
}
