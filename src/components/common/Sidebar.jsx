// ============================================================
// Sidebar — Navigation & User Profile
// ============================================================

import { useAuth } from '../../contexts/AuthContext';
import { useAlerts } from '../../contexts/AlertContext';

export default function Sidebar({ activeTab, onTabChange, tabs }) {
  const { user, logout } = useAuth();
  const { unacknowledgedAlerts } = useAlerts();

  const getInitials = (name) => {
    return (name || 'User')
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'doctor': return 'Doctor';
      case 'pathology': return 'Pathology Lab';
      default: return 'Patient';
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🏥</div>
        <div className="sidebar-logo-text">
          AI Health
          <span>Monitor</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`sidebar-link ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'alerts' && unacknowledgedAlerts.length > 0 && (
              <span className="badge badge-danger" style={{ marginLeft: 'auto', minWidth: '22px', justifyContent: 'center' }}>
                {unacknowledgedAlerts.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ borderTop: '1px solid var(--glass-border)', marginTop: 'auto' }}>
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {user ? getInitials(user.name) : '?'}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || 'User'}</div>
            <div className="sidebar-user-role">{getRoleLabel(user?.role)}</div>
          </div>
        </div>

        <button
          className="sidebar-link"
          onClick={logout}
          style={{ width: '100%', marginTop: '12px', justifyContent: 'center', color: 'var(--danger)' }}
          title="Sign out of this session"
        >
          <span className="icon">🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
