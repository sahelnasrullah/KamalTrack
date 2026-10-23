import { useState } from 'react';
import { api } from '../api.js';

/**
 * ItemList renders goals, tasks, and notes with distinct designs:
 *   - Goal: card with an optional purple progress bar (target vs latest value)
 *   - Task: checkbox row, strike-through when done
 *   - Note: warm "sticky note" card, no checkbox
 *
 * Props:
 *   items        array of item objects (goals may include a .progress object)
 *   onChange     called after any create/update/delete to reload
 *   allowTarget  when true (tracker scope), goals can have a numeric target
 *   unit         tracker unit, shown next to target values
 */
export default function ItemList({ items, onChange, allowTarget = false, unit = '' }) {
  const goals = items.filter((i) => i.type === 'goal');
  const tasks = items.filter((i) => i.type === 'task');
  const notes = items.filter((i) => i.type === 'note');

  const toggle = async (it) => {
    await api.updateItem(it.id, { status: it.status === 'done' ? 'open' : 'done' });
    onChange();
  };
  const remove = async (id) => {
    await api.deleteItem(id);
    onChange();
  };

  return (
    <div className="items">
      {goals.length > 0 && (
        <div className="item-group">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} unit={unit} onToggle={toggle} onRemove={remove} />
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div className="item-group task-group">
          {tasks.map((t) => (
            <div key={t.id} className={`task-row ${t.status === 'done' ? 'done' : ''}`}>
              <input
                type="checkbox"
                checked={t.status === 'done'}
                onChange={() => toggle(t)}
              />
              <span className="task-text">{t.content}</span>
              <button className="danger" onClick={() => remove(t.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="item-group note-grid">
          {notes.map((n) => (
            <div key={n.id} className="note-card">
              <button className="note-del danger" onClick={() => remove(n.id)}>
                ✕
              </button>
              <div className="note-text">{n.content}</div>
            </div>
          ))}
        </div>
      )}

      <AddItemForm onChange={onChange} allowTarget={allowTarget} unit={unit} />
    </div>
  );
}

function GoalCard({ goal, unit, onToggle, onRemove }) {
  const p = goal.progress; // { progress, latest, target, reached } or undefined
  const pct = p ? Math.round(p.progress * 100) : null;
  const done = goal.status === 'done' || (p && p.reached);

  return (
    <div className={`goal-card ${done ? 'reached' : ''}`}>
      <div className="goal-head">
        <span className="goal-flag">🎯</span>
        <span className="goal-text">{goal.content}</span>
        <button className="danger" onClick={() => onRemove(goal.id)}>
          ✕
        </button>
      </div>

      {p && p.target != null ? (
        <div className="goal-progress">
          <div className="goal-bar-track">
            <div
              className="goal-bar-fill"
              style={{ width: `${pct}%` }}
              aria-valuenow={pct}
            />
          </div>
          <div className="goal-progress-meta">
            <span>
              {p.latest != null ? (
                <>
                  now <strong>{p.latest}{unit ? ` ${unit}` : ''}</strong>
                </>
              ) : (
                'no entries yet'
              )}
            </span>
            <span>
              {pct}% → target <strong>{p.target}{unit ? ` ${unit}` : ''}</strong>
            </span>
          </div>
        </div>
      ) : (
        // Goal with no numeric target: simple achieved toggle.
        <button className="ghost goal-toggle" onClick={() => onToggle(goal)}>
          {done ? '✓ Achieved' : 'Mark achieved'}
        </button>
      )}
    </div>
  );
}

function AddItemForm({ onChange, allowTarget, unit }) {
  const [type, setType] = useState('goal');
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');

  const { trackerId, areaId } = useScope();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { type, content };
      if (type === 'goal' && allowTarget && target !== '') {
        payload.target_value = Number(target);
      }
      if (trackerId) await api.createTrackerItem(trackerId, payload);
      else await api.createItem(areaId, payload);
      setContent('');
      setTarget('');
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="add-item" onSubmit={submit}>
      <div className="add-item-row">
        <select value={type} onChange={(e) => setType(e.target.value)} className="type-select">
          <option value="goal">🎯 Goal</option>
          <option value="task">☑️ Task</option>
          <option value="note">📝 Note</option>
        </select>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            type === 'goal'
              ? 'Goal, e.g. reach target weight'
              : type === 'task'
                ? 'Task, e.g. meal-prep Sunday'
                : 'Note…'
          }
        />
        {type === 'goal' && allowTarget && (
          <input
            type="number"
            step="any"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={`target${unit ? ` (${unit})` : ''}`}
            className="target-input"
          />
        )}
        <button type="submit" disabled={!content.trim()}>
          Add
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

// The form is used in two scopes. Rather than prop-drill, read data attributes
// set by the parent wrapper via a tiny context shim.
import { createContext, useContext } from 'react';
const ScopeContext = createContext({ trackerId: null, areaId: null });
export function ItemScope({ trackerId = null, areaId = null, children }) {
  return (
    <ScopeContext.Provider value={{ trackerId, areaId }}>{children}</ScopeContext.Provider>
  );
}
function useScope() {
  return useContext(ScopeContext);
}
