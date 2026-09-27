// ============================================================
// Login Page — Role Selection + Email + Password
// ============================================================

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function LoginPage() {
  const [role, setRole] = useState('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in all fields.');
      return;
    }

    setLoading(true);
    
    setTimeout(() => {
      const result = login(email.trim(), password, role);
      
      if (result.success) {
        toast.success(`Welcome back, ${result.user.name}!`);
        
        switch (result.user.role) {
          case 'doctor':
            navigate('/doctor');
            break;
          case 'pathology':
            navigate('/pathology');
            break;
          default:
            navigate('/patient');
        }
      } else {
        toast.error(result.message);
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🏥</div>
          <h1>AI Health Monitor</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Role Selection */}
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Login As</label>
            <div className="role-selector-grid">
              <button
                type="button"
                id="role-patient-btn"
                className={`role-btn ${role === 'patient' ? 'active' : ''}`}
                onClick={() => setRole('patient')}
              >
                <span className="role-btn-icon">👤</span>
                <span>Patient</span>
              </button>

              <button
                type="button"
                id="role-doctor-btn"
                className={`role-btn ${role === 'doctor' ? 'active' : ''}`}
                onClick={() => setRole('doctor')}
              >
                <span className="role-btn-icon">👨‍⚕️</span>
                <span>Doctor</span>
              </button>

              <button
                type="button"
                id="role-pathology-btn"
                className={`role-btn ${role === 'pathology' ? 'active' : ''}`}
                onClick={() => setRole('pathology')}
              >
                <span className="role-btn-icon">🔬</span>
                <span>Pathology</span>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: '20px' }}>
            <Link to="/forgot-password" style={{ fontSize: '0.85rem' }}>
              Forgot Password?
            </Link>
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Signing In...
              </>
            ) : (
              `Sign In as ${role.charAt(0).toUpperCase() + role.slice(1)}`
            )}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register">Create Account</Link>
        </div>
      </div>
    </div>
  );
}
