import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/auth-context';
import { SignIn } from './pages/SignIn';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { Spinner } from './components/ui';

/** Signed out shows sign-in; signed in without a profile goes to onboarding. */
function Home() {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <SignIn />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <Dashboard />;
}

/** Onboarding is only for signed-in users who have not finished it yet. */
function OnboardingRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user || profile) return <Navigate to="/" replace />;
  return <Onboarding />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
