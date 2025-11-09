import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface PublicRouteProps {
  children: React.ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // Loading state'inde hiçbir şey render etme
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

