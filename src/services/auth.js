// ============================================================
// Authentication Service
// Uses localStorage for user database
// Uses EmailJS for real OTP delivery (inbuilt configuration)
// ============================================================

import emailjs from '@emailjs/browser';

// Inbuilt EmailJS Configuration — loaded directly from environment or inbuilt constants
export const INBUILT_EMAIL_CONFIG = {
  serviceId: import.meta.env?.VITE_EMAILJS_SERVICE_ID || '',
  templateId: import.meta.env?.VITE_EMAILJS_TEMPLATE_ID || '',
  publicKey: import.meta.env?.VITE_EMAILJS_PUBLIC_KEY || '',
};

// Storage keys
const USERS_KEY = 'ahm_users';
const CURRENT_USER_KEY = 'ahm_current_user';
const OTP_KEY = 'ahm_otp_store';

/**
 * Initialize EmailJS with inbuilt key
 */
export function initEmailJS() {
  const pubKey = INBUILT_EMAIL_CONFIG.publicKey || localStorage.getItem('emailjs_public_key');
  if (pubKey) {
    emailjs.init(pubKey);
    return true;
  }
  return false;
}

/**
 * Get all registered users
 */
function getUsers() {
  const data = localStorage.getItem(USERS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save users to localStorage
 */
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP with expiration (5 minutes)
 */
function storeOTP(email, otp) {
  const otpData = {
    email,
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  };
  localStorage.setItem(OTP_KEY, JSON.stringify(otpData));
}

/**
 * Verify OTP
 */
export function verifyOTP(email, otp) {
  const data = localStorage.getItem(OTP_KEY);
  if (!data) return { success: false, message: 'No OTP found. Please request a new one.' };
  
  const otpData = JSON.parse(data);
  
  if (otpData.email !== email) {
    return { success: false, message: 'OTP does not match this email.' };
  }
  
  if (Date.now() > otpData.expiresAt) {
    localStorage.removeItem(OTP_KEY);
    return { success: false, message: 'OTP has expired. Please request a new one.' };
  }
  
  if (otpData.otp !== otp) {
    return { success: false, message: 'Invalid OTP. Please try again.' };
  }
  
  // OTP is valid, clear it
  localStorage.removeItem(OTP_KEY);
  return { success: true };
}

/**
 * Send OTP via Inbuilt Backend Mailer (Node.js + Nodemailer)
 */
export async function sendOTP(email, purpose = 'verification') {
  const otp = generateOTP();
  storeOTP(email, otp);
  
  try {
    const apiUrl = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:5000' : '');
    const response = await fetch(`${apiUrl}/api/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        otp: otp,
        purpose: purpose,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return {
        success: false,
        message: data.message || 'Failed to send verification code. Please check your email and try again.',
      };
    }

    return {
      success: true,
      message: data.message || `Verification code sent to ${email}`,
    };
  } catch (err) {
    console.error('[Inbuilt Mailer Error]:', err);
    return {
      success: false,
      message: 'Unable to connect to the email server. Please try again in a few moments.',
    };
  }
}

/**
 * Check if an account already exists for a specific email and role
 */
export function checkAccountExists(email, role = 'patient') {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  return users.some(u => u.email.toLowerCase() === normalizedEmail && u.role === role);
}

/**
 * Register a new user
 * Allows the same email to register for different roles (e.g. Patient & Doctor),
 * but blocks duplicate registration within the same role.
 */
export function registerUser(name, email, password, role = 'patient') {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const targetRole = role || 'patient';
  
  // Check if an account for this email AND role already exists
  const existing = users.find(u => u.email.toLowerCase() === normalizedEmail && u.role === targetRole);
  if (existing) {
    const roleCapitalized = targetRole.charAt(0).toUpperCase() + targetRole.slice(1);
    return { 
      success: false, 
      message: `A ${roleCapitalized} account with this email already exists. Please log in instead.` 
    };
  }
  
  const newUser = {
    id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    name: name.trim(),
    email: normalizedEmail,
    password, // In production, this should be hashed
    role: targetRole, // 'patient', 'doctor', 'pathology'
    createdAt: new Date().toISOString(),
    thingspeakChannelId: '',
    thingspeakReadKey: '',
  };
  
  users.push(newUser);
  saveUsers(users);
  
  return { success: true, user: newUser };
}

/**
 * Login with email, password, and specific role.
 * User must have an existing account created for the selected role.
 * Direct switching without registration is NOT permitted.
 */
export function loginUser(email, password, role = 'patient') {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const targetRole = role || 'patient';
  
  // Find account specifically for this email and role
  const roleAccount = users.find(u => u.email.toLowerCase() === normalizedEmail && u.role === targetRole);
  
  if (!roleAccount) {
    // Check if this email exists under other roles to provide a clear, helpful message
    const existingAccounts = users.filter(u => u.email.toLowerCase() === normalizedEmail);
    if (existingAccounts.length > 0) {
      const registeredRoles = existingAccounts.map(u => u.role.charAt(0).toUpperCase() + u.role.slice(1)).join(', ');
      const requestedRole = targetRole.charAt(0).toUpperCase() + targetRole.slice(1);
      return {
        success: false,
        message: `No ${requestedRole} account found for this email. You have registered as (${registeredRoles}). Please create a ${requestedRole} account first.`,
      };
    }
    return { success: false, message: 'No account found with this email. Please create an account first.' };
  }
  
  if (roleAccount.password !== password) {
    return { success: false, message: 'Incorrect password for this account.' };
  }
  
  // Create clean session for this role
  const session = { ...roleAccount };
  delete session.password;
  
  sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session));
  localStorage.removeItem(CURRENT_USER_KEY); // Clean up legacy local session
  
  return { success: true, user: session };
}

/**
 * Permanently delete a user account and associated session
 */
export function deleteUser(userId) {
  const users = getUsers();
  const remaining = users.filter(u => u.id !== userId);
  saveUsers(remaining);
  
  // Also clean up alerts from this user if any
  try {
    const alerts = JSON.parse(localStorage.getItem('ahm_emergency_alerts') || '[]');
    const cleanedAlerts = alerts.filter(a => a.patientId !== userId);
    localStorage.setItem('ahm_emergency_alerts', JSON.stringify(cleanedAlerts));
  } catch (e) {
    console.error('Error cleaning alerts:', e);
  }
  
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === userId) {
    logoutUser();
  }
  
  return { success: true, message: 'Account permanently deleted.' };
}

/**
 * Permanently delete user account with password and OTP verification
 */
export function deleteAccountWithVerification(userId, password, otp) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    return { success: false, message: 'User account not found.' };
  }
  
  if (user.password !== password) {
    return { success: false, message: 'Incorrect password. Deletion denied.' };
  }
  
  const otpResult = verifyOTP(user.email, otp);
  if (!otpResult.success) {
    return { success: false, message: otpResult.message || 'Invalid or expired OTP.' };
  }
  
  // Deletion approved — remove user with this specific role id
  const remaining = users.filter(u => u.id !== userId);
  saveUsers(remaining);
  
  try {
    const alerts = JSON.parse(localStorage.getItem('ahm_emergency_alerts') || '[]');
    const cleanedAlerts = alerts.filter(a => a.patientId !== userId);
    localStorage.setItem('ahm_emergency_alerts', JSON.stringify(cleanedAlerts));
  } catch (e) {
    console.error('Error cleaning alerts:', e);
  }
  
  logoutUser();
  return { success: true, message: 'Account permanently deleted.' };
}

/**
 * Get current logged-in user (from active tab session only)
 */
export function getCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  const data = sessionStorage.getItem(CURRENT_USER_KEY);
  return data ? JSON.parse(data) : null;
}

/**
 * Logout
 */
export function logoutUser() {
  sessionStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
}

/**
 * Reset password for a specific role account
 */
export function resetPassword(email, newPassword, role = 'patient') {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const targetRole = role || 'patient';
  
  const userIndex = users.findIndex(u => u.email.toLowerCase() === normalizedEmail && u.role === targetRole);
  
  if (userIndex === -1) {
    const roleCapitalized = targetRole.charAt(0).toUpperCase() + targetRole.slice(1);
    return { success: false, message: `No ${roleCapitalized} account found with this email.` };
  }
  
  users[userIndex].password = newPassword;
  saveUsers(users);
  
  return { success: true, message: 'Password reset successfully!' };
}

/**
 * Update user's ThingSpeak settings
 */
export function updateThingSpeakSettings(userId, channelId, readKey) {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) return false;
  
  users[userIndex].thingspeakChannelId = channelId;
  users[userIndex].thingspeakReadKey = readKey;
  saveUsers(users);
  
  // Also update current active session
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === userId) {
    currentUser.thingspeakChannelId = channelId;
    currentUser.thingspeakReadKey = readKey;
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  }
  
  return true;
}

/**
 * Get all patients (for doctor/pathology)
 * Returns all registered accounts (excluding current doctor viewing them)
 */
export function getAllPatients(excludeUserId) {
  const users = getUsers();
  return users
    .filter(u => (!excludeUserId || u.id !== excludeUserId) && u.role === 'patient')
    .map(u => {
      const { password, ...safe } = u;
      return safe;
    });
}

/**
 * Get user by ID (without password)
 */
export function getUserById(userId) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

/**
 * Check if EmailJS is configured
 */
export function isEmailJSConfigured() {
  return !!(
    localStorage.getItem('emailjs_service_id') &&
    localStorage.getItem('emailjs_template_id') &&
    localStorage.getItem('emailjs_public_key')
  );
}

/**
 * Save EmailJS configuration
 */
export function saveEmailJSConfig(serviceId, templateId, publicKey) {
  localStorage.setItem('emailjs_service_id', serviceId);
  localStorage.setItem('emailjs_template_id', templateId);
  localStorage.setItem('emailjs_public_key', publicKey);
  emailjs.init(publicKey);
}
