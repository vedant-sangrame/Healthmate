// ============================================================
// Auth Context — Global authentication state
// ============================================================

import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, logoutUser, loginUser, updateThingSpeakSettings, deleteUser } from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const savedUser = getCurrentUser();
    if (savedUser) {
      setUser(savedUser);
    }
    setLoading(false);
  }, []);

  const login = (email, password, role) => {
    const result = loginUser(email, password, role);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  const deleteAccount = () => {
    if (!user) return { success: false, message: 'No user logged in' };
    const result = deleteUser(user.id);
    setUser(null);
    return result;
  };

  const logout = () => {
    logoutUser();
    setUser(null);
  };

  const updateThingSpeak = (channelId, readKey) => {
    if (user) {
      updateThingSpeakSettings(user.id, channelId, readKey);
      setUser(prev => ({ ...prev, thingspeakChannelId: channelId, thingspeakReadKey: readKey }));
    }
  };

  const refreshUser = () => {
    const savedUser = getCurrentUser();
    if (savedUser) {
      setUser(savedUser);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, deleteAccount, updateThingSpeak, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
