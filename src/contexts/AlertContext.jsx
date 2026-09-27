// ============================================================
// Alert Context — Emergency alerts system (cross-tab)
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AlertContext = createContext(null);

const ALERTS_KEY = 'ahm_emergency_alerts';

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);

  // Load alerts from localStorage
  const loadAlerts = useCallback(() => {
    const data = localStorage.getItem(ALERTS_KEY);
    if (data) {
      setAlerts(JSON.parse(data));
    }
  }, []);

  useEffect(() => {
    loadAlerts();

    // Listen for cross-tab changes via storage event
    const handleStorageChange = (e) => {
      if (e.key === ALERTS_KEY) {
        loadAlerts();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also poll every 3 seconds for same-tab updates
    const interval = setInterval(loadAlerts, 3000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [loadAlerts]);

  const sendEmergency = (patient, vitals) => {
    const newAlert = {
      id: 'alert_' + Date.now(),
      patientId: patient.id,
      patientName: patient.name,
      patientEmail: patient.email,
      bpm: vitals.bpm || 0,
      spo2: vitals.spo2 || 0,
      ecg: vitals.ecg || 0,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    const currentAlerts = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    const updatedAlerts = [newAlert, ...currentAlerts];
    localStorage.setItem(ALERTS_KEY, JSON.stringify(updatedAlerts));
    setAlerts(updatedAlerts);

    return newAlert;
  };

  const acknowledgeAlert = (alertId) => {
    const currentAlerts = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    const updated = currentAlerts.map(a =>
      a.id === alertId ? { ...a, acknowledged: true } : a
    );
    localStorage.setItem(ALERTS_KEY, JSON.stringify(updated));
    setAlerts(updated);
  };

  const clearAlert = (alertId) => {
    const currentAlerts = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    const updated = currentAlerts.filter(a => a.id !== alertId);
    localStorage.setItem(ALERTS_KEY, JSON.stringify(updated));
    setAlerts(updated);
  };

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);

  return (
    <AlertContext.Provider value={{ 
      alerts, 
      unacknowledgedAlerts, 
      sendEmergency, 
      acknowledgeAlert, 
      clearAlert 
    }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
}
