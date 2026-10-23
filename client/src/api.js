// Thin wrapper around fetch for the KamalTrack API.
// In dev, Vite proxies /api -> http://localhost:3001 (see vite.config.js).

async function req(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => req('/health'),

  // areas
  getAreas: () => req('/areas'),
  createArea: (data) => req('/areas', { method: 'POST', body: JSON.stringify(data) }),
  deleteArea: (id) => req(`/areas/${id}`, { method: 'DELETE' }),

  // trackers
  getTrackers: (areaId) => req(`/areas/${areaId}/trackers`),
  getTracker: (id) => req(`/trackers/${id}`),
  createTracker: (areaId, data) =>
    req(`/areas/${areaId}/trackers`, { method: 'POST', body: JSON.stringify(data) }),
  deleteTracker: (id) => req(`/trackers/${id}`, { method: 'DELETE' }),

  // entries
  getEntries: (trackerId) => req(`/trackers/${trackerId}/entries`),
  createEntry: (trackerId, data) =>
    req(`/trackers/${trackerId}/entries`, { method: 'POST', body: JSON.stringify(data) }),
  deleteEntry: (id) => req(`/entries/${id}`, { method: 'DELETE' }),

  // items (area-level = not tied to a tracker)
  getItems: (areaId) => req(`/areas/${areaId}/items`),
  createItem: (areaId, data) =>
    req(`/areas/${areaId}/items`, { method: 'POST', body: JSON.stringify(data) }),

  // items (tracker-level)
  getTrackerItems: (trackerId) => req(`/trackers/${trackerId}/items`),
  createTrackerItem: (trackerId, data) =>
    req(`/trackers/${trackerId}/items`, { method: 'POST', body: JSON.stringify(data) }),

  updateItem: (id, data) => req(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteItem: (id) => req(`/items/${id}`, { method: 'DELETE' }),

  // reminders + AI
  dueToday: () => req('/due-today'),
  reflect: () => req('/ai/reflect', { method: 'POST' }),

  // habits (daily Yes/No tracker)
  getHabits: () => req('/habits'),
  createHabit: (data) => req('/habits', { method: 'POST', body: JSON.stringify(data) }),
  deleteHabit: (id) => req(`/habits/${id}`, { method: 'DELETE' }),
  getHabitDay: (date) => req(`/habits/day/${date}`),
  setHabitLog: (id, date, value) =>
    req(`/habits/${id}/log/${date}`, { method: 'PUT', body: JSON.stringify({ value }) }),
};
