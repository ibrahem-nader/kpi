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

// Retries on 429 with backoff (honoring Retry-After when ClickUp sends it) so
// a transient rate-limit blip doesn't fail the whole page load — every call
// site (pagination loops, time entries, per-task fetches) gets this for free
// since they all funnel through here. Confirmed empirically that firing many
// list-pagination loops in parallel (see getAllTasksFromLists) can trip
// ClickUp's rate limit and, without this, cascade into "0 tasks" failures.
const MAX_429_RETRIES = 5
async function get(path, token, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    headers: buildHeaders(token),
  })
  if (res.status === 429 && attempt < MAX_429_RETRIES) {
    const retryAfterHeader = res.headers.get('Retry-After')
    const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : null
    const backoffMs = retryAfterMs || Math.min(30000, 1000 * Math.pow(2, attempt))
    await new Promise(resolve => setTimeout(resolve, backoffMs))
    return get(path, token, attempt + 1)
  }
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`ClickUp ${res.status}: ${text}`)
    err.status = res.status
    throw err
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

// Fetch time-tracking entries within a date range for the whole team.
// Unlike a task's `time_spent` (its all-time cumulative total), these entries
// are the source of truth for "hours tracked in this period" — including
// entries logged against tasks that were created outside the period and so
// never show up in a date_created-filtered task fetch.
//
// IMPORTANT: without an explicit `assignee` param, ClickUp silently scopes
// this endpoint to the token owner's own entries instead of the whole team
// (confirmed empirically — no error, just a near-empty result). memberIds
// must be passed explicitly to get everyone's tracked time.
export async function getTeamTimeEntries(teamId, token, { dateFrom, dateTo, memberIds = [] } = {}) {
  if (!teamId || memberIds.length === 0) return []
  const params = new URLSearchParams()
  if (dateFrom) params.set('start_date', new Date(dateFrom).getTime())
  if (dateTo)   params.set('end_date', new Date(dateTo + 'T23:59:59').getTime())
  params.set('assignee', memberIds.join(','))
  const data = await get(`/team/${teamId}/time_entries?${params.toString()}`, token)
  return data.data || []
}

// Fetch full task objects (including time_estimate) for specific task IDs.
// Used for tasks referenced by time entries but excluded from the normal
// date_created-filtered list fetch (e.g. carried-over work) — there's no
// ClickUp bulk-get-by-id endpoint for full task objects, so this issues
// individual GETs. Kept deliberately conservative: low concurrency, a small
// pacing gap between batches, and an outer bail-out if a batch still fails
// after get()'s own 429 retries are exhausted — at that point ClickUp is in
// a sustained rate-limited state, and retrying here would just mean waiting
// out get()'s ~2min retry budget again for every remaining task. Callers
// should cap/prioritize `ids` (e.g. highest tracked-time tasks first) since
// large carried-over sets won't all resolve within the rate limit.
export async function getTasksByIds(ids, token, onProgress) {
  const uniqueIds = [...new Set(ids)].filter(Boolean)
  const CONCURRENCY = 5
  const results = []
  let done = 0
  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    const batch = uniqueIds.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(id => get(`/task/${id}`, token).catch(e => e)))
    const batchStillRateLimited = batchResults.some(r => r?.status === 429)
    results.push(...batchResults.filter(r => r && !(r instanceof Error)))
    done += batch.length
    onProgress?.(done, uniqueIds.length)
    if (batchStillRateLimited) break // sustained rate limit — remaining tasks just stay unestimated
    if (i + CONCURRENCY < uniqueIds.length) await new Promise(resolve => setTimeout(resolve, 250))
  }
  return results
}

export async function getAllTasksFromLists(listIds, token, options = {}) {
  // Fetch a few lists at a time rather than all of them in parallel — each
  // list's own pagination loop can span many pages, and firing every list at
  // once (e.g. 8 sources, each many pages) is what tips ClickUp's rate limit
  // over in practice. get()'s 429 retry is a safety net, not a substitute for
  // not bursting in the first place.
  const CONCURRENCY = 3
  const results = []
  for (let i = 0; i < listIds.length; i += CONCURRENCY) {
    const batch = listIds.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(id => getAllTasks(id, token, options)))
    results.push(...batchResults)
  }
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
