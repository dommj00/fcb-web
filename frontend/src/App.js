import React, { useState, useEffect } from 'react';
import './App.css';
import { getClips, getStats, deleteClip, getDownloadUrl, getBotStatus, startBot, stopBot, restartBot, createQuickClip, getQueueStatus, cancelClip, cancelMultipleClips, getEditedClips, bulkDeleteClips, bulkDeleteEditedClips, clearBufferCache, clearSystemLogs, clearTempFiles, getLogs } from './api';
import ClipEditorModal from './ClipEditorModal';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [clips, setClips] = useState([]);
  const [filteredClips, setFilteredClips] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedClip, setSelectedClip] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
    
  // WebSocket state
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Queue state (moved from API calls to WebSocket updates)
  const [queueData, setQueueData] = useState(null);
  
  // Bot status state
  const [botStatus, setBotStatus] = useState('unknown');
  const [botLoading, setBotLoading] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [resolutionFilter, setResolutionFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
    
  // Sorting state
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' or 'oldest'
    
  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedClips, setSelectedClips] = useState([]);
    
  // Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logLevelFilter, setLogLevelFilter] = useState('all');

  // Quick Clip options
  const [quickClipOptions, setQuickClipOptions] = useState({
    duration: '1m',
    resolution: '720p',
    direction: 'past'
  });

  // Load bot status on mount
  useEffect(() => {
    loadBotStatus();
    // Poll bot status every 10 seconds
    const interval = setInterval(loadBotStatus, 10000);
    return () => clearInterval(interval);
  }, []);
    
    // WebSocket connection
      useEffect(() => {
        const connectWebSocket = () => {
          // Use WSS (secure WebSocket) for ngrok HTTPS tunnel
          const websocket = new WebSocket('wss://idell-unparenthesised-consecutively.ngrok-free.dev/ws/queue');
          
          websocket.onopen = () => {
            console.log('WebSocket connected');
            setWsConnected(true);
          };
          
          websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('WebSocket message:', message);
            
            if (message.type === 'queue_status') {
              setQueueData(message.data);
            } else if (message.type === 'clip_cancelled') {
              // Refresh queue status
              console.log('Clip cancelled:', message.clip_id);
            } else if (message.type === 'clips_cancelled') {
              // Multiple clips cancelled
              console.log('Clips cancelled:', message.clip_ids);
            }
          };
          
          websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            setWsConnected(false);
          };
          
          websocket.onclose = () => {
            console.log('WebSocket closed, reconnecting in 3s...');
            setWsConnected(false);
            setTimeout(connectWebSocket, 3000);
          };
          
          setWs(websocket);
        };
        
        connectWebSocket();
        
        // Cleanup on unmount
        return () => {
          if (ws) {
            ws.close();
          }
        };
      }, []);

  useEffect(() => {
    if (currentPage === 'dashboard' || currentPage === 'clips') {
      loadData();
    }
  }, [currentPage]);

  useEffect(() => {
    applyFilters();
  }, [clips, statusFilter, resolutionFilter, directionFilter, sortOrder]);
    
  // Auto-refresh logs when on logs page
  useEffect(() => {
    if (currentPage === 'logs') {
      loadLogs();
      const interval = setInterval(loadLogs, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [currentPage, logLevelFilter]);

  const loadBotStatus = async () => {
    try {
      const data = await getBotStatus();
      setBotStatus(data.status);
    } catch (error) {
      console.error('Error loading bot status:', error);
      setBotStatus('unknown');
    }
  };

  const handleBotToggle = async () => {
    setBotLoading(true);
    try {
      if (botStatus === 'running') {
        const data = await stopBot();
        setBotStatus(data.status);
        alert('Bot stopped successfully!');
      } else {
        const data = await startBot();
        setBotStatus(data.status);
        alert('Bot started successfully!');
      }
    } catch (error) {
      alert('Failed to toggle bot: ' + error.message);
    }
    setBotLoading(false);
  };

  const handleBotRestart = async () => {
    if (!window.confirm('Are you sure you want to restart the bot?')) return;
    
    setBotLoading(true);
    try {
      const data = await restartBot();
      setBotStatus(data.status);
      alert('Bot restarted successfully!');
    } catch (error) {
      alert('Failed to restart bot: ' + error.message);
    }
    setBotLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [clipsData, statsData] = await Promise.all([
        getClips('kaznightfury'),
        getStats()
      ]);
      setClips(clipsData.clips || []);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };
    
    const loadLogs = async () => {
      setLogsLoading(true);
      try {
        const levelFilter = logLevelFilter === 'all' ? null : logLevelFilter;
        const data = await getLogs(100, levelFilter);
        setLogs(data.logs || []);
      } catch (error) {
        console.error('Error loading logs:', error);
        setLogs([]);
      }
      setLogsLoading(false);
    };

  const applyFilters = () => {
    let filtered = [...clips];
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(clip => clip.status === statusFilter);
    }
    
    if (resolutionFilter !== 'all') {
      filtered = filtered.filter(clip => clip.resolution === resolutionFilter);
    }
    
    if (directionFilter !== 'all') {
      filtered = filtered.filter(clip => clip.direction === directionFilter);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      
      if (sortOrder === 'newest') {
        return dateB - dateA; // Newest first
      } else {
        return dateA - dateB; // Oldest first
      }
    });
    
    setFilteredClips(filtered);
  };
    


    const handleBulkDelete = async () => {
        if (selectedClips.length === 0) {
          alert('Please select at least one clip to delete');
          return;
        }

        const confirmMessage = `Are you sure you want to delete ${selectedClips.length} clip(s)? This will permanently delete them from cloud storage.`;
        if (window.confirm(confirmMessage)) {
          try {
            await bulkDeleteClips(selectedClips);
            alert(`${selectedClips.length} clip(s) deleted successfully!`);
            setSelectedClips([]);
            setSelectMode(false);
            loadData();
          } catch (error) {
            alert('Failed to delete clips: ' + error.message);
          }
        }
      };

      const toggleSelectMode = () => {
        setSelectMode(!selectMode);
        setSelectedClips([]);
      };

      const toggleClipSelection = (clipId) => {
        setSelectedClips(prev => {
          if (prev.includes(clipId)) {
            return prev.filter(id => id !== clipId);
          } else {
            return [...prev, clipId];
          }
        });
      };

      const selectAllClips = () => {
        if (selectedClips.length === filteredClips.length) {
          setSelectedClips([]);
        } else {
          setSelectedClips(filteredClips.map(clip => clip.clip_id));
        }
      };

      const handleDeleteClip = async (clipId) => {
        if (window.confirm('Are you sure you want to delete this clip?')) {
          try {
            await deleteClip(clipId);
            alert('Clip deleted successfully!');
            loadData();
          } catch (error) {
            alert('Failed to delete clip: ' + error.message);
          }
        }
      };

      const handleDownloadClip = async (clipId) => {
        try {
          const data = await getDownloadUrl(clipId);
          window.open(data.download_url, '_blank');
        } catch (error) {
          alert('Failed to get download URL: ' + error.message);
        }
      };

  const openEditor = (clip) => {
    setSelectedClip(clip);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setSelectedClip(null);
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">
              <i className="fas fa-bolt"></i>
            </div>
            <div className="logo-text">
              <h1>FuryClips</h1>
              <p>Clip Management</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentPage('dashboard')}
          >
            <i className="fas fa-home"></i>
            <span>Dashboard</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'quick-clips' ? 'active' : ''}`}
            onClick={() => setCurrentPage('quick-clips')}
          >
            <i className="fas fa-bolt"></i>
            <span>Quick Clips</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'clips' ? 'active' : ''}`}
            onClick={() => setCurrentPage('clips')}
          >
            <i className="fas fa-photo-video"></i>
            <span>Clips Library</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'edited-clips' ? 'active' : ''}`}
            onClick={() => setCurrentPage('edited-clips')}
          >
            <i className="fas fa-cut"></i>
            <span>Edited Clips</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'commands' ? 'active' : ''}`}
            onClick={() => setCurrentPage('commands')}
          >
            <i className="fas fa-terminal"></i>
            <span>Commands</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'queue' ? 'active' : ''}`}
            onClick={() => setCurrentPage('queue')}
          >
            <i className="fas fa-list"></i>
            <span>Queue Monitor</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'costs' ? 'active' : ''}`}
            onClick={() => setCurrentPage('costs')}
          >
            <i className="fas fa-dollar-sign"></i>
            <span>GCP Costs</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'maintenance' ? 'active' : ''}`}
            onClick={() => setCurrentPage('maintenance')}
          >
            <i className="fas fa-tools"></i>
            <span>Maintenance</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'logs' ? 'active' : ''}`}
            onClick={() => setCurrentPage('logs')}
          >
            <i className="fas fa-file-alt"></i>
            <span>Logs</span>
          </button>
          <button
            className={`nav-link ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            <i className="fas fa-cog"></i>
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">KN</div>
            <div className="user-details">
              <div className="user-name">kaznightfury</div>
              <div className="user-role">Broadcaster</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {currentPage === 'dashboard' && <DashboardPage stats={stats} clips={clips} loading={loading} botStatus={botStatus} botLoading={botLoading} onBotToggle={handleBotToggle} onBotRestart={handleBotRestart} />}
        {currentPage === 'quick-clips' && <QuickClipsPage options={quickClipOptions} setOptions={setQuickClipOptions} />}
          {currentPage === 'clips' && (
            <ClipsPage
              clips={filteredClips}
              loading={loading}
              onDelete={handleDeleteClip}
              onDownload={handleDownloadClip}
              onEdit={openEditor}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              resolutionFilter={resolutionFilter}
              setResolutionFilter={setResolutionFilter}
              directionFilter={directionFilter}
              setDirectionFilter={setDirectionFilter}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              selectMode={selectMode}
              selectedClips={selectedClips}
              onToggleSelectMode={toggleSelectMode}
              onToggleClipSelection={toggleClipSelection}
              onSelectAll={selectAllClips}
              onBulkDelete={handleBulkDelete}
            />
          )}
        {currentPage === 'edited-clips' && <EditedClipsPage />}
        {currentPage === 'commands' && <CommandsPage />}
        {currentPage === 'queue' && <QueuePage queueData={queueData} wsConnected={wsConnected} onRefresh={() => {/* WebSocket auto-refreshes, no action needed */}} />}
        {currentPage === 'costs' && <CostsPage />}
        {currentPage === 'maintenance' && <MaintenancePage />}
        {currentPage === 'logs' && <LogsPage logs={logs} loading={logsLoading} logLevelFilter={logLevelFilter} setLogLevelFilter={setLogLevelFilter} onRefresh={loadLogs} />}
        {currentPage === 'settings' && <SettingsPage />}
      </main>

      {/* Clip Editor Modal */}
      {showEditor && selectedClip && (
        <ClipEditorModal clip={selectedClip} onClose={closeEditor} />
      )}
    </div>
  );
}

// Dashboard Page
function DashboardPage({ stats, clips, loading, botStatus, botLoading, onBotToggle, onBotRestart }) {
  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>Dashboard</h2>
            <p>Overview of your FuryClips bot</p>
          </div>
          <div className="header-actions">
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: botStatus === 'running' ? '#d1fae5' : '#fee2e2',
                color: botStatus === 'running' ? '#065f46' : '#991b1b',
                fontWeight: '600',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: botStatus === 'running' ? '#10b981' : '#ef4444'
                }}></div>
                Bot {botStatus === 'running' ? 'Running' : botStatus === 'stopped' ? 'Stopped' : 'Unknown'}
              </div>
              <button
                className={botStatus === 'running' ? 'btn btn-danger' : 'btn btn-success'}
                onClick={onBotToggle}
                disabled={botLoading}
                style={{ minWidth: '120px' }}
              >
                <i className={`fas fa-${botStatus === 'running' ? 'stop' : 'play'}`}></i>
                <span>{botLoading ? 'Loading...' : botStatus === 'running' ? 'Stop Bot' : 'Start Bot'}</span>
              </button>
              <button
                className="btn btn-primary"
                onClick={onBotRestart}
                disabled={botLoading}
              >
                <i className="fas fa-sync-alt"></i>
                <span>Restart</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Total Clips</div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{stats?.total_clips || 0}</div>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '20px'
            }}>
              <i className="fas fa-photo-video"></i>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Ready Clips</div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{stats?.by_status?.ready || 0}</div>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '20px'
            }}>
              <i className="fas fa-check-circle"></i>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Failed</div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{stats?.by_status?.failed || 0}</div>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '20px'
            }}>
              <i className="fas fa-times-circle"></i>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Total Hours</div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{stats?.total_duration_hours || 0}h</div>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '20px'
            }}>
              <i className="fas fa-clock"></i>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 40px 40px' }}>
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700' }}>Recent Clips</h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            {clips.slice(0, 5).map(clip => (
              <div key={clip.clip_id} style={{
                padding: '16px',
                background: '#f8fafc',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>{clip.clip_id.substring(0, 8)}</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {clip.duration}s • {clip.resolution} • {clip.direction}
                  </div>
                </div>
                <span style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  background: clip.status === 'ready' ? '#d1fae5' : clip.status === 'failed' ? '#fee2e2' : '#fef3c7',
                  color: clip.status === 'ready' ? '#065f46' : clip.status === 'failed' ? '#991b1b' : '#92400e'
                }}>
                  {clip.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick Clips Page
function QuickClipsPage({ options, setOptions }) {
  const [isCreating, setIsCreating] = React.useState(false);
  const durations = ['30s', '1m', '5m', '10m', '15m', '30m'];
  const resolutions = ['480p', '720p', '1080p'];
  const directions = ['past', 'future'];

  const handleCreateClip = async () => {
    setIsCreating(true);
    try {
      const response = await createQuickClip(
        options.duration,
        options.resolution,
        options.direction
      );
      
      if (response.success) {
        alert(`✅ Success!\n\n${response.message}\n\nClip ID: ${response.clip_id.substring(0, 8)}\n\nYour clip is being processed. Check the Clips Library in a moment!`);
      } else {
        alert(`❌ Failed to create clip:\n\n${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating clip:', error);
      alert(`❌ Failed to create clip:\n\n${error.response?.data?.detail || error.message || 'Network error. Please check if the bot is running.'}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>Quick Clips</h2>
            <p>Create clips instantly with preset options</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '40px' }}>
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '24px', fontSize: '18px', fontWeight: '700' }}>Duration</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            {durations.map(duration => (
              <div
                key={duration}
                className={`option-card ${options.duration === duration ? 'selected' : ''}`}
                onClick={() => setOptions({...options, duration})}
              >
                <div style={{ fontSize: '24px', fontWeight: '800', marginBottom: '4px' }}>{duration}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Duration</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '24px', fontSize: '18px', fontWeight: '700' }}>Resolution</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            {resolutions.map(resolution => (
              <div
                key={resolution}
                className={`option-card ${options.resolution === resolution ? 'selected' : ''}`}
                onClick={() => setOptions({...options, resolution})}
              >
                <div style={{ fontSize: '24px', fontWeight: '800', marginBottom: '4px' }}>{resolution}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Quality</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '24px', fontSize: '18px', fontWeight: '700' }}>Direction</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {directions.map(direction => (
              <div
                key={direction}
                className={`option-card ${options.direction === direction ? 'selected' : ''}`}
                onClick={() => setOptions({...options, direction})}
              >
                <i className={`fas ${direction === 'past' ? 'fa-history' : 'fa-forward'}`} style={{ fontSize: '32px', marginBottom: '12px', color: '#8b5cf6' }}></i>
                <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px', textTransform: 'capitalize' }}>{direction}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  {direction === 'past' ? 'Capture what just happened' : 'Record what happens next'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.9 }}>Selected Options</div>
              <div style={{ fontSize: '24px', fontWeight: '800' }}>
                {options.duration} • {options.resolution} • {options.direction}
              </div>
            </div>
            <button
              className="btn btn-success"
              onClick={handleCreateClip}
              disabled={isCreating}
              style={{
                background: 'white',
                color: '#8b5cf6',
                fontWeight: '700',
                opacity: isCreating ? 0.6 : 1,
                cursor: isCreating ? 'not-allowed' : 'pointer'
              }}
            >
              <i className={`fas ${isCreating ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
              <span>{isCreating ? 'Creating...' : 'Create Clip Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Clips Library Page with Filters
function ClipsPage({
  clips,
  loading,
  onDelete,
  onDownload,
  onEdit,
  statusFilter,
  setStatusFilter,
  resolutionFilter,
  setResolutionFilter,
  directionFilter,
  setDirectionFilter,
  sortOrder,
  setSortOrder,
  selectMode,
  selectedClips,
  onToggleSelectMode,
  onToggleClipSelection,
  onSelectAll,
  onBulkDelete
}) {
  if (loading) return <div className="loading">Loading clips...</div>;

  const allSelected = clips.length > 0 && selectedClips.length === clips.length;

  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>Clips Library</h2>
            <p>View and manage all your clips</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {selectMode && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={onSelectAll}
                  style={{ fontSize: '14px' }}
                >
                  <i className={`fas ${allSelected ? 'fa-check-square' : 'fa-square'}`}></i>
                  <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                </button>
                <button
                  className="btn btn-danger"
                  onClick={onBulkDelete}
                  disabled={selectedClips.length === 0}
                  style={{
                    fontSize: '14px',
                    opacity: selectedClips.length === 0 ? 0.5 : 1,
                    cursor: selectedClips.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <i className="fas fa-trash"></i>
                  <span>Delete Selected ({selectedClips.length})</span>
                </button>
              </>
            )}
            <button
              className={`btn ${selectMode ? 'btn-secondary' : 'btn-primary'}`}
              onClick={onToggleSelectMode}
              style={{ fontSize: '14px' }}
            >
              <i className={`fas ${selectMode ? 'fa-times' : 'fa-check-square'}`}></i>
              <span>{selectMode ? 'Cancel' : 'Select'}</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '40px' }}>
        {/* Filters */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700' }}>Filters & Sorting</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="ready">Ready</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>Resolution</label>
                <select
                  value={resolutionFilter}
                  onChange={(e) => setResolutionFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Resolutions</option>
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>Direction</label>
                <select
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Directions</option>
                  <option value="past">Past</option>
                  <option value="future">Future</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                  <i className="fas fa-sort" style={{ marginRight: '6px', color: '#6366f1' }}></i>
                  Sort By Date
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>
          </div>

        {/* Clips Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {clips.map(clip => (
            <div
              key={clip.clip_id}
              className="card"
              style={{
                position: 'relative',
                border: selectedClips.includes(clip.clip_id) ? '3px solid #3b82f6' : undefined,
                cursor: selectMode ? 'pointer' : 'default'
              }}
              onClick={() => selectMode && onToggleClipSelection(clip.clip_id)}
            >
              {selectMode && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: selectedClips.includes(clip.clip_id) ? '#3b82f6' : 'white',
                  border: '2px solid ' + (selectedClips.includes(clip.clip_id) ? '#3b82f6' : '#cbd5e1'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: selectedClips.includes(clip.clip_id) ? 'white' : '#64748b',
                  fontSize: '16px',
                  zIndex: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}>
                  {selectedClips.includes(clip.clip_id) && <i className="fas fa-check"></i>}
                </div>
              )}

              <div style={{
                width: '100%',
                height: '180px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '48px'
              }}>
                <i className="fas fa-play-circle"></i>
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: '700', marginBottom: '4px' }}>Clip {clip.clip_id.substring(0, 8)}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  {clip.duration}s • {clip.resolution} • {clip.direction}
                </div>
                {clip.stream_title && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    {clip.stream_title.substring(0, 30)}{clip.stream_title.length > 30 ? '...' : ''}
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px',
                flexWrap: 'wrap'
              }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  background: clip.status === 'ready' ? '#d1fae5' : clip.status === 'failed' ? '#fee2e2' : '#fef3c7',
                  color: clip.status === 'ready' ? '#065f46' : clip.status === 'failed' ? '#991b1b' : '#92400e'
                }}>
                  {clip.status}
                </span>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  background: '#e0e7ff',
                  color: '#3730a3'
                }}>
                  {clip.created_by}
                </span>
              </div>

              {!selectMode && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '8px 16px', fontSize: '13px' }}
                    onClick={(e) => { e.stopPropagation(); onDownload(clip.clip_id); }}
                    disabled={clip.status !== 'ready'}
                  >
                    <i className="fas fa-download"></i>
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '8px 16px', fontSize: '13px' }}
                    onClick={(e) => { e.stopPropagation(); onEdit(clip); }}
                    disabled={clip.status !== 'ready'}
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1, padding: '8px 16px', fontSize: '13px' }}
                    onClick={(e) => { e.stopPropagation(); onDelete(clip.clip_id); }}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {clips.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
            <i className="fas fa-photo-video" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px' }}></i>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b' }}>No clips found</div>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>Try adjusting your filters or create a new clip!</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Edited Clips Page
function EditedClipsPage() {
  const [editedClips, setEditedClips] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedClips, setSelectedClips] = React.useState([]);

  React.useEffect(() => {
    loadEditedClips();
  }, []);

  const loadEditedClips = async () => {
    setLoading(true);
    try {
      const data = await getEditedClips('kaznightfury');
      setEditedClips(data.clips || []);
    } catch (error) {
      console.error('Error loading edited clips:', error);
    }
    setLoading(false);
  };

  const handleDownload = async (clipId) => {
    try {
      const data = await getDownloadUrl(clipId);
      window.open(data.download_url, '_blank');
    } catch (error) {
      alert('Failed to get download URL: ' + error.message);
    }
  };

  const handleDelete = async (clipId) => {
    if (window.confirm('Are you sure you want to delete this edited clip?')) {
      try {
        await fetch(`http://localhost:8000/api/clips/edited/${clipId}`, {
          method: 'DELETE'
        });
        alert('Edited clip deleted successfully!');
        loadEditedClips();
      } catch (error) {
        alert('Failed to delete clip: ' + error.message);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedClips.length === 0) {
      alert('Please select at least one clip to delete');
      return;
    }

    const confirmMessage = `Are you sure you want to delete ${selectedClips.length} edited clip(s)? This will permanently delete them from cloud storage.`;
    if (window.confirm(confirmMessage)) {
      try {
        await bulkDeleteEditedClips(selectedClips);
        alert(`${selectedClips.length} edited clip(s) deleted successfully!`);
        setSelectedClips([]);
        setSelectMode(false);
        loadEditedClips();
      } catch (error) {
        alert('Failed to delete clips: ' + error.message);
      }
    }
  };

  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedClips([]);
  };
    
    // This function is for individual delete (not in the provided code, remove it if it's a duplicate)
    // The handleDelete function above already handles individual deletes

  const toggleClipSelection = (clipId) => {
    setSelectedClips(prev => {
      if (prev.includes(clipId)) {
        return prev.filter(id => id !== clipId);
      } else {
        return [...prev, clipId];
      }
    });
  };

  const selectAllClips = () => {
    if (selectedClips.length === editedClips.length) {
      setSelectedClips([]);
    } else {
      setSelectedClips(editedClips.map(clip => clip.clip_id));
    }
  };

  if (loading) return <div className="loading">Loading edited clips...</div>;

  const allSelected = editedClips.length > 0 && selectedClips.length === editedClips.length;

  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>Edited Clips</h2>
            <p>View and manage your edited clips</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {selectMode && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={selectAllClips}
                  style={{ fontSize: '14px' }}
                >
                  <i className={`fas ${allSelected ? 'fa-check-square' : 'fa-square'}`}></i>
                  <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleBulkDelete}
                  disabled={selectedClips.length === 0}
                  style={{
                    fontSize: '14px',
                    opacity: selectedClips.length === 0 ? 0.5 : 1,
                    cursor: selectedClips.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <i className="fas fa-trash"></i>
                  <span>Delete Selected ({selectedClips.length})</span>
                </button>
              </>
            )}
            <button
              className={`btn ${selectMode ? 'btn-secondary' : 'btn-primary'}`}
              onClick={toggleSelectMode}
              style={{ fontSize: '14px' }}
            >
              <i className={`fas ${selectMode ? 'fa-times' : 'fa-check-square'}`}></i>
              <span>{selectMode ? 'Cancel' : 'Select'}</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '40px' }}>
        {editedClips.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
            <i className="fas fa-cut" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px' }}></i>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b' }}>No edited clips yet</div>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>
              Edit clips from the Clips Library to see them here!
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
            {editedClips.map(clip => (
              <div
                key={clip.clip_id}
                className="card"
                style={{
                  position: 'relative',
                  border: selectedClips.includes(clip.clip_id) ? '3px solid #3b82f6' : undefined,
                  cursor: selectMode ? 'pointer' : 'default'
                }}
                onClick={() => selectMode && toggleClipSelection(clip.clip_id)}
              >
                {selectMode && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    background: selectedClips.includes(clip.clip_id) ? '#3b82f6' : 'white',
                    border: '2px solid ' + (selectedClips.includes(clip.clip_id) ? '#3b82f6' : '#cbd5e1'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: selectedClips.includes(clip.clip_id) ? 'white' : '#64748b',
                    fontSize: '16px',
                    zIndex: 10,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}>
                    {selectedClips.includes(clip.clip_id) && <i className="fas fa-check"></i>}
                  </div>
                )}

                <div style={{
                  width: '100%',
                  height: '180px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  borderRadius: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '48px'
                }}>
                  <i className="fas fa-cut"></i>
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>
                    Edited Clip {clip.clip_id.substring(0, 8)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {clip.duration}s • {clip.resolution} • {clip.direction}
                  </div>
                  {clip.edit_type && (
                    <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px', fontWeight: '600' }}>
                      <i className="fas fa-check-circle"></i> {clip.edit_type}
                    </div>
                  )}
                  {clip.trim_start && clip.trim_end && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      Trimmed: {clip.trim_start} → {clip.trim_end}
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '12px',
                  flexWrap: 'wrap'
                }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: '#d1fae5',
                    color: '#065f46'
                  }}>
                    {clip.status}
                  </span>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: '#e0e7ff',
                    color: '#3730a3'
                  }}>
                    {clip.created_by}
                  </span>
                </div>

                {!selectMode && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '8px 16px', fontSize: '13px' }}
                      onClick={(e) => { e.stopPropagation(); handleDownload(clip.clip_id); }}
                    >
                      <i className="fas fa-download"></i>
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ flex: 1, padding: '8px 16px', fontSize: '13px' }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(clip.clip_id); }}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Commands Page
function CommandsPage() {
  const commands = [
    { cmd: '!fury 30s 720p past', desc: 'Capture last 30 seconds in 720p' },
    { cmd: '!fury 1m 1080p future', desc: 'Record next 1 minute in 1080p' },
    { cmd: '!fury 5m 480p past', desc: 'Capture last 5 minutes in 480p' },
    { cmd: '!furyhelp', desc: 'Show help message' }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>Bot Commands</h2>
            <p>Learn how to use FuryClips in your Twitch chat</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '40px' }}>
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700' }}>Command Format</h3>
          <div style={{
            background: '#f1f5f9',
            padding: '16px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: '600'
          }}>
            !fury &lt;duration&gt; &lt;resolution&gt; &lt;direction&gt;
          </div>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700' }}>Examples</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {commands.map((cmd, idx) => (
              <div key={idx} style={{
                padding: '16px',
                background: '#f8fafc',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', marginBottom: '4px' }}>{cmd.cmd}</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{cmd.desc}</div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                  onClick={() => {
                    navigator.clipboard.writeText(cmd.cmd);
                    alert('Copied to clipboard!');
                  }}
                >
                  <i className="fas fa-copy"></i>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ background: '#fef3c7', border: '2px solid #fbbf24' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'start' }}>
            <i className="fas fa-shield-alt" style={{ fontSize: '32px', color: '#92400e' }}></i>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#92400e', marginBottom: '8px' }}>
                Permissions Required
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, fontSize: '14px', color: '#92400e' }}>
                <li style={{ marginBottom: '4px' }}>
                  <i className="fas fa-check" style={{ color: '#16a34a' }}></i> <strong>Broadcaster</strong> (Channel owner)
                </li>
                <li>
                  <i className="fas fa-check" style={{ color: '#16a34a' }}></i> <strong>Moderators</strong>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Queue Page with checkboxes and bulk delete
function QueuePage({ queueData, wsConnected, onRefresh }) {
  const [selectedClips, setSelectedClips] = React.useState([]);
  const [deleting, setDeleting] = React.useState(false);
  const [loading, setLoading] = React.useState(!queueData);
  const [error, setError] = React.useState(null);

  // Update loading state when queueData changes
  React.useEffect(() => {
    if (queueData) {
      setLoading(false);
    }
  }, [queueData]);

  const loadQueueStatus = async () => {
    // WebSocket handles all updates automatically
    // This is just for the "Refresh Now" button to give immediate feedback
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  };

  const handleSelectClip = (clipId) => {
    setSelectedClips(prev =>
      prev.includes(clipId)
        ? prev.filter(id => id !== clipId)
        : [...prev, clipId]
    );
  };

  const handleSelectAll = () => {
    if (!queueData) return;
    
    const allClipIds = [];
    if (queueData.current_processing) {
      allClipIds.push(queueData.current_processing.clip_id);
    }
    queueData.queue.forEach(item => allClipIds.push(item.clip_id));
    
    if (selectedClips.length === allClipIds.length) {
      setSelectedClips([]);
    } else {
      setSelectedClips(allClipIds);
    }
  };

    const handleDeleteSelected = async () => {
      if (selectedClips.length === 0) {
        alert('Please select at least one clip to delete');
        return;
      }

      if (!window.confirm(`Are you sure you want to cancel ${selectedClips.length} clip(s)?`)) {
        return;
      }

      setDeleting(true);
      try {
        const response = await cancelMultipleClips(selectedClips);
        
        // Show success notification
        const successMsg = document.createElement('div');
        successMsg.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
          z-index: 10000;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 12px;
        `;
        successMsg.innerHTML = `
          <i class="fas fa-check-circle"></i>
          <span>${response.message}</span>
        `;
        document.body.appendChild(successMsg);
        
        setTimeout(() => {
          successMsg.style.transition = 'opacity 0.3s';
          successMsg.style.opacity = '0';
          setTimeout(() => successMsg.remove(), 300);
        }, 3000);
        
        setSelectedClips([]);
        // No need to reload - WebSocket will update automatically
        
      } catch (err) {
        alert('Failed to cancel clips: ' + (err.response?.data?.detail || err.message));
      } finally {
        setDeleting(false);
      }
    };

  // Initial load only - WebSocket handles updates
  React.useEffect(() => {
    if (!queueData) {
      loadQueueStatus();
    }
  }, []);

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div className="header-content">
            <div className="header-title">
              <h2>Queue Monitor</h2>
              <p>Track clip processing queue and status {wsConnected && <span style={{ color: '#10b981', marginLeft: '8px' }}>● Live</span>}</p>
            </div>
          </div>
        </div>
        <div style={{ padding: '40px' }}>
          <div className="loading">Loading queue status...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="page-header">
          <div className="header-content">
            <div className="header-title">
              <h2>Queue Monitor</h2>
              <p>Track clip processing queue</p>
            </div>
            <div className="header-actions">
              <button className="btn btn-primary" onClick={loadQueueStatus}>
                <i className="fas fa-sync-alt"></i>
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
        <div style={{ padding: '40px' }}>
          <div className="card" style={{ background: '#fee2e2', border: '2px solid #ef4444', padding: '24px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'start' }}>
              <i className="fas fa-exclamation-circle" style={{ fontSize: '32px', color: '#991b1b' }}></i>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#991b1b', marginBottom: '8px' }}>
                  Error Loading Queue
                </h4>
                <p style={{ fontSize: '14px', color: '#991b1b' }}>{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const queueSize = queueData?.queue_size || 0;
  const maxQueueSize = queueData?.max_queue_size || 10;
  const processingClip = queueData?.current_processing;
  const queueItems = queueData?.queue || [];
  const recentlyCompleted = queueData?.recently_completed || [];
  const hasItems = processingClip || queueItems.length > 0;
  
  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>Queue Monitor</h2>
            <p>Track clip processing queue and status</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {hasItems && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={handleSelectAll}
                  style={{ background: '#6366f1' }}
                >
                  <i className="fas fa-check-square"></i>
                  <span>{selectedClips.length === (queueItems.length + (processingClip ? 1 : 0)) ? 'Deselect All' : 'Select All'}</span>
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleDeleteSelected}
                  disabled={selectedClips.length === 0 || deleting}
                  style={{ opacity: selectedClips.length === 0 ? 0.5 : 1 }}
                >
                  <i className={`fas ${deleting ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                  <span>{deleting ? 'Cancelling...' : `Cancel Selected (${selectedClips.length})`}</span>
                </button>
              </>
            )}
            <div style={{
              padding: '12px 20px',
              borderRadius: '12px',
              background: '#ede9fe',
              color: '#6d28d9',
              fontWeight: '700',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#8b5cf6'
              }}></span>
              {queueSize} / {maxQueueSize} in Queue
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '40px' }}>
        {/* Currently Processing */}
        {processingClip && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{
              marginBottom: '16px',
              fontSize: '18px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <i className="fas fa-spinner fa-spin" style={{ color: '#8b5cf6' }}></i>
              Currently Processing
            </h3>
            
            <div className="card" style={{ background: '#faf5ff', border: '2px solid #e9d5ff' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'start' }}>
                <input
                  type="checkbox"
                  checked={selectedClips.includes(processingClip.clip_id)}
                  onChange={() => handleSelectClip(processingClip.clip_id)}
                  style={{
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer',
                    marginTop: '4px'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>
                          Clip #{processingClip.clip_id?.substring(0, 8) || 'Unknown'}
                        </span>
                      </div>
                      <span style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        background: '#fbbf24',
                        color: '#78350f',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <i className="fas fa-cog fa-spin"></i>
                        {processingClip.stage === 'starting' ? 'Starting...' :
                         processingClip.stage === 'recording' ? 'Recording' :
                         processingClip.stage === 'encoding' ? 'Encoding' :
                         processingClip.stage === 'uploading' ? 'Uploading' :
                         'Processing'}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      {processingClip.duration || '1m'} • {processingClip.resolution || '720p'} • {processingClip.direction || 'past'} • @{processingClip.username || 'Unknown'}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: '#e9d5ff',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${processingClip.progress || 65}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                        transition: 'width 0.3s ease'
                      }}></div>
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {processingClip.progress || 65}% complete • ETA: {processingClip.eta || '45'} seconds
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Waiting in Queue */}
        {queueItems.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{
              marginBottom: '16px',
              fontSize: '18px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <i className="fas fa-list" style={{ color: '#8b5cf6' }}></i>
              Waiting in Queue
            </h3>
            
            <div style={{ display: 'grid', gap: '12px' }}>
              {queueItems.map((item, index) => (
                <div key={item.clip_id || index} className="card" style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 80px 1fr auto',
                  gap: '16px',
                  alignItems: 'center',
                  padding: '20px'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedClips.includes(item.clip_id)}
                    onChange={() => handleSelectClip(item.clip_id)}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer'
                    }}
                  />
                  
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: '800',
                    fontSize: '24px'
                  }}>
                    #{index + 1}
                  </div>
                  
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px' }}>
                      Clip #{item.clip_id?.substring(0, 8) || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>
                      {item.duration || '30s'} • {item.resolution || '1080p'} • {item.direction || 'past'} • @{item.username || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                      ETA: {item.eta || '1m 30s'}
                    </div>
                  </div>

                  <span style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    background: '#dbeafe',
                    color: '#1e40af'
                  }}>
                    Queued
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently Completed */}
        {recentlyCompleted.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{
              marginBottom: '16px',
              fontSize: '18px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
              Recently Completed
            </h3>
            
            <div className="card" style={{ background: '#f0fdf4', border: '2px solid #86efac' }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                {recentlyCompleted.map((item, index) => (
                  <div key={item.clip_id || index} style={{
                    padding: '16px',
                    background: 'white',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: '700', marginBottom: '4px' }}>
                        Clip #{item.clip_id?.substring(0, 8) || 'Unknown'}
                      </div>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>
                        {item.duration || '1m'} • {item.resolution || '720p'} • {item.direction || 'past'} • @{item.username || 'Unknown'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        background: '#d1fae5',
                        color: '#065f46'
                      }}>
                        Completed
                      </span>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                        {item.completed_at || '2 min ago'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!processingClip && queueItems.length === 0 && recentlyCompleted.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
            <i className="fas fa-inbox" style={{ fontSize: '64px', color: '#cbd5e1', marginBottom: '16px' }}></i>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b' }}>Queue is empty</div>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>
              Create a new clip to see it here!
            </div>
          </div>
        )}

          {/* Connection info */}
          <div className="card" style={{ background: wsConnected ? '#d1fae5' : '#fee2e2', border: wsConnected ? '2px solid #10b981' : '2px solid #ef4444' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <i className={`fas ${wsConnected ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ fontSize: '20px', color: wsConnected ? '#065f46' : '#991b1b' }}></i>
                <div style={{ fontSize: '14px', color: wsConnected ? '#065f46' : '#991b1b' }}>
                  <strong>{wsConnected ? 'Live Updates Active' : 'Reconnecting...'}</strong> {wsConnected && '• Real-time queue monitoring'}
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={loadQueueStatus}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                <i className="fas fa-sync-alt"></i>
                <span>Refresh Now</span>
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}


// GCP Costs Page
function CostsPage() {
  const costs = [
    { service: 'Compute (e2-small)', monthly: '$13.00', description: 'VM instance hosting the bot' },
    { service: 'Cloud Storage', monthly: '$0.20', description: '~10GB clip storage' },
    { service: 'Firestore', monthly: '$0.00', description: 'Within free tier limits' },
    { service: 'Bandwidth', monthly: '$0.60', description: '~5GB egress per month' },
    { service: 'Domain (furyclips.com)', monthly: '$1.25', description: 'Annual cost divided by 12' }
  ];

  const totalMonthlyCost = costs.reduce((sum, item) => sum + parseFloat(item.monthly.replace('$', '')), 0);

  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>GCP Costs</h2>
            <p>Monitor your Google Cloud Platform spending</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '40px' }}>
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>Estimated Monthly Cost</div>
                <div style={{ fontSize: '40px', fontWeight: '800', color: '#0f172a' }}>${totalMonthlyCost.toFixed(2)}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>~${(totalMonthlyCost * 12).toFixed(2)}/year</div>
              </div>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '24px'
              }}>
                <i className="fas fa-dollar-sign"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700' }}>Cost Breakdown</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {costs.map((item, idx) => (
              <div key={idx} style={{
                padding: '16px',
                background: '#f8fafc',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>{item.service}</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{item.description}</div>
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{item.monthly}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: '24px', background: '#dbeafe', border: '2px solid #3b82f6' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'start' }}>
            <i className="fas fa-info-circle" style={{ fontSize: '32px', color: '#1e40af' }}></i>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e40af', marginBottom: '8px' }}>
                Cost Optimization Tips
              </h4>
              <ul style={{ fontSize: '14px', color: '#1e40af', paddingLeft: '20px' }}>
                <li>GCP free tier ($300 credit) lasts 12 months for new accounts</li>
                <li>Storage costs increase as you create more clips (~$0.023/GB/month)</li>
                <li>Consider deleting old clips to reduce storage costs</li>
                <li>e2-micro instance is free but may be slower for clip processing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

    // Maintenance Page
    function MaintenancePage() {
      const [loading, setLoading] = React.useState({
        buffer: false,
        logs: false,
        temp: false
      });

      const handleClearBuffer = async () => {
        if (window.confirm('Are you sure you want to clear the buffer cache? This will delete all buffered segments except the most recent one.')) {
          setLoading(prev => ({ ...prev, buffer: true }));
          try {
            const result = await clearBufferCache();
            alert(`${result.message}\n\nFiles deleted: ${result.files_deleted}\n Space freed: ${result.space_freed_mb}MB`);
          } catch (error) {
            alert('Failed to clear buffer cache: ' + error.message);
          } finally {
            setLoading(prev => ({ ...prev, buffer: false }));
          }
        }
      };

      const handleClearLogs = async () => {
        if (window.confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
          setLoading(prev => ({ ...prev, logs: true }));
          try {
            const result = await clearSystemLogs();
            alert(`${result.message}\n\n Files deleted: ${result.files_deleted}\n Space freed: ${result.space_freed_mb}MB`);
          } catch (error) {
            alert('Failed to clear logs: ' + error.message);
          } finally {
            setLoading(prev => ({ ...prev, logs: false }));
          }
        }
      };

      const handleClearTemp = async () => {
        if (window.confirm('Are you sure you want to clear temporary files?')) {
          setLoading(prev => ({ ...prev, temp: true }));
          try {
            const result = await clearTempFiles();
            alert(`${result.message}\n\n Files deleted: ${result.files_deleted}\n Space freed: ${result.space_freed_mb}MB\n Files skipped: ${result.files_skipped} (currently in use)`);
          } catch (error) {
            alert('Failed to clear temporary files: ' + error.message);
          } finally {
            setLoading(prev => ({ ...prev, temp: false }));
          }
        }
      };

      return (
        <div>
          <div className="page-header">
            <div className="header-content">
              <div className="header-title">
                <h2>Maintenance</h2>
                <p>System maintenance and cleanup tools</p>
              </div>
            </div>
          </div>

          <div style={{ padding: '40px' }}>
            <div style={{ display: 'grid', gap: '24px' }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
                      <i className="fas fa-database" style={{ color: '#8b5cf6', marginRight: '12px' }}></i>
                      Clear Buffer Cache
                    </h3>
                    <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                      Remove all buffered stream segments except the most recent one. The buffer will automatically rebuild.
                    </p>
                    <button
                      className="btn btn-danger"
                      onClick={handleClearBuffer}
                      disabled={loading.buffer}
                      style={{ opacity: loading.buffer ? 0.6 : 1 }}
                    >
                      <i className={`fas ${loading.buffer ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                      <span>{loading.buffer ? 'Clearing...' : 'Clear Buffer'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
                      <i className="fas fa-file-alt" style={{ color: '#f59e0b', marginRight: '12px' }}></i>
                      Clear System Logs
                    </h3>
                    <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                      Delete all system logs. This cannot be undone.
                    </p>
                    <button
                      className="btn btn-danger"
                      onClick={handleClearLogs}
                      disabled={loading.logs}
                      style={{ opacity: loading.logs ? 0.6 : 1 }}
                    >
                      <i className={`fas ${loading.logs ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                      <span>{loading.logs ? 'Clearing...' : 'Clear Logs'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
                      <i className="fas fa-folder" style={{ color: '#3b82f6', marginRight: '12px' }}></i>
                      Clear Temporary Files
                    </h3>
                    <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                      Remove temporary processing files to free up disk space. Files currently being processed will be skipped.
                    </p>
                    <button
                      className="btn btn-danger"
                      onClick={handleClearTemp}
                      disabled={loading.temp}
                      style={{ opacity: loading.temp ? 0.6 : 1 }}
                    >
                      <i className={`fas ${loading.temp ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                      <span>{loading.temp ? 'Clearing...' : 'Clear Temp Files'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="card" style={{ background: '#fee2e2', border: '2px solid #ef4444' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'start' }}>
                  <i className="fas fa-exclamation-triangle" style={{ fontSize: '32px', color: '#991b1b' }}></i>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#991b1b', marginBottom: '8px' }}>
                      Warning
                    </h4>
                    <p style={{ fontSize: '14px', color: '#991b1b' }}>
                      These maintenance operations affect the running bot. Some actions cannot be undone. Use with caution.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

// Settings Page
function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>Settings</h2>
            <p>Configure your FuryClips bot</p>
          </div>
        </div>
      </div>
      <div style={{ padding: '40px' }}>
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700' }}>Bot Configuration</h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>Twitch Channel</label>
              <input
                type="text"
                value="kaznightfury"
                readOnly
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>Bot Username</label>
              <input
                type="text"
                value="furyclipsbot"
                readOnly
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Logs Page
function LogsPage({ logs, loading, logLevelFilter, setLogLevelFilter, onRefresh }) {
  const getLevelColor = (level) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return '#dc2626';
      case 'WARNING': return '#f59e0b';
      case 'INFO': return '#3b82f6';
      case 'DEBUG': return '#8b5cf6';
      default: return '#64748b';
    }
  };

  const getLevelBgColor = (level) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return '#fee2e2';
      case 'WARNING': return '#fef3c7';
      case 'INFO': return '#dbeafe';
      case 'DEBUG': return '#ede9fe';
      default: return '#f1f5f9';
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <h2>System Logs</h2>
            <p>Real-time log monitoring (last 100 entries)</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-primary" onClick={onRefresh} disabled={loading}>
              <i className="fas fa-sync-alt"></i>
              <span>{loading ? 'Loading...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 40px 40px 40px' }}>
        {/* Filters */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', fontSize: '14px' }}>Filter by Level:</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['all', 'INFO', 'WARNING', 'ERROR', 'DEBUG'].map(level => (
                <button
                  key={level}
                  onClick={() => setLogLevelFilter(level)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: logLevelFilter === level ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: logLevelFilter === level ? '#f0f1ff' : 'white',
                    color: logLevelFilter === level ? '#6366f1' : '#475569',
                    fontWeight: logLevelFilter === level ? '600' : '500',
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {level.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b' }}>
              <i className="fas fa-circle" style={{
                fontSize: '8px',
                marginRight: '6px',
                color: '#10b981',
                animation: 'pulse 2s infinite'
              }}></i>
              Auto-refreshing every 5s
            </div>
          </div>
        </div>

        {/* Logs Display */}
        <div className="card">
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px', marginBottom: '12px' }}></i>
              <div>Loading logs...</div>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <i className="fas fa-inbox" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No logs found</div>
              <div style={{ fontSize: '14px' }}>Logs will appear here once the bot starts generating them</div>
            </div>
          ) : (
            <div style={{
              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
              fontSize: '13px',
              maxHeight: '70vh',
              overflowY: 'auto'
            }}>
              {logs.map((log, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px 16px',
                    borderBottom: index < logs.length - 1 ? '1px solid #f1f5f9' : 'none',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'start',
                    transition: 'background 0.2s',
                    '&:hover': {
                      background: '#f8fafc'
                    }
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Timestamp */}
                  <span style={{
                    color: '#94a3b8',
                    minWidth: '160px',
                    flexShrink: 0
                  }}>
                    {log.timestamp}
                  </span>

                  {/* Level Badge */}
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '700',
                    letterSpacing: '0.5px',
                    color: getLevelColor(log.level),
                    background: getLevelBgColor(log.level),
                    minWidth: '70px',
                    textAlign: 'center',
                    flexShrink: 0
                  }}>
                    {log.level}
                  </span>

                  {/* Module */}
                  <span style={{
                    color: '#64748b',
                    minWidth: '180px',
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }} title={log.module}>
                    {log.module}
                  </span>

                  {/* Message */}
                  <span style={{
                    color: '#0f172a',
                    flex: 1,
                    wordBreak: 'break-word'
                  }}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Log count */}
        {logs.length > 0 && (
          <div style={{
            marginTop: '16px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#64748b'
          }}>
            Showing {logs.length} log {logs.length === 1 ? 'entry' : 'entries'}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
