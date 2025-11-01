import axios from 'axios';

// Use ngrok URL to connect to Dell PC server
const API_BASE_URL = 'https://api.furyclips.com';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'FuryClipsClient/1.0',
    'ngrok-skip-browser-warning': '69420'
  },
});

export const getClips = async (channel = null, status = null, limit = 50) => {
  const params = {};
  if (channel) params.channel = channel;
  if (status) params.status = status;
  params.limit = limit;
  
  const response = await api.get('/api/clips/', { params });
  return response.data;
};

export const getClip = async (clipId) => {
  const response = await api.get(`/api/clips/${clipId}`);
  return response.data;
};

export const deleteClip = async (clipId) => {
  const response = await api.delete(`/api/clips/${clipId}`);
  return response.data;
};

export const bulkDeleteClips = async (clipIds) => {
  const response = await api.post('/api/clips/bulk-delete', clipIds);
  return response.data;
};

export const bulkDeleteEditedClips = async (clipIds) => {
  const response = await api.post('/api/clips/edited/bulk-delete', clipIds);
  return response.data;
};

export const getStats = async () => {
  const response = await api.get('/api/clips/stats/summary');
  return response.data;
};

export const getDownloadUrl = async (clipId) => {
  const response = await api.get(`/api/clips/${clipId}/download`);
  return response.data;
};

// Bot Control API
export const getBotStatus = async () => {
  const response = await api.get('/api/bot/status');
  return response.data;
};

export const startBot = async () => {
  const response = await api.post('/api/bot/start');
  return response.data;
};

export const stopBot = async () => {
  const response = await api.post('/api/bot/stop');
  return response.data;
};

export const restartBot = async () => {
  const response = await api.post('/api/bot/restart');
  return response.data;
};

// Quick Clip API
export const createQuickClip = async (duration, resolution, direction) => {
  const response = await api.post('/api/quick-clip/create', {
    duration,
    resolution,
    direction
  });
  return response.data;
};

export const getQueueStatus = async () => {
  const response = await api.get('/api/quick-clip/queue-status');
  return response.data;
};

export const cancelClip = async (clipId) => {
  const response = await api.delete(`/api/quick-clip/cancel/${clipId}`);
  return response.data;
};

export const cancelMultipleClips = async (clipIds) => {
  const response = await api.post('/api/quick-clip/cancel-multiple', { clip_ids: clipIds });
  return response.data;
};

export const trimClip = async (clipId, startTime, endTime) => {
  const response = await api.post('/api/clips/trim', {
    clip_id: clipId,
    start_time: startTime,
    end_time: endTime
  });
  return response.data;
};

export const getEditedClips = async (channel = null, limit = 50) => {
  const params = {};
  if (channel) params.channel = channel;
  params.limit = limit;
  
  const response = await api.get('/api/clips/edited/', { params });
  return response.data;
};

export const exportClip = async (clipId, platform, letterbox = true, textOverlays = []) => {
  const response = await api.post('/api/clips/export', {
    clip_id: clipId,
    platform: platform.toLowerCase(),
    letterbox: letterbox,
    text_overlays: textOverlays
  });
  return response.data;
};

// Maintenance API
export const clearBufferCache = async () => {
  const response = await api.post('/api/maintenance/clear-buffer');
  return response.data;
};

export const clearSystemLogs = async () => {
  const response = await api.post('/api/maintenance/clear-logs');
  return response.data;
};

export const clearTempFiles = async () => {
  const response = await api.post('/api/maintenance/clear-temp');
  return response.data;
};

export const getLogs = async (limit = 100, level = null) => {
  const params = { limit: limit.toString() };
  if (level) params.level = level;
  
  const response = await api.get('/api/logs', { params });
  return response.data;
};

export default api;
