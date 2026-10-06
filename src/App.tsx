import { Route, Routes, useLocation } from 'react-router';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import SessionLogger from './pages/SessionLogger';
import CalendarPage from './pages/CalendarPage';
import Routines from './pages/Routines';
import RoutineEditor from './pages/RoutineEditor';
import ExerciseLibrary from './pages/ExerciseLibrary';
import ExerciseEditor from './pages/ExerciseEditor';
import { Navigate } from 'react-router';
import Progress from './pages/Progress';
import Settings from './pages/Settings';

export default function App() {
  const { pathname } = useLocation();
  const inSession = pathname.startsWith('/sesion/');
  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-zinc-950 text-zinc-100">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sesion/:id" element={<SessionLogger />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/rutinas" element={<Routines />} />
        <Route path="/rutinas/:id" element={<RoutineEditor />} />
        <Route path="/ejercicios" element={<ExerciseLibrary />} />
        <Route path="/ejercicios/:id" element={<ExerciseEditor />} />
        <Route path="/historial" element={<Navigate to="/calendario" replace />} />
        <Route path="/progreso" element={<Progress />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {!inSession && <BottomNav />}
    </div>
  );
}
