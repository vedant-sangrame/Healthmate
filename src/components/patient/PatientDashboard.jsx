// ============================================================
// Patient Dashboard — Main patient view
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAlerts } from '../../contexts/AlertContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchChannelData, parseLatestFeed, parseAllFeeds } from '../../services/thingspeak';
import { getPrescriptionsForPatient, getAssignmentsForPatient } from '../../services/prescriptions';
import Sidebar from '../common/Sidebar';
import DeleteAccountSection from '../common/DeleteAccountSection';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'history', label: 'History', icon: '📈' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
  { id: 'mylabs', label: 'My Labs', icon: '🔬' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function PatientDashboard() {
  const { user, updateThingSpeak, deleteAccount } = useAuth();
  const { sendEmergency } = useAlerts();
  const toast = useToast();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [channelId, setChannelId] = useState(user?.thingspeakChannelId || '');
  const [readKey, setReadKey] = useState(user?.thingspeakReadKey || '');
  const [latestData, setLatestData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [ecgHistory, setEcgHistory] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [emergencySending, setEmergencySending] = useState(false);
  const [prescriptions, setPrescriptions] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  
  // Keep local inputs synced with user credentials if user changes
  useEffect(() => {
    if (user?.thingspeakChannelId) {
      setChannelId(user.thingspeakChannelId);
    }
    if (user?.thingspeakReadKey) {
      setReadKey(user.thingspeakReadKey);
    }
  }, [user?.thingspeakChannelId, user?.thingspeakReadKey]);
  
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    const cId = user?.thingspeakChannelId;
    const rKey = user?.thingspeakReadKey;
    
    if (!cId || !rKey) return;

    try {
      // Fetch latest (fetch 10 to get most recent valid feed)
      const data = await fetchChannelData(cId, rKey, 10);
      const latest = parseLatestFeed(data);
      if (latest) {
        setLatestData(latest);
        setLastUpdate(new Date());
        setIsConnected(true);

        // Add to ECG history (keep last 50 points)
        setEcgHistory(prev => {
          const updated = [...prev, { value: latest.ecg, time: new Date(latest.timestamp).toLocaleTimeString() }];
          return updated.slice(-50);
        });
      }

      // Fetch history (last 100 entries)
      const histData = await fetchChannelData(cId, rKey, 100);
      const allFeeds = parseAllFeeds(histData);
      setHistoryData(allFeeds);

    } catch (err) {
      console.error('ThingSpeak fetch error:', err);
      setIsConnected(false);
    }
  }, [user?.thingspeakChannelId, user?.thingspeakReadKey]);

  useEffect(() => {
    if (user?.thingspeakChannelId && user?.thingspeakReadKey) {
      fetchData();
      intervalRef.current = setInterval(fetchData, 15000); // Poll every 15s
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, user?.thingspeakChannelId, user?.thingspeakReadKey]);

  // Load prescriptions and lab assignments
  useEffect(() => {
    if (user?.id) {
      const loadData = () => {
        setPrescriptions(getPrescriptionsForPatient(user.id));
        setMyAssignments(getAssignmentsForPatient(user.id));
      };
      loadData();
      const interval = setInterval(loadData, 10000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  const handleSaveSettings = () => {
    if (!channelId.trim() || !readKey.trim()) {
      toast.error('Please enter both Channel ID and Read API Key.');
      return;
    }
    updateThingSpeak(channelId.trim(), readKey.trim());
    toast.success('ThingSpeak settings saved! Data will start loading.');
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      '⚠️ Are you sure you want to permanently delete your account?\n\nThis will remove your account and all associated health vitals history. This action cannot be undone.'
    );
    if (confirmed) {
      deleteAccount();
      toast.success('Your account has been deleted successfully.');
      navigate('/login');
    }
  };

  const handleEmergency = () => {
    setEmergencySending(true);
    
    const vitals = {
      bpm: latestData?.bpm || 0,
      spo2: latestData?.spo2 || 0,
      ecg: latestData?.ecg || 0,
    };

    sendEmergency(user, vitals);
    toast.error('🚨 Emergency SOS sent to all doctors!');
    
    setTimeout(() => setEmergencySending(false), 3000);
  };

  const getStatusClass = (bpm, spo2) => {
    if (!bpm && !spo2) return 'info';
    if (bpm < 50 || bpm > 120 || spo2 < 90) return 'danger';
    if (bpm < 60 || bpm > 100 || spo2 < 95) return 'warning';
    return 'success';
  };

  const getStatusLabel = (bpm, spo2) => {
    if (!bpm && !spo2) return 'NO DATA';
    if (bpm < 50 || bpm > 120 || spo2 < 90) return 'CRITICAL';
    if (bpm < 60 || bpm > 100 || spo2 < 95) return 'CHECK';
    return 'NORMAL';
  };

  const getBPMStatus = (bpm) => {
    if (!bpm) return { class: 'info', label: 'N/A' };
    if (bpm < 50 || bpm > 120) return { class: 'critical', label: 'CRITICAL' };
    if (bpm < 60 || bpm > 100) return { class: 'warning', label: 'CHECK' };
    return { class: 'normal', label: 'NORMAL' };
  };

  const getSpO2Status = (spo2) => {
    if (!spo2) return { class: 'info', label: 'N/A' };
    if (spo2 < 90) return { class: 'critical', label: 'LOW' };
    if (spo2 < 95) return { class: 'warning', label: 'CHECK' };
    return { class: 'normal', label: 'NORMAL' };
  };

  // Chart configs
  const ecgChartData = {
    labels: ecgHistory.map(p => p.time),
    datasets: [{
      label: 'ECG',
      data: ecgHistory.map(p => p.value),
      borderColor: '#00E676',
      backgroundColor: 'rgba(0, 230, 118, 0.05)',
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 0,
    }],
  };

  const ecgChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    scales: {
      x: { display: false },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#6a6a80', font: { size: 10 } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  };

  // Live Graph: strictly latest 10 readings
  const last10Live = historyData.slice(-10);

  const liveTrendChartData = {
    labels: last10Live.map(f => new Date(f.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'BPM',
        data: last10Live.map(f => f.bpm),
        borderColor: '#FF1744',
        backgroundColor: 'rgba(255, 23, 68, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#FF1744',
      },
      {
        label: 'SpO2 (%)',
        data: last10Live.map(f => f.spo2),
        borderColor: '#29B6F6',
        backgroundColor: 'rgba(41, 182, 246, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#29B6F6',
      },
    ],
  };

  // History tab: past readings from last 1 month, filtered by date range if provided
  const getFilteredHistory = () => {
    let list = historyData; // already filtered to <= 1 month by parseAllFeeds
    if (dateFrom || dateTo) {
      list = historyData.filter(f => {
        const ts = new Date(f.timestamp);
        if (dateFrom && ts < new Date(dateFrom)) return false;
        if (dateTo && ts > new Date(dateTo + 'T23:59:59')) return false;
        return true;
      });
    }
    return list;
  };

  const filteredHistory = getFilteredHistory();

  const historyChartData = {
    labels: filteredHistory.map(f => new Date(f.timestamp).toLocaleDateString() + ' ' + new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    datasets: [
      {
        label: 'BPM',
        data: filteredHistory.map(f => f.bpm),
        borderColor: '#FF1744',
        backgroundColor: 'rgba(255, 23, 68, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#FF1744',
      },
      {
        label: 'SpO2 (%)',
        data: filteredHistory.map(f => f.spo2),
        borderColor: '#29B6F6',
        backgroundColor: 'rgba(41, 182, 246, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#29B6F6',
      },
    ],
  };

  const historyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#6a6a80', font: { size: 10 }, maxTicksLimit: 10 },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#6a6a80', font: { size: 10 } },
      },
    },
    plugins: {
      legend: {
        labels: { color: '#a0a0b5', font: { size: 12 }, usePointStyle: true, pointStyle: 'circle' },
      },
    },
  };

  const bpmStatus = getBPMStatus(latestData?.bpm);
  const spo2Status = getSpO2Status(latestData?.spo2);

  return (
    <div className="dashboard-layout">
      <div className="app-bg"></div>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} tabs={TABS} />

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">
                  {user?.thingspeakChannelId ? (
                    <>
                      IoT Device Connected (Channel ID: <strong>{user.thingspeakChannelId}</strong>) • {lastUpdate ? `Updated: ${lastUpdate.toLocaleTimeString()}` : 'Connecting...'}
                    </>
                  ) : (
                    'Not connected — Enter your ThingSpeak Channel ID below to start'
                  )}
                </p>
              </div>
              <div className="header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {user?.thingspeakChannelId && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setShowDeviceModal(true)}
                    title="Change or update your ThingSpeak Channel ID & Read Key"
                  >
                    ✏️ Change Device
                  </button>
                )}
                <span className={`badge ${isConnected ? 'badge-success' : 'badge-warning'}`}>
                  <span className="stat-status-dot"></span>
                  {isConnected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
            </div>

            {/* First-time Device Setup Card if no Channel ID is configured */}
            {!user?.thingspeakChannelId && (
              <div className="glass-card" style={{ padding: '28px', marginBottom: '24px', border: '1px solid rgba(108, 99, 255, 0.4)', background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.08) 0%, rgba(20, 20, 35, 0.6) 100%)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>📡</div>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px 0' }}>
                      Connect Your IoT Health Kit
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                      Enter your ThingSpeak <strong>Channel ID</strong> and <strong>Read API Key</strong> once. They will be saved to your account forever—you won't need to re-enter them on your next login!
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', maxWidth: '650px' }}>
                      <div>
                        <label className="form-label">ThingSpeak Channel ID *</label>
                        <input
                          id="patient-setup-cid"
                          type="text"
                          className="form-input"
                          placeholder="e.g. 2851234"
                          value={channelId}
                          onChange={(e) => setChannelId(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Read API Key *</label>
                        <input
                          id="patient-setup-rkey"
                          type="text"
                          className="form-input"
                          placeholder="e.g. ABC123XYZ456"
                          value={readKey}
                          onChange={(e) => setReadKey(e.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: '16px', padding: '10px 24px' }}
                      onClick={handleSaveSettings}
                    >
                      💾 Save & Connect Device
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Vitals Cards */}
            <div className="stats-grid">
              <div className="stat-card glass-card bpm">
                <div className="stat-icon">❤️</div>
                <div className="stat-label">Heart Rate</div>
                <div className={`stat-value ${getStatusClass(latestData?.bpm, 100)}`}>
                  {latestData?.bpm || '--'}
                </div>
                <div className="stat-unit">BPM</div>
                <div className={`stat-status ${bpmStatus.class}`}>
                  <span className="stat-status-dot"></span>
                  {bpmStatus.label}
                </div>
              </div>

              <div className="stat-card glass-card spo2">
                <div className="stat-icon">🫁</div>
                <div className="stat-label">Blood Oxygen</div>
                <div className={`stat-value ${getStatusClass(100, latestData?.spo2)}`}>
                  {latestData?.spo2 || '--'}
                </div>
                <div className="stat-unit">SpO2 %</div>
                <div className={`stat-status ${spo2Status.class}`}>
                  <span className="stat-status-dot"></span>
                  {spo2Status.label}
                </div>
              </div>

              <div className="stat-card glass-card ecg">
                <div className="stat-icon">⚡</div>
                <div className="stat-label">ECG Signal</div>
                <div className="stat-value info">
                  {latestData?.ecg ? Math.round(latestData.ecg) : '--'}
                </div>
                <div className="stat-unit">Raw ADC</div>
                <div className={`stat-status ${isConnected ? 'normal' : 'warning'}`}>
                  <span className="stat-status-dot"></span>
                  {isConnected ? 'ACTIVE' : 'N/A'}
                </div>
              </div>

              <div className="stat-card glass-card status">
                <div className="stat-icon">🩺</div>
                <div className="stat-label">Health Status</div>
                <div className={`stat-value ${getStatusClass(latestData?.bpm, latestData?.spo2)}`}>
                  {getStatusLabel(latestData?.bpm, latestData?.spo2)}
                </div>
                <div className="stat-unit">Overall</div>
              </div>
            </div>

            {/* ECG Chart */}
            <div className="chart-container glass-card">
              <div className="chart-header">
                <h3 className="chart-title">📈 Real-Time ECG Waveform</h3>
                <div className="chart-badge">
                  <span className="chart-badge-dot"></span>
                  LIVE
                </div>
              </div>
              <div className="chart-wrapper">
                {ecgHistory.length > 0 ? (
                  <Line data={ecgChartData} options={ecgChartOptions} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    Waiting for ECG data...
                  </div>
                )}
              </div>
            </div>

            {/* Real-time BPM & SpO2 Trends (Latest 10 Readings) */}
            <div className="chart-container glass-card">
              <div className="chart-header">
                <h3 className="chart-title">📊 Real-Time Vitals Trend (Latest 10 Readings)</h3>
                <span className="badge badge-info">{last10Live.length} readings (Latest 10)</span>
              </div>
              <div className="chart-wrapper">
                {last10Live.length > 0 ? (
                  <Line data={liveTrendChartData} options={historyChartOptions} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    No vitals data available
                  </div>
                )}
              </div>
            </div>

            {/* Emergency SOS */}
            <div className="emergency-section">
              <button
                id="emergency-btn"
                className={`emergency-btn ${emergencySending ? 'sending' : ''}`}
                onClick={handleEmergency}
                disabled={emergencySending}
              >
                {emergencySending ? (
                  <>⏳ SENDING SOS...</>
                ) : (
                  <>🚨 EMERGENCY SOS</>
                )}
              </button>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px' }}>
                Press to alert all doctors immediately
              </p>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Readings History</h1>
                <p className="page-subtitle">View your past health readings from the last 1 month</p>
              </div>
            </div>

            {/* Date Range Selector for History */}
            <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="date-range" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Filter by Date:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
                {(dateFrom || dateTo) && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {filteredHistory.length} checkings found (Last 1 Month)
              </span>
            </div>

            <div className="chart-container glass-card">
              <div className="chart-header">
                <h3 className="chart-title">📊 BPM & SpO2 History</h3>
                <span className="badge badge-info">{filteredHistory.length} checkings</span>
              </div>
              <div className="chart-wrapper" style={{ height: '350px' }}>
                {filteredHistory.length > 0 ? (
                  <Line data={historyChartData} options={historyChartOptions} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    No checkings found for the selected date range.
                  </div>
                )}
              </div>
            </div>

            {/* History Table */}
            <div className="glass-card" style={{ padding: '24px', marginTop: '24px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Past Readings ({filteredHistory.length} Checkings)</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>BPM</th>
                    <th>SpO2</th>
                    <th>ECG</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.slice().reverse().map((feed, i) => (
                    <tr key={i}>
                      <td>{new Date(feed.timestamp).toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>{feed.bpm || '--'}</td>
                      <td style={{ fontWeight: 600 }}>{feed.spo2 || '--'}%</td>
                      <td>{feed.ecg ? Math.round(feed.ecg) : '--'}</td>
                      <td>
                        <span className={`badge badge-${getStatusClass(feed.bpm, feed.spo2)}`}>
                          {getStatusLabel(feed.bpm, feed.spo2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No readings recorded in the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'prescriptions' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">My Prescriptions & Lab Reports</h1>
                <p className="page-subtitle">Prescriptions and reports from your doctors and assigned pathology labs</p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              {prescriptions.length > 0 ? (
                <div className="notes-list">
                  {prescriptions.map(rx => (
                    <div key={rx.id} className="note-item">
                      <div className="note-date" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span>{new Date(rx.createdAt).toLocaleString()}</span>
                        <span className={`badge ${rx.authorRole === 'pathology' ? 'badge-primary' : 'badge-info'}`}>
                          {rx.authorRole === 'pathology' ? `🔬 ${rx.authorName || 'Pathology Lab'} (Pathology Lab)` : `👨‍⚕️ Dr. ${rx.doctorName || rx.authorName} (Doctor)`}
                        </span>
                      </div>
                      <div className="note-text" style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>{rx.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                  💊 No prescriptions yet. When a doctor or assigned pathology lab writes a prescription for you, it will appear here.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'mylabs' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Assigned Pathology Labs</h1>
                <p className="page-subtitle">Pathology labs assigned to you by your doctor</p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              {myAssignments.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pathology Lab</th>
                      <th>Assigned By</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myAssignments.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>
                          <span className="badge badge-info">🔬 {a.pathologyName}</span>
                        </td>
                        <td>Dr. {a.doctorName}</td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {new Date(a.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                  🔬 You have not been assigned to any pathology lab yet.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Configure your device connection</p>
              </div>
            </div>

            <div className="settings-panel glass-card">
              <h3>📡 ThingSpeak Configuration</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                Enter your ThingSpeak Channel ID and Read API Key to start receiving live data from your IoT device.
              </p>
              
              <div className="form-group">
                <label className="form-label">Channel ID</label>
                <input
                  id="ts-channel-id"
                  type="text"
                  className="form-input"
                  placeholder="e.g., 2851234"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Read API Key</label>
                <input
                  id="ts-read-key"
                  type="text"
                  className="form-input"
                  placeholder="e.g., ABCDEF1234567890"
                  value={readKey}
                  onChange={(e) => setReadKey(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSaveSettings}
              >
                💾 Save Settings
              </button>

              {isConnected && (
                <div style={{ marginTop: '16px' }}>
                  <span className="badge badge-success">
                    <span className="stat-status-dot"></span>
                    Connected & Receiving Data
                  </span>
                </div>
              )}
            </div>

            {/* Danger Zone: Account Management with Password + OTP */}
            <DeleteAccountSection />
          </>
        )}

        {/* Change / Update Device Modal */}
        {showDeviceModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <div className="glass-card" style={{ maxWidth: '460px', width: '100%', padding: '28px', background: '#12121a', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>✏️ Update IoT Device</h3>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowDeviceModal(false)}
                  style={{ fontSize: '1.1rem', padding: '4px 8px' }}
                >
                  ✕
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.5' }}>
                Change your ThingSpeak Channel ID or Read Key if you got a new hardware device. Once saved, it will stay updated for your account.
              </p>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">ThingSpeak Channel ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 2851234"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Read API Key</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ABC123XYZ456"
                  value={readKey}
                  onChange={(e) => setReadKey(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowDeviceModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    handleSaveSettings();
                    setShowDeviceModal(false);
                  }}
                >
                  💾 Save & Update
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
