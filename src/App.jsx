// ============================================================
// App.jsx — Main Router
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AlertProvider } from './contexts/AlertContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import ForgotPasswordPage from './components/auth/ForgotPasswordPage';
import PatientDashboard from './components/patient/PatientDashboard';
import DoctorDashboard from './components/doctor/DoctorDashboard';
import PathologyDashboard from './components/pathology/PathologyDashboard';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg"></div>
        <p>Loading AI Health Monitor...</p>
      </div>
    );
  }

  // Determine home redirect based on role
  const getHomeRoute = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'doctor': return '/doctor';
      case 'pathology': return '/pathology';
      default: return '/patient';
    }
  };

  return (
    <Routes>
      {/* Auth Routes */}
      <Route
        path="/login"
        element={user ? <Navigate to={getHomeRoute()} replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to={getHomeRoute()} replace /> : <RegisterPage />}
      />
      <Route
        path="/forgot-password"
        element={user ? <Navigate to={getHomeRoute()} replace /> : <ForgotPasswordPage />}
      />

      {/* Dashboard Routes */}
      <Route
        path="/patient"
        element={
          <ProtectedRoute allowedRoles={['patient']}>
            <PatientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctor"
        element={
          <ProtectedRoute allowedRoles={['doctor']}>
            <DoctorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pathology"
        element={
          <ProtectedRoute allowedRoles={['pathology']}>
            <PathologyDashboard />
          </ProtectedRoute>
        }
      />

      {/* Default Redirect */}
      <Route path="*" element={<Navigate to={getHomeRoute()} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AlertProvider>
            <div className="app-bg"></div>
            <AppRoutes />
          </AlertProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
