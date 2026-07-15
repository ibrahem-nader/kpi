const BASE = '/api/v2'
const PERSONAL_ACCESS_ENABLED = typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('memberId')

function buildHeaders(token) {
  const headers = { 'X-ClickUp-Token': token, 'Content-Type': 'application/json' }
  if (PERSONAL_ACCESS_ENABLED) headers['X-KPI-Personal-Access'] = '1'
  return headers
}

function normalizeWorkflowStatus(status) {
  const s = (status || '').toLowerCase().trim()
  if (s === 'in progress') return 'in-progress'
  if (s === 'waiting for testing') return 'awaiting testing'
  if (s === 'in testing') return 'in-testing'
  if (s === 'waiting for review') return 'awaiting review'
  if (s === 'waiting for uat') return 'awaiting acceptance'
  if (s === 'ready for development') return 'ready'
  return s
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: buildHeaders(token),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ClickUp ${res.status}: ${text}`)
  }
  return res.json()
}

function analyzeCycleHistory(history = []) {
  const DEV_START = new Set(['in-progress'])
  const DEV_END = new Set([
    'awaiting review',
    'awaiting testing',
    'in-testing',
    'awaiting acceptance',
    'completed',
    'awaiting ops validation',
    'awaiting qc validation',
    'production',
  ])
  const FULL_END = new Set(['awaiting acceptance', 'completed', 'production'])
  const EXCLUDED = new Set(['incomplete', 'canceled', 'cancelled'])
  const DONE = new Set([
    'awaiting acceptance',
    'accepted',
    'completed',
    'awaiting ops validation',
    'awaiting qc validation',
    'needs-info',
    'prod beta',
    'production',
  ])
  const REVIEW = new Set(['awaiting review', 'in-review', 'reviewed'])
  const TESTING = new Set([
    'awaiting testing',
    'in-testing',
    'awaiting acceptance',
    'awaiting ops validation',
    'awaiting qc validation',
  ])
  const DEV_RETURN = new Set([
    'new',
    'open',
    'ready',
    'incomplete',
    'in-progress',
    'in-review',
    'awaiting review',
    'reviewed',
    'awaiting rc solution',
  ])

  const ts = s => parseInt(s?.total_time?.since) || null
  const normalized = history
    .map(h => ({ ...h, normalizedStatus: normalizeWorkflowStatus(h.status), ms: ts(h) }))
    .filter(h => h.ms)
    .sort((a, b) => a.ms - b.ms)
  const firstEntry = (entries = []) => {
    const withTs = entries
      .map(h => ({ status: h.normalizedStatus, ms: h.ms }))
      .sort((a, b) => a.ms - b.ms)
      return withTs[0] || null
  }

  const latestStatus = normalized
    .sort((a, b) => b.ms - a.ms)[0]?.normalizedStatus || null

  const hasInProgress = normalized.some(h => DEV_START.has(h.normalizedStatus))

  let reopenCount = 0
  let reviewBounceBackCount = 0
  let testingBounceBackCount = 0
  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1].normalizedStatus
    const curr = normalized[i].normalizedStatus
    if (DONE.has(prev) && !DONE.has(curr) && curr !== prev) reopenCount++
    if (REVIEW.has(prev) && DEV_RETURN.has(curr) && curr !== prev) reviewBounceBackCount++
    if (TESTING.has(prev) && DEV_RETURN.has(curr) && curr !== prev) testingBounceBackCount++
  }

  if (latestStatus && EXCLUDED.has(latestStatus)) {
    return { devCycleMs: null, fullCycleMs: null, hasInProgress, latestStatus, reopenCount, reviewBounceBackCount, testingBounceBackCount }
  }

  const startEntry = firstEntry(normalized.filter(h => DEV_START.has(h.normalizedStatus)))
  const devEndEntry = firstEntry(normalized.filter(h => DEV_END.has(h.normalizedStatus)))
  const fullEndEntry = firstEntry(normalized.filter(h => FULL_END.has(h.normalizedStatus)))

  const startTime = startEntry?.ms || null
  const devEndTime = devEndEntry?.ms || null
  const fullEndTime = fullEndEntry?.ms || null
  const devCycleMs = startTime && devEndTime && devEndTime > startTime ? devEndTime - startTime : null
  const fullCycleMs = startTime && fullEndTime && fullEndTime > startTime ? fullEndTime - startTime : null

  return {
    devCycleMs,
    fullCycleMs,
    hasInProgress,
    latestStatus,
    reopenCount,
    reviewBounceBackCount,
    testingBounceBackCount,
    devDetail: devCycleMs !== null ? { start: startEntry, end: devEndEntry } : null,
    fullDetail: fullCycleMs !== null ? { start: startEntry, end: fullEndEntry } : null,
  }
}

function parseCycleTimesFromHistory(history = []) {
  const { devCycleMs, fullCycleMs } = analyzeCycleHistory(history)
  return { devCycleMs, fullCycleMs }
}

export async function getMembers(teamId, token, groupId) {
  if (groupId) {
    const data = await get(`/group?team_id=${teamId}`, token)
    const group = (data.groups || []).find(g => g.id === groupId)
    if (group) return group.members
  }
  const data = await get(`/team`, token)
  const team = (data.teams || []).find(t => String(t.id) === String(teamId)) || data.teams?.[0]
  return (team?.members || []).map(m => m.user)
}

export async function getSprintLists(token, sprintParentId) {
  try {
    const data = await get(`/folder/${sprintParentId}/list?archived=false`, token)
    if (data.lists?.length > 0) {
      return data.lists.sort((a, b) => {
        // Sort by start_date first, fall back to due_date, then name
        const aDate = parseInt(a.start_date || a.due_date) || 0
        const bDate = parseInt(b.start_date || b.due_date) || 0
        if (aDate !== bDate) return aDate - bDate
        return a.name.localeCompare(b.name)
      })
    }
  } catch {}
  return []
}

export async function getListDetails(listId, token) {
  return get(`/list/${listId}`, token)
}

// Fetch tasks with optional server-side date filtering
// ClickUp supports date_created_gt / date_created_lt (unix ms)
export async function getAllTasks(listId, token, options = {}) {
  const { dateFrom, dateTo } = options
  let tasks = [], page = 0

  // Build query params
  const params = new URLSearchParams({
    include_closed: 'true',
    subtasks: 'true',
  })
  if (dateFrom) params.set('date_created_gt', new Date(dateFrom).getTime())
  if (dateTo)   params.set('date_created_lt', new Date(dateTo + 'T23:59:59').getTime())

  while (true) {
    params.set('page', page)
    const data = await get(`/list/${listId}/task?${params.toString()}`, token)
    tasks = tasks.concat(data.tasks || [])
    if (!data.tasks || data.tasks.length < 100) break
    page++
  }
  return tasks
}

export async function getAllTasksFromLists(listIds, token, options = {}) {
  const results = await Promise.all(listIds.map(id => getAllTasks(id, token, options)))
  const seen = new Set()
  return results.flat().filter(t => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
}

// Fetch time_in_status for a task and compute TWO cycle time metrics:
// 1. Dev cycle:   in-progress → awaiting testing  (pure dev work)
// 2. Full cycle:  in-progress → production        (end-to-end delivery)
export async function getTaskCycleTimes(taskId, token) {
  try {
    const data = await get(`/task/${taskId}/time_in_status`, token)
    return parseCycleTimesFromHistory(data.status_history || [])
  } catch (e) {
    console.warn(`time_in_status failed for task ${taskId}:`, e.message)
    return null
  }
}

// Keep old name as alias for backward compat
export async function getTaskActivityStartTime(taskId, token) {
  const r = await getTaskCycleTimes(taskId, token)
  return r
}

// Fetch accurate cycle times for a batch of done tasks
// Returns a map of taskId -> cycleTimeMs
export async function fetchCycleTimes(doneTasks, token, onProgress) {
  const result = {}
  const meta = {}
  const BATCH = 100
  let firstError = ''

  for (let i = 0; i < doneTasks.length; i += BATCH) {
    const batch = doneTasks.slice(i, i + BATCH)
    const params = new URLSearchParams()
    batch.forEach(task => params.append('task_ids', task.id))

    try {
      const data = await get(`/task/bulk_time_in_status/task_ids?${params.toString()}`, token)
      batch.forEach(task => {
        const entry = data?.[task.id]
        if (!entry?.status_history) return
        const timing = analyzeCycleHistory(entry.status_history)
        meta[task.id] = {
          hasInProgress: timing.hasInProgress,
          latestStatus: timing.latestStatus,
          reopenCount: timing.reopenCount || 0,
          reviewBounceBackCount: timing.reviewBounceBackCount || 0,
          testingBounceBackCount: timing.testingBounceBackCount || 0,
          devDetail: timing.devDetail,
          fullDetail: timing.fullDetail,
        }
        if (timing.devCycleMs !== null || timing.fullCycleMs !== null) {
          result[task.id] = { devCycleMs: timing.devCycleMs, fullCycleMs: timing.fullCycleMs }
        }
      })
    } catch (e) {
      if (!firstError) firstError = e.message
      await Promise.all(batch.map(async task => {
        const data = await get(`/task/${task.id}/time_in_status`, token).catch(() => null)
        if (!data?.status_history) return
        const timing = analyzeCycleHistory(data.status_history)
        meta[task.id] = {
          hasInProgress: timing.hasInProgress,
          latestStatus: timing.latestStatus,
          reopenCount: timing.reopenCount || 0,
          reviewBounceBackCount: timing.reviewBounceBackCount || 0,
          testingBounceBackCount: timing.testingBounceBackCount || 0,
          devDetail: timing.devDetail,
          fullDetail: timing.fullDetail,
        }
        if (timing && (timing.devCycleMs !== null || timing.fullCycleMs !== null)) {
          result[task.id] = { devCycleMs: timing.devCycleMs, fullCycleMs: timing.fullCycleMs }
        }
      }))
    }

    if (onProgress) onProgress(Math.min(i + BATCH, doneTasks.length), doneTasks.length)
    if (i + BATCH < doneTasks.length) await new Promise(r => setTimeout(r, 100))
  }

  let note = ''
  if (doneTasks.length === 0) {
    note = 'No eligible parent tasks in this range.'
  } else if (Object.keys(result).length === 0) {
    note = firstError || 'ClickUp returned no usable time-in-status history.'
  } else if (Object.keys(result).length < doneTasks.length) {
    note = `Measured ${Object.keys(result).length}/${doneTasks.length} parent tasks from activity logs.`
  }

  return { map: result, meta, note }
}
