// ============================================================
// Protected Route — Redirects unauthenticated users
// ============================================================

import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to user's own dashboard
    switch (user.role) {
      case 'doctor':
        return <Navigate to="/doctor" replace />;
      case 'pathology':
        return <Navigate to="/pathology" replace />;
      default:
        return <Navigate to="/patient" replace />;
    }
  }

  return children;
}
