import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/auth-context';
import { Layout } from './components/Layout';
import { SignIn } from './pages/SignIn';
import { Landing } from './pages/Landing';
import { Onboarding } from './pages/Onboarding';
import { Today } from './pages/Today';
import { More } from './pages/More';
import { Rules } from './pages/Rules';
import { RulesEditor } from './pages/RulesEditor';
import { Account } from './pages/Account';
import { Maintenance } from './pages/Maintenance';
import { Privacy, Terms } from './pages/Legal';
import { Workouts } from './pages/Workouts';

import { Spinner } from './components/ui';

// Charts are a large dependency and most visits only log food, so the chart
// routes load on demand rather than in the first bundle.
const Trends = lazy(() => import('./pages/Trends').then((m) => ({ default: m.Trends })));
const Groups = lazy(() => import('./pages/Groups').then((m) => ({ default: m.Groups })));
const GroupDetail = lazy(() =>
  import('./pages/GroupDetail').then((m) => ({ default: m.GroupDetail })),
);
const Photos = lazy(() => import('./pages/Photos').then((m) => ({ default: m.Photos })));
const Goals = lazy(() => import('./pages/Goals').then((m) => ({ default: m.Goals })));
const Exercises = lazy(() => import('./pages/Exercises').then((m) => ({ default: m.Exercises })));
const RoutineEditor = lazy(() =>
  import('./pages/RoutineEditor').then((m) => ({ default: m.RoutineEditor })),
);
const WorkoutRunner = lazy(() =>
  import('./pages/WorkoutRunner').then((m) => ({ default: m.WorkoutRunner })),
);
const ExerciseDetail = lazy(() =>
  import('./pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })),
);

/**
 * The signed-in app.
 *
 * Signed out, the landing page lives at "/" and every other app path
 * redirects there, so a signed-out visitor never sits on a URL like /trends
 * looking at marketing copy. Anyone signed in without a profile goes to
 * onboarding first.
 */
function RequireProfile() {
  const { user, profile, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <Spinner />;
  if (!user) return pathname === '/' ? <Landing /> : <Navigate to="/" replace />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <Layout />;
}

/**
 * Privacy and terms are reachable either side of signing in, so they are the
 * one pair of screens that needs to work both ways: inside the app shell with
 * the nav when there is an app to go back to, and standalone otherwise.
 */
function LegalRoute({ page }: { page: 'privacy' | 'terms' }) {
  const { user, profile, loading } = useAuth();
  const Body = page === 'privacy' ? Privacy : Terms;

  if (loading) return <Spinner />;
  if (user && profile) {
    return (
      <Layout>
        <Body />
      </Layout>
    );
  }
  return <Body />;
}

/** Sign-in is its own screen now, and pointless once you are signed in. */
function SignInRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return <SignIn />;
}

function OnboardingRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user || profile) return <Navigate to="/" replace />;
  return <Onboarding />;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/signin" element={<SignInRoute />} />
        <Route path="/privacy" element={<LegalRoute page="privacy" />} />
        <Route path="/terms" element={<LegalRoute page="terms" />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route element={<RequireProfile />}>
          <Route path="/" element={<Today />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/lift" element={<Workouts />} />
          <Route path="/lift/exercises" element={<Exercises />} />
          <Route path="/lift/day/:routineId" element={<RoutineEditor />} />
          <Route path="/lift/do/:routineId" element={<WorkoutRunner />} />
          <Route path="/lift/exercise/:exerciseId" element={<ExerciseDetail />} />
          <Route path="/photos" element={<Photos />} />
          <Route path="/more" element={<More />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/rules/edit" element={<RulesEditor />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/account" element={<Account />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId" element={<GroupDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
