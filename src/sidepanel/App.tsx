import { useEffect, useState } from 'react';
import { Library } from './views/Library';
import { Inbox } from './views/Inbox';
import { Skills } from './views/Skills';
import { Settings } from './views/Settings';
import { Chat } from './views/Chat';
import { TitleBar } from './components/TitleBar';
import { TabBar, type TabKey } from './components/TabBar';
import { sendMsg } from './api';

export function App() {
  const [tab, setTab] = useState<TabKey>('library');
  const [counts, setCounts] = useState({ notes: 0, sources: 0, inbox: 0 });

  useEffect(() => {
    void refreshCounts(setCounts);
    const t = window.setInterval(() => void refreshCounts(setCounts), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="hearth-app">
      <TitleBar counts={counts} />
      <TabBar active={tab} onChange={setTab} inboxCount={counts.inbox} />
      <main className="hearth-main">
        {tab === 'library' && <Library />}
        {tab === 'chat' && <Chat />}
        {tab === 'inbox' && <Inbox onChange={() => void refreshCounts(setCounts)} />}
        {tab === 'skills' && <Skills />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

async function refreshCounts(set: (c: { notes: number; sources: number; inbox: number }) => void) {
  try {
    const [notes, sources, inbox] = await Promise.all([
      sendMsg<{ c: number }[]>({ type: 'db.query', sql: 'SELECT COUNT(*) AS c FROM notes WHERE archived = 0' }),
      sendMsg<{ c: number }[]>({ type: 'db.query', sql: 'SELECT COUNT(*) AS c FROM sources' }),
      sendMsg<{ c: number }[]>({ type: 'db.query', sql: "SELECT COUNT(*) AS c FROM inbox WHERE status = 'pending'" }),
    ]);
    set({ notes: notes[0]?.c ?? 0, sources: sources[0]?.c ?? 0, inbox: inbox[0]?.c ?? 0 });
  } catch (e) {
    console.warn('[hearth] refreshCounts', e);
  }
}
