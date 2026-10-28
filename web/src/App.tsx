import { Route, Routes, useLocation } from 'react-router';
import { Shell } from './components/Shell';
import { TodayPage } from './pages/Today';
import { TasksPage } from './pages/Tasks';
import { NotesPage } from './pages/Notes';
import { MoneyPage } from './pages/Money';
import { DropPage } from './pages/Drop';
import { LifePage } from './pages/Life';
import { GymPage } from './pages/Gym';
import { FuelPage } from './pages/Fuel';
import { lazy, Suspense } from 'react';

// DSA pulls in CodeMirror and three language grammars (~400 KB); keep it out of the first load.
const DsaHq = lazy(() => import('./pages/dsa/Hq').then((m) => ({ default: m.DsaHq })));
const DsaWeek = lazy(() => import('./pages/dsa/Week').then((m) => ({ default: m.DsaWeek })));
const DsaProblem = lazy(() => import('./pages/dsa/Problem').then((m) => ({ default: m.DsaProblem })));
const VizGallery = lazy(() => import('./pages/dsa/Viz').then((m) => ({ default: m.VizGallery })));
const VizPlayer = lazy(() => import('./pages/dsa/Viz').then((m) => ({ default: m.VizPlayer })));
const CodeLab = lazy(() => import('./pages/dsa/Viz').then((m) => ({ default: m.CodeLab })));
const DsaTestPage = lazy(() => import('./pages/dsa/Test').then((m) => ({ default: m.DsaTestPage })));

export function App() {
  // Routes get an explicit location so the outgoing page keeps rendering itself during its exit animation.
  const location = useLocation();
  return (
    <Shell>
      <Suspense fallback={<div className="grid min-h-[60vh] place-items-center"><div className="kerb h-1.5 w-40 animate-pulse" /></div>}>
      <Routes location={location}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/money" element={<MoneyPage />} />
        <Route path="/drop" element={<DropPage />} />
        <Route path="/life" element={<LifePage />} />
        <Route path="/gym" element={<GymPage />} />
        <Route path="/fuel" element={<FuelPage />} />
        <Route path="/dsa" element={<DsaHq />} />
        <Route path="/dsa/week/:n" element={<DsaWeek />} />
        <Route path="/dsa/p/:id" element={<DsaProblem />} />
        <Route path="/dsa/viz" element={<VizGallery />} />
        <Route path="/dsa/viz/:id" element={<VizPlayer />} />
        <Route path="/dsa/lab" element={<CodeLab />} />
        <Route path="/dsa/test/:kind/:ref" element={<DsaTestPage />} />
        <Route path="*" element={<TodayPage />} />
      </Routes>
      </Suspense>
    </Shell>
  );
}
