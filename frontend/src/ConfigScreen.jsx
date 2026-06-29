import React, { useState } from 'react'
import { ErrorBox } from './components.jsx'

const STORAGE_KEY = 'kpi_dashboard_config'
const RUNTIME_CONFIG = typeof window !== 'undefined' ? (window.__APP_CONFIG__ || {}) : {}

const ENV_CONFIG = {
  token:         import.meta.env.VITE_CLICKUP_TOKEN    || '',
  teamId:        RUNTIME_CONFIG.teamId        || import.meta.env.VITE_TEAM_ID          || '',
  groupId:       RUNTIME_CONFIG.groupId       || import.meta.env.VITE_GROUP_ID         || '',
  bugsListId:    RUNTIME_CONFIG.bugsListId    || import.meta.env.VITE_BUGS_LIST_ID     || '',
  backlogListId: RUNTIME_CONFIG.backlogListId || import.meta.env.VITE_BACKLOG_LIST_ID  || '',
  sprintParentId:RUNTIME_CONFIG.sprintParentId|| import.meta.env.VITE_SPRINT_PARENT_ID || '',
}

const ENV_COMPLETE = ENV_CONFIG.teamId

export function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}
    const cfg = {
      token: saved.token || ENV_CONFIG.token || '',
      teamId: saved.teamId || ENV_CONFIG.teamId || '',
      groupId: saved.groupId || ENV_CONFIG.groupId || '',
      bugsListId: saved.bugsListId || ENV_CONFIG.bugsListId || '',
      backlogListId: saved.backlogListId || ENV_CONFIG.backlogListId || '',
      sprintParentId: saved.sprintParentId || ENV_CONFIG.sprintParentId || '',
    }
    if (!cfg.teamId) return null
    return cfg
  } catch {
    return ENV_COMPLETE ? ENV_CONFIG : null
  }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export function ConfigScreen({ onConnect, prefill }) {
  const saved = prefill || {}
  const [form, setForm] = useState({
    token:          saved.token          || ENV_CONFIG.token          || '',
    teamId:         saved.teamId         || ENV_CONFIG.teamId         || '',
    groupId:        saved.groupId        || ENV_CONFIG.groupId        || '',
    bugsListId:     saved.bugsListId     || ENV_CONFIG.bugsListId     || '',
    backlogListId:  saved.backlogListId  || ENV_CONFIG.backlogListId  || '',
    sprintParentId: saved.sprintParentId || ENV_CONFIG.sprintParentId || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const set = k => e => {
    setError(null)
    setForm(f => ({ ...f, [k]: e.target.value.trim() }))
  }

  async function connect() {
    if (!form.teamId) { setError('Team ID is required.'); return }
    setLoading(true); setError(null)
    try {
      const headers = form.token ? { 'X-ClickUp-Token': form.token } : undefined
      const res = await fetch(`/api/v2/team`, headers ? { headers } : undefined)
      if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
      saveConfig(form)
      onConnect(form)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const inp  = { width: '100%', fontSize: 13, padding: '8px 10px', background: 'var(--bg3)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', outline: 'none' }
  const lbl  = { fontSize: 11, color: 'var(--text2)', marginBottom: 4, display: 'block' }
  const hint = { fontSize: 10, color: 'var(--text3)', marginTop: 3 }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Garment IO</div>
          <h1 style={{ fontSize: 24, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>KPI Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Sprints are loaded from your Tech/Prod Sprints folder automatically.</p>
        </div>
        {error && <ErrorBox message={error} />}
        <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>API Token</label>
            <input type="password" style={inp} placeholder="pk_xxxxxxxxxxxxxxxx" value={form.token} onChange={set('token')} />
            <p style={hint}>Optional if the server already has `CLICKUP_TOKEN`. Required only for browser-side auth fallback.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Team ID <span style={{ color: 'var(--accent)' }}>*</span></label>
              <input type="text" style={inp} placeholder="2153890" value={form.teamId} onChange={set('teamId')} />
              <p style={hint}>Number in ClickUp workspace URL</p>
            </div>
            <div>
              <label style={lbl}>Devs group ID</label>
              <input type="text" style={inp} placeholder="6a1cc431-..." value={form.groupId} onChange={set('groupId')} />
              <p style={hint}>Leave blank for all members</p>
            </div>
          </div>
          <div>
            <label style={lbl}>Sprint folder ID <span style={{ color: 'var(--accent)' }}>*</span></label>
            <input type="text" style={{ ...inp, border: form.sprintParentId ? '0.5px solid var(--border2)' : '0.5px solid #f5a623' }}
              placeholder="90129369047" value={form.sprintParentId} onChange={set('sprintParentId')} />
            <p style={hint}>Right-click "Tech/Prod Sprints" → Copy link → last number</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Bugs list ID</label>
              <input type="text" style={inp} placeholder="12916449" value={form.bugsListId} onChange={set('bugsListId')} />
              <p style={hint}>Numeric only — right-click Bugs → Copy link</p>
            </div>
            <div>
              <label style={lbl}>Backlog list IDs or URLs</label>
              <input type="text" style={inp} placeholder="901203911469, https://app.clickup.com/2153890/v/l/6-234019833-1" value={form.backlogListId} onChange={set('backlogListId')} />
              <p style={hint}>Paste one or more list IDs or full ClickUp list URLs, separated by commas or spaces</p>
            </div>
          </div>
          <button onClick={connect} disabled={loading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: 4 }}>
            {loading ? 'Connecting…' : 'Load workspace'}
          </button>
        </div>
      </div>
    </div>
  )
}
