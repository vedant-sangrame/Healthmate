import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { sendOTP, verifyOTP, resetPassword, checkAccountExists } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1); // 1=email, 2=otp, 3=new password
  const [role, setRole] = useState('patient');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your email address.');
      return;
    }

    if (!checkAccountExists(email.trim(), role)) {
      const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
      toast.error(`No ${roleCapitalized} account found for this email.`);
      return;
    }

    setLoading(true);
    const result = await sendOTP(email.trim(), 'reset');
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

    const newOtpArr = [...otp];
    newOtpArr[index] = value;
    setOtp(newOtpArr);

    if (value && index < 5) {
      document.getElementById(`fp-otp-${index + 1}`)?.focus();
    }
  };

  const handleOTPKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`fp-otp-${index - 1}`)?.focus();
    }
  };

  const handleVerifyOTP = (e) => {
    e.preventDefault();
    const otpString = otp.join('');

    if (otpString.length !== 6) {
      toast.error('Please enter the complete 6-digit OTP.');
      return;
    }

    const result = verifyOTP(email.trim(), otpString);
    if (result.success) {
      toast.success('OTP verified! Set your new password.');
      setStep(3);
    } else {
      toast.error(result.message);
    }
  };

  const handleResetPassword = (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    const result = resetPassword(email.trim(), newPassword, role);
    if (result.success) {
      toast.success('Password reset successfully! Please login.');
      navigate('/login');
    } else {
      toast.error(result.message);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    const result = await sendOTP(email.trim(), 'reset');
    setLoading(false);
    if (result.success) {
      toast.success('New OTP sent!');
      setOtp(['', '', '', '', '', '']);
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🔒</div>
          <h1>Reset Password</h1>
          <p>
            {step === 1 && 'Select your role and email to receive OTP'}
            {step === 2 && 'Enter the OTP sent to your email'}
            {step === 3 && 'Create your new password'}
          </p>
        </div>

        {step === 1 && (
          <form onSubmit={handleSendOTP}>
            {/* Role Selection */}
            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">Reset Password For Role</label>
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
              <label className="form-label">Email Address</label>
              <input
                id="fp-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button
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
                'Send OTP'
              )}
            </button>

            <div className="auth-footer">
              <Link to="/login">← Back to Login</Link>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOTP}>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
              OTP sent to
            </p>
            <p style={{ textAlign: 'center', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '24px' }}>
              {email}
            </p>

            <div className="otp-inputs">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`fp-otp-${index}`}
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
            >
              Verify OTP
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
                ← Change Email
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                id="fp-new-password"
                type="password"
                className="form-input"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                id="fp-confirm-password"
                type="password"
                className="form-input"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
            >
              Reset Password
            </button>

            <div className="auth-footer">
              <Link to="/login">← Back to Login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
