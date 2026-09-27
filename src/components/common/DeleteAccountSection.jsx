// ============================================================
// DeleteAccountSection.jsx — Secure Account Deletion with
// Password Verification + Real Email OTP Confirmation
// ============================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { sendOTP, deleteAccountWithVerification } from '../../services/auth';

export default function DeleteAccountSection() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState(1); // 1 = Password & Request OTP, 2 = Enter OTP & Confirm
  const [sendingOtp, setSendingOtp] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();

    if (!password.trim()) {
      toast.error('Please enter your account password to verify your identity.');
      return;
    }

    setSendingOtp(true);
    const result = await sendOTP(user.email, 'deletion');
    setSendingOtp(false);

    if (result.success) {
      toast.success(`Deletion verification OTP sent to ${user.email}`);
      setStep(2);
    } else {
      toast.error(result.message || 'Failed to send OTP.');
    }
  };

  const handleOTPChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      document.getElementById(`del-otp-${index + 1}`)?.focus();
    }
  };

  const handleOTPKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`del-otp-${index - 1}`)?.focus();
    }
  };

  const handleConfirmDelete = async (e) => {
    e.preventDefault();

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      toast.error('Please enter the complete 6-digit OTP code.');
      return;
    }

    setDeleting(true);
    const result = deleteAccountWithVerification(user.id, password, otpCode);
    setDeleting(false);

    if (result.success) {
      logout();
      toast.success('Your account has been permanently deleted.');
      navigate('/login');
    } else {
      toast.error(result.message);
    }
  };

  const handleCancel = () => {
    setStep(1);
    setPassword('');
    setOtp(['', '', '', '', '', '']);
  };

  return (
    <div className="settings-panel glass-card" style={{ marginTop: '24px', borderColor: 'rgba(255, 23, 68, 0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.4rem' }}>⚠️</span>
        <h3 style={{ color: 'var(--danger)', margin: 0 }}>
          Danger Zone — Delete {user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : ''} Account
        </h3>
      </div>
      
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
        Permanently delete your <strong>{user?.role?.toUpperCase()}</strong> account (<code>{user?.email}</code>), saved IoT settings, and health data. <em>Note: If you have registered other role accounts (e.g. Doctor or Patient) with this email, those accounts will remain completely safe.</em> Deletion requires your <strong>Account Password</strong> and a <strong>6-digit Email OTP</strong> sent to your email.
      </p>

      {step === 1 ? (
        <form onSubmit={handleRequestOtp} style={{ maxWidth: '440px' }}>
          <div className="form-group">
            <label className="form-label">Verify Your Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-danger"
            style={{ background: 'var(--danger)', color: '#fff', border: 'none', fontWeight: 600 }}
            disabled={sendingOtp}
          >
            {sendingOtp ? (
              <>
                <span className="spinner"></span>
                Sending OTP to {user?.email}...
              </>
            ) : (
              '📧 Send Deletion OTP to My Email'
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleConfirmDelete} style={{ maxWidth: '440px' }}>
          <div style={{ background: 'rgba(255, 23, 68, 0.08)', border: '1px solid rgba(255, 23, 68, 0.25)', padding: '14px', borderRadius: '10px', marginBottom: '20px' }}>
            <div style={{ fontSize: '0.88rem', color: '#ff8a80', fontWeight: 600, marginBottom: '4px' }}>
              Final Security Verification
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              A 6-digit deletion code has been sent to <strong>{user?.email}</strong>.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Enter 6-Digit Email OTP</label>
            <div className="otp-inputs" style={{ margin: '14px 0 20px', justifyContent: 'flex-start' }}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`del-otp-${index}`}
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
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="submit"
              className="btn btn-danger"
              style={{ background: 'var(--danger)', color: '#fff', border: 'none', fontWeight: 600, flex: 1 }}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <span className="spinner"></span>
                  Deleting Account...
                </>
              ) : (
                '🗑️ Confirm & Permanently Delete'
              )}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
