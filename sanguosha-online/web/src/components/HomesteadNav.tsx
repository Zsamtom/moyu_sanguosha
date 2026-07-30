import { Button } from 'antd';

export type HomesteadView = 'homestead' | 'farm' | 'ranch' | 'mine';

interface HomesteadNavProps {
  active: HomesteadView;
  onNavigate: (view: HomesteadView) => void;
  onExit: () => void;
}

const ENTRIES: ReadonlyArray<{ view: HomesteadView; label: string }> = [
  { view: 'homestead', label: '庄园总览' },
  { view: 'farm', label: '青禾农场' },
  { view: 'ranch', label: '青禾牧场' },
  { view: 'mine', label: '青禾矿山' },
];

export function HomesteadNav({ active, onNavigate, onExit }: HomesteadNavProps) {
  return (
    <nav className="homestead-nav" aria-label="庄园功能">
      {ENTRIES.map((entry) => (
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
