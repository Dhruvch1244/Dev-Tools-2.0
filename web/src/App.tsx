import { Route, Routes, useLocation } from 'react-router';
import { Shell } from './components/Shell';
import { TodayPage } from './pages/Today';
import { TasksPage } from './pages/Tasks';
import { LifePage } from './pages/Life';
import { FuelPage } from './pages/Fuel';
import { RoutinesPage } from './pages/Routines';
import { lazy, Suspense } from 'react';

// Only what Today, the shell and quick-add need is in the first load; every other page is fetched
// on first visit (DSA alone pulls in CodeMirror + three grammars, ~400 KB).
const PitWallPage = lazy(() => import('./pages/PitWall').then((m) => ({ default: m.PitWallPage })));
const PeoplePage = lazy(() => import('./pages/People').then((m) => ({ default: m.PeoplePage })));
const PlanPage = lazy(() => import('./pages/Plan').then((m) => ({ default: m.PlanPage })));
const NotesPage = lazy(() => import('./pages/Notes').then((m) => ({ default: m.NotesPage })));
const MoneyPage = lazy(() => import('./pages/Money').then((m) => ({ default: m.MoneyPage })));
const DropPage = lazy(() => import('./pages/Drop').then((m) => ({ default: m.DropPage })));
const GymPage = lazy(() => import('./pages/Gym').then((m) => ({ default: m.GymPage })));
const SportPage = lazy(() => import('./pages/Sport').then((m) => ({ default: m.SportPage })));
const ReportPage = lazy(() => import('./pages/Report').then((m) => ({ default: m.ReportPage })));
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
        <Route path="/pitwall" element={<PitWallPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/money" element={<MoneyPage />} />
        <Route path="/drop" element={<DropPage />} />
        <Route path="/life" element={<LifePage />} />
        <Route path="/gym" element={<GymPage />} />
        <Route path="/fuel" element={<FuelPage />} />
        <Route path="/sport" element={<SportPage />} />
        <Route path="/routines" element={<RoutinesPage />} />
        <Route path="/report" element={<ReportPage />} />
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
