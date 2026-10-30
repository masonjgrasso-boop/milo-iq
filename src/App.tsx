import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/auth-context';
import { Layout } from './components/Layout';
import { SignIn } from './pages/SignIn';
import { Onboarding } from './pages/Onboarding';
import { Today } from './pages/Today';
import { More } from './pages/More';
import { Rules } from './pages/Rules';
import { Account } from './pages/Account';
import { Privacy, Terms } from './pages/Legal';
import { Lift } from './pages/Lift';
import { Spinner } from './components/ui';

// Charts are a large dependency and most visits only log food, so the chart
// routes load on demand rather than in the first bundle.
const Trends = lazy(() => import('./pages/Trends').then((m) => ({ default: m.Trends })));
const Groups = lazy(() => import('./pages/Groups').then((m) => ({ default: m.Groups })));
const GroupDetail = lazy(() =>
  import('./pages/GroupDetail').then((m) => ({ default: m.GroupDetail })),
);
const Photos = lazy(() => import('./pages/Photos').then((m) => ({ default: m.Photos })));
const ExerciseDetail = lazy(() =>
  import('./pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })),
);

/**
 * The signed-in app. Signed-out visitors see the sign-in page, and anyone who
 * has not finished onboarding is sent there first.
 */
function RequireProfile() {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <SignIn />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <Layout />;
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
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route element={<RequireProfile />}>
          <Route path="/" element={<Today />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/lift" element={<Lift />} />
          <Route path="/lift/:exerciseId" element={<ExerciseDetail />} />
          <Route path="/photos" element={<Photos />} />
          <Route path="/more" element={<More />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/account" element={<Account />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId" element={<GroupDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
