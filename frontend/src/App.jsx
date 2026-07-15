import React, { useState, useEffect, useCallback, useMemo } from 'react'
import dayjs from 'dayjs'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { ConfigScreen, loadConfig } from './ConfigScreen.jsx'
import { SprintDashboard } from './SprintDashboard.jsx'
import { MemberDashboard } from './MemberDashboard.jsx'
import { Spinner, ErrorBox } from './components.jsx'
import { getMembers, getSprintLists, getListDetails, getAllTasks, getAllTasksFromLists, fetchCycleTimes } from './api.js'

const KPI_PERIOD_START = '2026-01-01'
const KPI_PERIOD_END = '2026-06-30'
const DEFAULT_YEAR = 2026
const DEFAULT_HALVES = ['H1']
const THEME_STORAGE_KEY = 'kpi_dashboard_theme'

function LoginScreen({ themeToggle, loading, error, onSubmit }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const inp  = { width: '100%', fontSize: 13, padding: '8px 10px', background: 'var(--bg3)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', outline: 'none' }
  const lbl  = { fontSize: 11, color: 'var(--text2)', marginBottom: 4, display: 'block' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' }}>
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 20 }}>
        {themeToggle}
      </div>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Garment IO</div>
          <h1 style={{ fontSize: 24, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Sign in</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Use your dashboard account to access KPI data.</p>
        </div>
        {error && <ErrorBox message={error} />}
        <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Username</label>
            <input type="text" style={inp} value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Password</label>
            <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button
            onClick={() => onSubmit(username, password)}
            disabled={loading}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: 4 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

function buildHalfRange(year, halves) {
  const selected = new Set(halves)
  if (selected.has('H1') && selected.has('H2')) return { from: `${year}-01-01`, to: `${year}-12-31` }
  if (selected.has('H2')) return { from: `${year}-07-01`, to: `${year}-12-31` }
  return { from: `${year}-01-01`, to: `${year}-06-30` }
}

function parseListIds(value) {
  if (!value) return []
  const seen = new Set()

  return String(value)
    .split(/[\s,]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/\/v\/l\/6-(\d+)-/i)
      if (match) return match[1]
      if (/^\d+$/.test(part)) return part
      return null
    })
    .filter(id => {
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
}

export default function App() {
  const urlPersonalMemberId = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('memberId') || ''
  }, [])
  const [themeMode, setThemeMode]         = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY)
      if (saved === 'light' || saved === 'dark') return saved
    } catch {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [config, setConfig]                 = useState(loadConfig)
  const [loading, setLoading]               = useState(false)
  const [loadingLabel, setLoadingLabel]     = useState('')
  const [error, setError]                   = useState(null)
  const [members, setMembers]               = useState([])
  const [sprints, setSprints]               = useState([])
  const [extraSources, setExtraSources]     = useState([])
  const [tasks, setTasks]                   = useState([])
  const [bugTasks, setBugTasks]             = useState([])
  const [cycleTimeMap, setCycleTimeMap]     = useState({})
  const [cycleMetaMap, setCycleMetaMap]     = useState({})
  const [cycleTimeNote, setCycleTimeNote]   = useState('')
  const [cycleProgress, setCycleProgress]   = useState(null)
  const [tab, setTab]                       = useState('sprint')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [dateFrom, setDateFrom]             = useState(KPI_PERIOD_START)
  const [dateTo, setDateTo]                 = useState(KPI_PERIOD_END)
  const [selectedYear, setSelectedYear]     = useState(DEFAULT_YEAR)
  const [selectedHalves, setSelectedHalves] = useState(DEFAULT_HALVES)
  const [advancedDates, setAdvancedDates]   = useState(false)
  const [authStatus, setAuthStatus]         = useState({ enabled: false, authenticated: true, user: null })
  const [authReady, setAuthReady]           = useState(false)
  const [authLoading, setAuthLoading]       = useState(false)
  const [authError, setAuthError]           = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode)
    localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  const refreshAuthStatus = useCallback(async () => {
    const res = await fetch('/api/auth/status')
    if (!res.ok) throw new Error(`Auth status failed: ${res.status}`)
    const data = await res.json()
    setAuthStatus(data)
    setAuthReady(true)
    return data
  }, [])

  useEffect(() => {
    refreshAuthStatus().catch(() => {
      setAuthStatus({ enabled: false, authenticated: true, user: null })
      setAuthReady(true)
    })
  }, [refreshAuthStatus])

  const effectivePersonalMemberId = authStatus?.user?.role === 'employee'
    ? String(authStatus.user.memberId || '')
    : urlPersonalMemberId
  const personalOnly = (authStatus?.user?.role === 'employee') || !!effectivePersonalMemberId
  const canSeeAllView = !authStatus?.enabled || !authStatus?.user || authStatus.user.role === 'admin' || authStatus.user.role === 'manager'

  async function login(username, password) {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Login failed: ${res.status}`)
      setAuthStatus(data)
    } catch (e) {
      setAuthError(e.message)
    }
    setAuthLoading(false)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setAuthStatus({ enabled: true, authenticated: false, user: null })
  }

  const muiTheme = useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      primary: { main: themeMode === 'dark' ? '#4f7cff' : '#2563eb' },
      background: {
        default: themeMode === 'dark' ? '#0f0f10' : '#f5f7fb',
        paper: themeMode === 'dark' ? '#17171a' : '#ffffff',
      },
      text: {
        primary: themeMode === 'dark' ? '#f0f0f0' : '#0f172a',
        secondary: themeMode === 'dark' ? '#8a8a95' : '#475569',
      },
    },
    shape: {
      borderRadius: 10,
    },
    typography: {
      fontFamily: '"IBM Plex Sans", sans-serif',
    },
  }), [themeMode])

  const loadTasks = useCallback(async (cfg, sprintList, from, to) => {
    setLoading(true); setError(null)
    try {
      const list = sprintList || []
      const extraListIds = parseListIds(cfg.backlogListId)
      const ids = [...new Set([...list.map(s => s.id), ...extraListIds])]
      setLoadingLabel(`Loading official KPI scope (${ids.length} sources)…`)
      const sprintTasks = await getAllTasksFromLists(ids, cfg.token, { dateFrom: from, dateTo: to })

      setLoadingLabel('Loading bugs…')
      const bugs = cfg.bugsListId
        ? await getAllTasks(cfg.bugsListId, cfg.token, { dateFrom: from, dateTo: to })
        : []

      setTasks(sprintTasks)
      setBugTasks(bugs)
      setCycleTimeNote('')
      setCycleMetaMap({})

      // Fetch cycle times for all parent tasks that passed through awaiting testing
      // (in-progress → awaiting testing = dev cycle time)
      // Include done tasks AND tasks currently in/past awaiting testing
      const PAST_TESTING = new Set([
        'awaiting testing','waiting for testing','in-testing','in testing','awaiting rc solution',
        'awaiting acceptance','accepted','completed',
        'waiting for uat',
        'awaiting ops validation','awaiting qc validation',
        'needs-info','prod beta','production'
      ])
      const cycleCandidates = sprintTasks.filter(t =>
        PAST_TESTING.has((t.status?.status || '').toLowerCase())
      )
      if (cycleCandidates.length > 0) {
        setLoadingLabel(`Fetching cycle times for ${cycleCandidates.length} completed tasks…`)
        setCycleProgress({ done: 0, total: cycleCandidates.length })
        const { map: ctMap, meta, note } = await fetchCycleTimes(cycleCandidates, cfg.token, (done, total) => {
          setCycleProgress({ done, total })
          setLoadingLabel(`Cycle times: ${done}/${total} tasks…`)
        })
        setCycleTimeMap(ctMap)
        setCycleMetaMap(meta)
        setCycleTimeNote(note)
        setCycleProgress(null)
      } else {
        setCycleTimeMap({})
        setCycleMetaMap({})
        setCycleTimeNote('No parent tasks reached awaiting testing or later in this range.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false); setLoadingLabel('')
  }, [])

  const load = useCallback(async (cfg) => {
    if (!cfg) return
    setLoading(true); setError(null)
    try {
      setLoadingLabel('Loading members…')
      const m = await getMembers(cfg.teamId, cfg.token, cfg.groupId)
      setMembers(m)

      setLoadingLabel('Loading sprints…')
      const sprintList = await getSprintLists(cfg.token, cfg.sprintParentId)
      setSprints(sprintList)

      const backlogListIds = parseListIds(cfg.backlogListId)
      const extraListData = await Promise.all(backlogListIds.map(async id => {
        try {
          const listData = await getListDetails(id, cfg.token)
          return { ...listData, listId: id, kind: 'extra' }
        } catch {
          return { listId: id, name: `List ${id}`, kind: 'extra' }
        }
      }))
      setExtraSources(extraListData)

      const preset = buildHalfRange(DEFAULT_YEAR, DEFAULT_HALVES)
      setSelectedYear(DEFAULT_YEAR)
      setSelectedHalves(DEFAULT_HALVES)
      setAdvancedDates(false)
      setDateFrom(preset.from)
      setDateTo(preset.to)
      await loadTasks(cfg, sprintList, preset.from, preset.to)
    } catch (e) {
      setError(e.message)
      setLoading(false); setLoadingLabel('')
    }
  }, [loadTasks])

  useEffect(() => {
    if (!authReady) return
    if (authStatus.enabled && !authStatus.authenticated) return
    if (config) load(config)
  }, [config, load, authReady, authStatus.enabled, authStatus.authenticated])

  async function applyDateFilter() {
    await loadTasks(config, sprints, dateFrom, dateTo)
  }

  async function applyPresetPeriod(year = selectedYear, halves = selectedHalves) {
    const nextHalves = halves.length ? halves : ['H1']
    const preset = buildHalfRange(year, nextHalves)
    setSelectedYear(year)
    setSelectedHalves(nextHalves)
    setAdvancedDates(false)
    setDateFrom(preset.from)
    setDateTo(preset.to)
    await loadTasks(config, sprints, preset.from, preset.to)
  }

  async function applyH1Preset() {
    await applyPresetPeriod(selectedYear, ['H1'])
  }

  function toggleHalf(half) {
    const next = selectedHalves.includes(half)
      ? selectedHalves.filter(h => h !== half)
      : [...selectedHalves, half]
    applyPresetPeriod(selectedYear, next.length ? next : [half])
  }

  function changeYear(year) {
    applyPresetPeriod(Number(year), selectedHalves)
  }

  const sel = { background: 'var(--bg3)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: 12, padding: '6px 10px', fontFamily: 'var(--font)', cursor: 'pointer' }
  const datePickerSx = {
    minWidth: 150,
    '& .MuiOutlinedInput-root': {
      height: 32,
      fontSize: 12,
      background: 'var(--bg3)',
      color: 'var(--text)',
      borderRadius: 'var(--radius-sm)',
      '& fieldset': { borderColor: 'var(--border2)' },
      '&:hover fieldset': { borderColor: 'var(--border2)' },
      '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
    },
    '& .MuiInputBase-input': {
      padding: '7px 10px',
    },
    '& .MuiSvgIcon-root': {
      color: 'var(--text2)',
      fontSize: 18,
    },
  }
  const navBtn = (t, label) => (
    <button onClick={() => setTab(t)} style={{ background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? '#fff' : 'var(--text2)', border: `0.5px solid ${tab === t ? 'transparent' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', padding: '6px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}>{label}</button>
  )
  const hasDateFilter = dateFrom || dateTo
  const officialScopeName = `All sources (${sprints.length + extraSources.length})`
  const manualPeriodKey = advancedDates
    ? `custom:${dateFrom || 'start'}:${dateTo || 'end'}`
    : `half:${selectedYear}:${selectedHalves.slice().sort().join('+') || 'H1'}`
  const yearOptions = Array.from(new Set([
    DEFAULT_YEAR,
    ...sprints.map(s => {
      const ts = parseInt(s.start_date || s.due_date || 0)
      return ts ? new Date(ts).getUTCFullYear() : null
    }).filter(Boolean),
  ])).sort((a, b) => b - a)

  const themeToggle = (
    <button onClick={() => setThemeMode(mode => mode === 'dark' ? 'light' : 'dark')} style={{ ...sel, fontSize: 11 }}>
      {themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  )

  useEffect(() => {
    setTab(personalOnly ? 'team' : 'sprint')
  }, [personalOnly])

  if (!authReady) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner />
          </div>
        </LocalizationProvider>
      </ThemeProvider>
    )
  }

  if (authStatus.enabled && !authStatus.authenticated && !urlPersonalMemberId) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <LoginScreen themeToggle={themeToggle} loading={authLoading} error={authError} onSubmit={login} />
        </LocalizationProvider>
      </ThemeProvider>
    )
  }

  if (!config) {
    const partial = (() => { try { return JSON.parse(localStorage.getItem('kpi_dashboard_config') || 'null') } catch { return null } })()
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <div style={{ minHeight: '100vh', position: 'relative' }}>
            <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 20 }}>
              {themeToggle}
            </div>
            <ConfigScreen prefill={partial} onConnect={cfg => { setConfig(cfg); load(cfg) }} />
          </div>
        </LocalizationProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ borderBottom: '0.5px solid var(--border)', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: 16, height: 52, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Garment IO</span>
        <span style={{ color: 'var(--border2)' }}>|</span>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{personalOnly ? 'Personal KPI Page' : 'KPI Dashboard'}</span>
        {!personalOnly && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
            {navBtn('sprint', 'Sprint')}
            {canSeeAllView && navBtn('team', 'Team KPIs')}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {themeToggle}
          <button onClick={() => load(config)} style={{ ...sel, fontSize: 11 }}>Refresh</button>
          {authStatus.enabled
            ? <button onClick={logout} style={{ ...sel, fontSize: 11, color: 'var(--text3)' }}>Logout</button>
            : (!personalOnly && <button onClick={() => { localStorage.clear(); setConfig(null) }} style={{ ...sel, fontSize: 11, color: 'var(--text3)' }}>Disconnect</button>)}
        </div>
      </div>

      <div style={{ padding: '8px 1.5rem', borderBottom: '0.5px solid var(--border)', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Scope</span>
          <span style={{ ...sel, cursor: 'default' }}>{officialScopeName}</span>
        </div>

        <span style={{ color: 'var(--border2)', fontSize: 16 }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Period</span>
          <select value={selectedYear} onChange={e => changeYear(e.target.value)} style={sel}>
            {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          {['H1', 'H2'].map(half => (
            <button
              key={half}
              onClick={() => toggleHalf(half)}
              style={{
                ...sel,
                fontSize: 11,
                background: selectedHalves.includes(half) && !advancedDates ? 'var(--accent)' : 'transparent',
                color: selectedHalves.includes(half) && !advancedDates ? '#fff' : 'var(--text2)',
                borderColor: selectedHalves.includes(half) && !advancedDates ? 'transparent' : 'var(--border2)',
              }}
            >
              {half}
            </button>
          ))}
          <button
            onClick={() => setAdvancedDates(v => !v)}
            style={{
              ...sel,
              fontSize: 11,
              background: advancedDates ? 'var(--accent)' : 'transparent',
              color: advancedDates ? '#fff' : 'var(--text2)',
              borderColor: advancedDates ? 'transparent' : 'var(--border2)',
            }}
          >
            Advanced
          </button>
          {advancedDates && (
            <>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>From</span>
              <DatePicker
                value={dateFrom ? dayjs(dateFrom) : null}
                onChange={value => setDateFrom(value && value.isValid() ? value.format('YYYY-MM-DD') : '')}
                format="MM/DD/YYYY"
                slotProps={{ textField: { size: 'small' } }}
                sx={datePickerSx}
              />
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>To</span>
              <DatePicker
                value={dateTo ? dayjs(dateTo) : null}
                onChange={value => setDateTo(value && value.isValid() ? value.format('YYYY-MM-DD') : '')}
                format="MM/DD/YYYY"
                slotProps={{ textField: { size: 'small' } }}
                sx={datePickerSx}
              />
              <button onClick={applyDateFilter} style={{ ...sel, fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none' }}>Apply</button>
            </>
          )}
          <button onClick={applyH1Preset} style={{ ...sel, fontSize: 11 }}>Reset H1</button>
        </div>

        {!personalOnly && canSeeAllView && tab === 'team' && (
          <>
            <span style={{ color: 'var(--border2)', fontSize: 16 }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Assignee</span>
              <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={sel}>
                <option value="all">All team</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.username || m.email}</option>)}
              </select>
            </div>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {hasDateFilter && <span style={{ fontSize: 11, color: '#f5a623', background: '#2b1f0a', padding: '2px 8px', borderRadius: 10 }}>{dateFrom} → {dateTo}</span>}
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {tasks.length} tasks · {bugTasks.length} bugs
            <span style={{ marginLeft: 6, color: 'var(--accent)' }}>· {officialScopeName}</span>
          </span>
        </div>
      </div>

      <div style={{ flex: 1, padding: '1.25rem 1.5rem', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {error && <ErrorBox message={error} />}
        {loading
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>{loadingLabel || 'Loading…'}</div>
              {cycleProgress && (
                <div style={{ width: 200, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${Math.round(cycleProgress.done / cycleProgress.total * 100)}%`, transition: 'width 0.3s' }} />
                </div>
              )}
            </div>
          : <>
              {tab === 'sprint' && <SprintDashboard tasks={tasks} bugTasks={bugTasks} sprintName={officialScopeName} sourceKind="all-sources" cycleTimeMap={cycleTimeMap} cycleMetaMap={cycleMetaMap} cycleTimeNote={cycleTimeNote} />}
              {tab === 'team' && (personalOnly || canSeeAllView) && (
                <MemberDashboard
                  members={members}
                  tasks={tasks}
                  bugTasks={bugTasks}
                  assigneeFilter={assigneeFilter}
                  cycleTimeMap={cycleTimeMap}
                  cycleMetaMap={cycleMetaMap}
                  personalMemberId={effectivePersonalMemberId}
                  personalOnly={personalOnly}
                  manualDataWritable={canSeeAllView && !personalOnly}
                  periodKey={manualPeriodKey}
                />
              )}
            </>
        }
      </div>
    </div>
      </LocalizationProvider>
    </ThemeProvider>
  )
}
