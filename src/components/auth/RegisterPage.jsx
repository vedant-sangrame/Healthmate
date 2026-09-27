// ============================================================
// Register Page — With Inbuilt OTP Verification
// ============================================================

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { sendOTP, verifyOTP, registerUser, checkAccountExists } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

export default function RegisterPage() {
  const [step, setStep] = useState(1); // 1=form, 2=otp
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const handleSendOTP = async (e) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      toast.error('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    // Check if an account for this specific role and email already exists
    if (checkAccountExists(email.trim(), role)) {
      const roleName = role.charAt(0).toUpperCase() + role.slice(1);
      toast.error(`A ${roleName} account with this email already exists. Please sign in.`);
      return;
    }

    setLoading(true);
    const result = await sendOTP(email.trim(), 'registration');
    setLoading(false);

    if (result.success) {
      toast.success(result.message || `OTP sent to ${email}`);
      setStep(2);
    } else {
      toast.error(result.message);
    }
  };

  const handleOTPChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOTPKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleVerifyAndRegister = (e) => {
    e.preventDefault();
    const otpString = otp.join('');

    if (otpString.length !== 6) {
      toast.error('Please enter the complete 6-digit OTP.');
      return;
    }

    const otpResult = verifyOTP(email.trim(), otpString);
    if (!otpResult.success) {
      toast.error(otpResult.message);
      return;
    }

    // OTP verified — register user
    const regResult = registerUser(name.trim(), email.trim(), password, role);
    if (regResult.success) {
      toast.success('Account created successfully! Please login.');
      navigate('/login');
    } else {
      toast.error(regResult.message);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    const result = await sendOTP(email.trim(), 'registration');
    setLoading(false);
    if (result.success) {
      toast.success(result.message || 'New verification code sent to your email!');
      setOtp(['', '', '', '', '', '']);
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🏥</div>
          <h1>Create Account</h1>
          <p>{step === 1 ? 'Register for AI Health Monitor' : 'Verify your email'}</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOTP}>
            {/* Role Selection */}
            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">Register As</label>
              <div className="role-selector-grid">
                <button
                  type="button"
                  className={`role-btn ${role === 'patient' ? 'active' : ''}`}
                  onClick={() => setRole('patient')}
                >
                  <span className="role-btn-icon">👤</span>
                  <span>Patient</span>
                </button>

                <button
                  type="button"
                  className={`role-btn ${role === 'doctor' ? 'active' : ''}`}
                  onClick={() => setRole('doctor')}
                >
                  <span className="role-btn-icon">👨‍⚕️</span>
                  <span>Doctor</span>
                </button>

                <button
                  type="button"
                  className={`role-btn ${role === 'pathology' ? 'active' : ''}`}
                  onClick={() => setRole('pathology')}
                >
                  <span className="role-btn-icon">🔬</span>
                  <span>Pathology</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                id="register-name"
                type="text"
                className="form-input"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                id="register-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                id="register-password"
                type="password"
                className="form-input"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                id="register-confirm-password"
                type="password"
                className="form-input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              id="register-submit"
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Sending OTP...
                </>
              ) : (
                'Send OTP & Register'
              )}
            </button>

            <div className="auth-footer">
              Already have an account?{' '}
              <Link to="/login">Sign In</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndRegister}>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
              We've sent a 6-digit OTP to
            </p>
            <p style={{ textAlign: 'center', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '24px' }}>
              {email}
            </p>

            <div className="otp-inputs">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className={`otp-input ${digit ? 'filled' : ''}`}
                  value={digit}
                  onChange={(e) => handleOTPChange(index, e.target.value)}
                  onKeyDown={(e) => handleOTPKeyDown(index, e)}
                  autoFocus={index === 0}
                />
              ))}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              Verify & Create Account
            </button>

            <div className="auth-divider">or</div>

            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={handleResendOTP}
              disabled={loading}
            >
              Resend OTP
            </button>

            <div className="auth-footer">
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontFamily: 'Inter', fontWeight: 600 }}
              >
                ← Back to Registration
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
