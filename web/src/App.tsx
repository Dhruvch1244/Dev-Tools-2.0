import { Route, Routes, useLocation } from 'react-router';
import { Shell } from './components/Shell';
import { TodayPage } from './pages/Today';
import { TasksPage } from './pages/Tasks';
import { NotesPage } from './pages/Notes';
import { MoneyPage } from './pages/Money';
import { DropPage } from './pages/Drop';
import { LifePage } from './pages/Life';

export function App() {
  // Routes get an explicit location so the outgoing page keeps rendering itself during its exit animation.
  const location = useLocation();
  return (
    <Shell>
      <Routes location={location}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/money" element={<MoneyPage />} />
        <Route path="/drop" element={<DropPage />} />
        <Route path="/life" element={<LifePage />} />
        <Route path="*" element={<TodayPage />} />
      </Routes>
    </Shell>
  );
}
