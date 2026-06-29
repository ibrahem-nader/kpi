// Score on 1-5 scale given percentage and thresholds [5,4,3,2]
export function scoreScale(pct, thresholds = [95, 90, 85, 80]) {
  if (pct === null || pct === undefined) return null
  if (pct >= thresholds[0]) return 5
  if (pct >= thresholds[1]) return 4
  if (pct >= thresholds[2]) return 3
  if (pct >= thresholds[3]) return 2
  return 1
}

export function msToHours(ms) {
  return Math.round((ms || 0) / 3600000 * 10) / 10
}

export function msToDays(ms) {
  return Math.round((ms || 0) / 86400000 * 10) / 10
}

export const WORK_TYPE_ORDER = ['feature', 'bug', 'support', 'refactor', 'chore', 'other']
export const WORK_TYPE_COLOR = {
  feature: '#4f7cff',
  bug: '#f0524f',
  support: '#f5a623',
  refactor: '#06b6d4',
  chore: '#8b8b95',
  other: '#555560',
}

// Returns { devCycleMs, fullCycleMs } from the pre-fetched cycleTimeMap
// devCycleMs:  in-progress → awaiting testing (pure dev work)
// fullCycleMs: in-progress → production (end-to-end)
export function getCycleTimes(task, cycleTimeMap = {}) {
  const entry = cycleTimeMap[task.id]
  if (!entry) return { devCycleMs: null, fullCycleMs: null }
  return entry
}

// Convenience: returns devCycleMs for backward compat
export function calcCycleTime(task, cycleTimeMap = {}) {
  return getCycleTimes(task, cycleTimeMap).devCycleMs
}

export function classifyTaskType(task) {
  const listBlob = [task.list?.name, task.folder?.name, task.space?.name].filter(Boolean).join(' ').toLowerCase()
  const tagValues = (task.tags || []).map(tag => (tag.name || '').toLowerCase()).filter(Boolean)
  const customFieldValues = (task.custom_fields || []).flatMap(field => {
    const value = field.value
    if (value === null || value === undefined) return []
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)]
    if (Array.isArray(value)) return value.map(v => String(v))
    if (typeof value === 'object') return Object.values(value).map(v => String(v))
    return []
  })

  const blob = [
    task.name,
    task.description,
    task.list?.name,
    task.folder?.name,
    task.space?.name,
    ...tagValues,
    ...customFieldValues,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const isBugListTask = /\bbugs?\b/.test(task.list?.name?.toLowerCase() || '')
  const hasBugTag = tagValues.some(tag => /\b(bug|bugs|defect|defects|hotfix)\b/.test(tag))

  if (isBugListTask || hasBugTag) return 'bug'
  if (blob.includes('support') || blob.includes('client issue') || blob.includes('customer') || blob.includes('incident')) return 'support'
  if (blob.includes('refactor') || blob.includes('cleanup') || blob.includes('tech debt') || blob.includes('technical debt') || blob.includes('optimization')) return 'refactor'
  if (blob.includes('chore') || blob.includes('maintenance') || blob.includes('ops') || blob.includes('setup') || blob.includes('config')) return 'chore'
  if (blob.includes('feature') || blob.includes('story') || blob.includes('epic') || blob.includes('enhancement')) return 'feature'
  if (listBlob.includes('backlog') || listBlob.includes('kanban')) return 'feature'
  if (/^(ap|fe|be|ui|ux)\s*[-:]/i.test(task.name || '')) return 'feature'
  return 'other'
}

function summarizeWorkMix(tasks) {
  const byWorkType = { feature: 0, bug: 0, support: 0, refactor: 0, chore: 0, other: 0 }
  const byWorkTypeByList = { feature: {}, bug: {}, support: {}, refactor: {}, chore: {}, other: {} }
  tasks.forEach(task => {
    const type = classifyTaskType(task)
    byWorkType[type] = (byWorkType[type] || 0) + 1
    const listName = task.list?.name || 'Unknown list'
    byWorkTypeByList[type][listName] = (byWorkTypeByList[type][listName] || 0) + 1
  })
  const workTypeData = WORK_TYPE_ORDER
    .filter(type => byWorkType[type] > 0)
    .map(type => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      key: type,
      value: byWorkType[type],
      color: WORK_TYPE_COLOR[type],
    }))
  return { byWorkType, workTypeData, byWorkTypeByList }
}

function formatWorkTypeSources(type, byList) {
  const entries = Object.entries(byList || {}).sort((a, b) => b[1] - a[1])
  if (!entries.length) return 'No tasks in this inferred type for the selected scope.'
  const parts = entries.map(([name, count]) => `${name}: ${count}`)
  return `Inferred from main task scope. Source lists: ${parts.join(' · ')}`
}

function weekKeyFromMs(ms) {
  const date = new Date(ms)
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - diff)
  return date.toISOString().split('T')[0]
}

function weekLabel(key) {
  const date = new Date(`${key}T00:00:00Z`)
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
}

function buildWeeklyTrendData(tasks, bugTasks, cycleMetaMap = {}) {
  const buckets = new Map()
  const doneAt = t => parseInt(t.date_done || t.date_closed) || null
  const ensureBucket = key => {
    if (!buckets.has(key)) {
      buckets.set(key, {
        week: key,
        label: weekLabel(key),
        throughput: 0,
        bugFixes: 0,
        qualityMeasured: 0,
        reopened: 0,
        testingBounceBack: 0,
      })
    }
    return buckets.get(key)
  }

  tasks.filter(isDone).forEach(task => {
    const done = doneAt(task)
    if (!done) return
    const bucket = ensureBucket(weekKeyFromMs(done))
    bucket.throughput++
    const meta = cycleMetaMap[task.id]
    if (meta) {
      bucket.qualityMeasured++
      if ((meta.reopenCount || 0) > 0) bucket.reopened++
      if ((meta.testingBounceBackCount || 0) > 0) bucket.testingBounceBack++
    }
  })

  bugTasks.filter(isDone).forEach(task => {
    const done = doneAt(task)
    if (!done) return
    ensureBucket(weekKeyFromMs(done)).bugFixes++
  })

  return Array.from(buckets.values())
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(bucket => ({
      ...bucket,
      reopenRatePct: bucket.qualityMeasured > 0 ? Math.round((bucket.reopened / bucket.qualityMeasured) * 100) : null,
      testingBounceBackPct: bucket.qualityMeasured > 0 ? Math.round((bucket.testingBounceBack / bucket.qualityMeasured) * 100) : null,
    }))
}

function levelFromPct(pct, good = 90, solid = 75, developing = 60) {
  if (pct === null || pct === undefined) return 'Insufficient data'
  if (pct >= good) return 'Strong'
  if (pct >= solid) return 'Solid'
  if (pct >= developing) return 'Developing'
  return 'Needs support'
}

function levelFromInverseDays(days, strong = 3, solid = 5, developing = 8) {
  if (days === null || days === undefined) return 'Insufficient data'
  if (days <= strong) return 'Strong'
  if (days <= solid) return 'Solid'
  if (days <= developing) return 'Developing'
  return 'Needs support'
}

function avgDefined(values) {
  const defined = values.filter(v => v !== null && v !== undefined)
  if (!defined.length) return null
  return Math.round(defined.reduce((a, b) => a + b, 0) / defined.length)
}

function sameOrBeforeDate(doneMs, dueMs) {
  const doneDate = new Date(doneMs).toISOString().slice(0, 10)
  const dueDate = new Date(dueMs).toISOString().slice(0, 10)
  return doneDate <= dueDate
}

function isTaskOnTime(task, doneMs, dueMs) {
  if (!doneMs || !dueMs) return false
  if (task.due_date_time) return doneMs <= dueMs
  return sameOrBeforeDate(doneMs, dueMs)
}

function summarizeEstimateTracked(tasks) {
  const parentTasks = tasks.filter(t => !t.parent)
  const subTasks = tasks.filter(t => t.parent)
  const sumEst = list => list.reduce((s, t) => s + (parseInt(t.time_estimate) || 0), 0)
  const sumTracked = list => list.reduce((s, t) => s + (t.time_spent || 0), 0)

  return {
    allEstimatedMs: sumEst(tasks),
    allTrackedMs: sumTracked(tasks),
    parentEstimatedMs: sumEst(parentTasks),
    parentTrackedMs: sumTracked(parentTasks),
    subtaskEstimatedMs: sumEst(subTasks),
    subtaskTrackedMs: sumTracked(subTasks),
    parentTaskCount: parentTasks.length,
    subtaskCount: subTasks.length,
  }
}

export function calcMemberKPIs(memberId, tasks, bugTasks, cycleTimeMap = {}, cycleMetaMap = {}, manualCompetencies = {}) {
  const myTasks = tasks.filter(t => t.assignees?.some(a => a.id == memberId))
  const myBugs = bugTasks.filter(t => t.assignees?.some(a => a.id == memberId))
  const estimateTracked = summarizeEstimateTracked(myTasks)
  const totalEst = estimateTracked.allEstimatedMs
  const totalTracked = estimateTracked.allTrackedMs

  const doneTasks = myTasks.filter(t => isDone(t))
  const activeTasks = myTasks.filter(t => isActive(t))
  const blockedTasks = myTasks.filter(t => isBlocked(t))
  const doneBugs = myBugs.filter(t => isDone(t))

  const doneAt = t => parseInt(t.date_done || t.date_closed) || null
  const createdAt = t => parseInt(t.date_created) || null
  const dueAt = t => parseInt(t.due_date) || null
  const now = Date.now()

  // Estimate accuracy: how close tracked time was to estimated time
  // Only meaningful if both estimate and tracked time exist
  const estimateAccuracyPct = totalEst > 0
    ? Math.min(100, Math.round((totalTracked / totalEst) * 100))
    : null
  // Completion rate across the selected scope: done tasks / all scoped tasks
  const sprintCompletionPct = myTasks.length > 0 ? Math.round((doneTasks.length / myTasks.length) * 100) : null
  // Keep completionPct as alias for backward compat
  const completionPct = sprintCompletionPct
  const bugPct = myBugs.length > 0 ? Math.round((doneBugs.length / myBugs.length) * 100) : null

  // Member cycle times — assigned subtasks only
  const assignedDoneSubtasks = doneTasks.filter(t => t.parent)
  const devCTs  = assignedDoneSubtasks.map(t => getCycleTimes(t, cycleTimeMap).devCycleMs).filter(Boolean)
  const fullCTs = assignedDoneSubtasks.map(t => getCycleTimes(t, cycleTimeMap).fullCycleMs).filter(Boolean)
  const avgCycleTime     = devCTs.length  ? devCTs.reduce((a,b) => a+b, 0)  / devCTs.length  : null
  const avgFullCycleTime = fullCTs.length ? fullCTs.reduce((a,b) => a+b, 0) / fullCTs.length : null

  const leadTimes = doneTasks
    .map(t => {
      const created = createdAt(t)
      const done = doneAt(t)
      return created && done && done > created ? done - created : null
    })
    .filter(Boolean)
  const avgLeadTime = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null

  const agingTimes = activeTasks
    .map(t => {
      const created = createdAt(t)
      return created && now > created ? now - created : null
    })
    .filter(Boolean)
  const avgAgingTime = agingTimes.length ? agingTimes.reduce((a, b) => a + b, 0) / agingTimes.length : null

  const dueDatedDoneTasks = doneTasks.filter(t => dueAt(t) && doneAt(t))
  const onTimeDoneTasks = dueDatedDoneTasks.filter(t => isTaskOnTime(t, doneAt(t), dueAt(t)))
  const onTimePct = dueDatedDoneTasks.length > 0 ? Math.round((onTimeDoneTasks.length / dueDatedDoneTasks.length) * 100) : null

  const noEstimateTasks = myTasks.filter(t => !t.time_estimate || parseInt(t.time_estimate) === 0)
  const estimateCoveragePct = myTasks.length > 0 ? Math.round(((myTasks.length - noEstimateTasks.length) / myTasks.length) * 100) : null

  const overdueOpenTasks = myTasks.filter(t => !isDone(t) && dueAt(t) && dueAt(t) < now)
  const blockedPct = myTasks.length > 0 ? Math.round((blockedTasks.length / myTasks.length) * 100) : null

  const timelineCandidates = myTasks.flatMap(t => [createdAt(t), doneAt(t)]).filter(Boolean)
  const minTimeline = timelineCandidates.length ? Math.min(...timelineCandidates) : null
  const maxTimeline = timelineCandidates.length ? Math.max(...timelineCandidates, now) : null
  const windowDays = minTimeline && maxTimeline && maxTimeline > minTimeline
    ? Math.max(1, Math.round((maxTimeline - minTimeline) / 86400000))
    : null
  const throughputPerWeek = windowDays ? Math.round((doneTasks.length / (windowDays / 7)) * 10) / 10 : null

  const estimateAccuracyScore = scoreScale(estimateAccuracyPct, [90, 80, 70, 60])
  const bugScore = scoreScale(bugPct)
  const completionScore = scoreScale(completionPct)
  const onTimeScore = scoreScale(onTimePct, [90, 80, 70, 60])

  const weights = { estimateAccuracy: 0.10, completion: 0.20, bug: 0.10, onTime: 0.10 }
  let kpiWeightedScore = null
  const parts = []
  if (estimateAccuracyScore !== null) parts.push({ s: estimateAccuracyScore, w: weights.estimateAccuracy })
  if (bugScore !== null) parts.push({ s: bugScore, w: weights.bug })
  if (completionScore !== null) parts.push({ s: completionScore, w: weights.completion })
  if (onTimeScore !== null) parts.push({ s: onTimeScore, w: weights.onTime })
  if (parts.length) {
    const totalW = parts.reduce((a, p) => a + p.w, 0)
    kpiWeightedScore = Math.round((parts.reduce((a, p) => a + p.s * p.w, 0) / totalW) * 10) / 10
  }

  const competencyLevels = Object.values(manualCompetencies || {})
    .map(value => parseFloat(value))
    .filter(value => value >= 1 && value <= 5)
  const competencyScore = competencyLevels.length
    ? Math.round((competencyLevels.reduce((sum, value) => sum + value, 0) / competencyLevels.length) * 10) / 10
    : null

  let weightedScore = null
  let totalWeightedParts = 0
  let totalWeightedValue = 0
  if (kpiWeightedScore !== null) {
    totalWeightedValue += kpiWeightedScore * 0.7
    totalWeightedParts += 0.7
  }
  if (competencyScore !== null) {
    totalWeightedValue += competencyScore * 0.3
    totalWeightedParts += 0.3
  }
  if (totalWeightedParts > 0) {
    weightedScore = (Math.round((totalWeightedValue / totalWeightedParts) * 10) / 10).toFixed(1)
  }

  const avgLeadTimeDays = avgLeadTime ? msToDays(avgLeadTime) : null
  const avgAgingDays = avgAgingTime ? msToDays(avgAgingTime) : null
  const overdueHealthPct = myTasks.length > 0
    ? Math.max(0, 100 - Math.round((overdueOpenTasks.length / myTasks.length) * 100))
    : null
  const planningPct = avgDefined([estimateAccuracyPct, estimateCoveragePct, onTimePct])
  const qualityPct = avgDefined([bugPct, onTimePct, overdueHealthPct])
  const { byWorkType, workTypeData, byWorkTypeByList } = summarizeWorkMix(myTasks)
  const qualityMeta = myTasks
    .map(task => cycleMetaMap[task.id])
    .filter(Boolean)
  const reopenedTasks = qualityMeta.filter(meta => (meta.reopenCount || 0) > 0).length
  const reviewBounceBackTasks = qualityMeta.filter(meta => (meta.reviewBounceBackCount || 0) > 0).length
  const testingBounceBackTasks = qualityMeta.filter(meta => (meta.testingBounceBackCount || 0) > 0).length
  const qualityMeasuredTasks = qualityMeta.length
  const reopenRatePct = qualityMeasuredTasks > 0 ? Math.round((reopenedTasks / qualityMeasuredTasks) * 100) : null
  const reviewBounceBackPct = qualityMeasuredTasks > 0 ? Math.round((reviewBounceBackTasks / qualityMeasuredTasks) * 100) : null
  const testingBounceBackPct = qualityMeasuredTasks > 0 ? Math.round((testingBounceBackTasks / qualityMeasuredTasks) * 100) : null
  const weeklyTrendData = buildWeeklyTrendData(tasks, bugTasks, cycleMetaMap)
  const qualityStrengthPct = avgDefined([
    bugPct,
    onTimePct,
    overdueHealthPct,
    reopenRatePct !== null ? 100 - reopenRatePct : null,
    testingBounceBackPct !== null ? 100 - testingBounceBackPct : null,
  ])

  const competencies = {
    execution: {
      level: levelFromPct(completionPct),
      summary: completionPct !== null ? `${completionPct}% completion with ${throughputPerWeek ?? '—'}/wk throughput` : 'Not enough completed work in this period.',
      evidence: [
        { label: 'Completion', value: completionPct !== null ? `${completionPct}%` : '—' },
        { label: 'Throughput', value: throughputPerWeek !== null ? `${throughputPerWeek}/wk` : '—' },
        { label: 'Lead time', value: avgLeadTimeDays !== null ? `${avgLeadTimeDays}d` : '—' },
        { label: 'Main work type', value: workTypeData[0]?.name || '—' },
      ],
    },
    planning: {
      level: levelFromPct(planningPct, 92, 80, 65),
      summary: `Estimate accuracy ${estimateAccuracyPct ?? '—'}%, coverage ${estimateCoveragePct ?? '—'}%, on-time ${onTimePct ?? '—'}%.`,
      evidence: [
        { label: 'Estimate accuracy', value: estimateAccuracyPct !== null ? `${estimateAccuracyPct}%` : '—' },
        { label: 'Estimate coverage', value: estimateCoveragePct !== null ? `${estimateCoveragePct}%` : '—' },
        { label: 'On-time delivery', value: onTimePct !== null ? `${onTimePct}%` : '—' },
        { label: 'Refactor/chore mix', value: `${(byWorkType.refactor || 0) + (byWorkType.chore || 0)}` },
      ],
    },
    quality: {
      level: levelFromPct(qualityStrengthPct ?? qualityPct, 90, 75, 60),
      summary: `Bug fix ${bugPct ?? '—'}%, reopen ${reopenRatePct ?? '—'}%, testing bounce-back ${testingBounceBackPct ?? '—'}%.`,
      evidence: [
        { label: 'Bug fix rate', value: bugPct !== null ? `${bugPct}%` : '—' },
        { label: 'Reopen rate', value: reopenRatePct !== null ? `${reopenRatePct}%` : '—' },
        { label: 'Testing bounce-back', value: testingBounceBackPct !== null ? `${testingBounceBackPct}%` : '—' },
        { label: 'Overdue open', value: overdueOpenTasks.length },
        { label: 'Bug volume', value: byWorkType.bug || 0 },
      ],
    },
    flow: {
      level: levelFromInverseDays(avgAgingDays, 4, 7, 12),
      summary: `${activeTasks.length} active, ${blockedTasks.length} blocked, aging ${avgAgingDays ?? '—'}d, review bounce-back ${reviewBounceBackPct ?? '—'}%.`,
      evidence: [
        { label: 'Aging WIP', value: avgAgingDays !== null ? `${avgAgingDays}d` : '—' },
        { label: 'Blocked ratio', value: blockedPct !== null ? `${blockedPct}%` : '—' },
        { label: 'Review bounce-back', value: reviewBounceBackPct !== null ? `${reviewBounceBackPct}%` : '—' },
        { label: 'Active tasks', value: activeTasks.length },
        { label: 'Support load', value: byWorkType.support || 0 },
      ],
    },
  }

  return {
    totalTasks: myTasks.length,
    doneTasks: doneTasks.length,
    activeTasks: activeTasks.length,
    blockedTasks: blockedTasks.length,
    totalBugs: myBugs.length,
    doneBugs: doneBugs.length,
    estimatedHours: msToHours(totalEst),
    trackedHours: msToHours(totalTracked),
    parentEstimatedHours: msToHours(estimateTracked.parentEstimatedMs),
    parentTrackedHours: msToHours(estimateTracked.parentTrackedMs),
    subtaskEstimatedHours: msToHours(estimateTracked.subtaskEstimatedMs),
    subtaskTrackedHours: msToHours(estimateTracked.subtaskTrackedMs),
    parentTaskCount: estimateTracked.parentTaskCount,
    subtaskCount: estimateTracked.subtaskCount,
    estimateAccuracyPct,
    estimateCoveragePct,
    sprintCompletionPct,
    completionPct,
    bugPct,
    onTimePct,
    dueDatedDoneTasks: dueDatedDoneTasks.length,
    onTimeDoneTasks: onTimeDoneTasks.length,
    overdueOpenTasks: overdueOpenTasks.length,
    blockedPct,
    throughputPerWeek,
    reopenRatePct,
    reviewBounceBackPct,
    testingBounceBackPct,
    byWorkType,
    byWorkTypeByList,
    workTypeData,
    classifiedBugCount: byWorkType.bug || 0,
    bugListAssignedCount: myBugs.length,
    estimateAccuracyScore,
    bugScore,
    completionScore,
    onTimeScore,
    kpiWeightedScore: kpiWeightedScore !== null ? kpiWeightedScore.toFixed(1) : null,
    competencyScore: competencyScore !== null ? competencyScore.toFixed(1) : null,
    competencyLevelsFilled: competencyLevels.length,
    weightedScore,
    avgCycleTimeDays:     avgCycleTime     ? msToDays(avgCycleTime)     : null,
    avgFullCycleTimeDays: avgFullCycleTime ? msToDays(avgFullCycleTime) : null,
    avgLeadTimeDays,
    avgAgingDays,
    competencies,
  }
}

export function calcSprintStats(tasks, bugTasks, cycleTimeMap = {}, cycleMetaMap = {}) {
  const estimateTracked = summarizeEstimateTracked(tasks)
  const totalEst = estimateTracked.allEstimatedMs
  const totalTracked = estimateTracked.allTrackedMs
  const doneTasks = tasks.filter(isDone)
  const activeTasks = tasks.filter(isActive)
  const notStartedTasks = tasks.filter(isNotStarted)
  const canceledTasks = tasks.filter(isCanceledInSprint)
  const parentTasks = tasks.filter(t => !t.parent)
  const missingInProgressParents = parentTasks.filter(t => {
    const meta = cycleMetaMap[t.id]
    return meta && meta.hasInProgress === false && !isCanceledInSprint(t)
  })
  const blockedTasks = tasks.filter(isBlocked)  // awaiting rc solution
  const doneBugs = bugTasks.filter(isDone)

  // Detailed per-status counts (for the funnel/bar chart)
  const byStatus = {}
  tasks.forEach(t => {
    const s = normalizeStatus(t)
    byStatus[s] = (byStatus[s] || 0) + 1
  })
  // Build ordered status chart data using STATUS_ORDER
  const statusChartData = STATUS_ORDER
    .filter(s => byStatus[s] > 0)
    .map(s => ({ name: s, value: byStatus[s], color: STATUS_COLOR[s] || '#555560' }))

  // Cycle times — parent tasks only (no subtasks)
  const devCycleTimes  = parentTasks.map(t => getCycleTimes(t, cycleTimeMap).devCycleMs).filter(Boolean)
  const fullCycleTimes = parentTasks.map(t => getCycleTimes(t, cycleTimeMap).fullCycleMs).filter(Boolean)

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const avgCycleTime     = avg(devCycleTimes)
  const minCycleTime     = devCycleTimes.length  ? Math.min(...devCycleTimes)  : null
  const maxCycleTime     = devCycleTimes.length  ? Math.max(...devCycleTimes)  : null
  const avgFullCycleTime = avg(fullCycleTimes)
  const minFullCycleTime = fullCycleTimes.length ? Math.min(...fullCycleTimes) : null
  const maxFullCycleTime = fullCycleTimes.length ? Math.max(...fullCycleTimes) : null

  // Story points / velocity
  const totalPoints = tasks.reduce((s, t) => s + (parseFloat(t.points) || 0), 0)
  const donePoints = doneTasks.reduce((s, t) => s + (parseFloat(t.points) || 0), 0)

  const doneAt = t => parseInt(t.date_done || t.date_closed) || null
  const createdAt = t => parseInt(t.date_created) || null
  const dueAt = t => parseInt(t.due_date) || null
  const now = Date.now()

  const leadTimes = doneTasks
    .map(t => {
      const created = createdAt(t)
      const done = doneAt(t)
      return created && done && done > created ? done - created : null
    })
    .filter(Boolean)
  const avgLeadTime = avg(leadTimes)

  const agingTimes = activeTasks
    .map(t => {
      const created = createdAt(t)
      return created && now > created ? now - created : null
    })
    .filter(Boolean)
  const avgAgingTime = avg(agingTimes)

  const dueDatedDoneTasks = doneTasks.filter(t => dueAt(t) && doneAt(t))
  const onTimeDoneTasks = dueDatedDoneTasks.filter(t => isTaskOnTime(t, doneAt(t), dueAt(t)))

  const timelineCandidates = tasks.flatMap(t => [createdAt(t), doneAt(t)]).filter(Boolean)
  const minTimeline = timelineCandidates.length ? Math.min(...timelineCandidates) : null
  const maxTimeline = timelineCandidates.length ? Math.max(...timelineCandidates, now) : null
  const windowDays = minTimeline && maxTimeline && maxTimeline > minTimeline
    ? Math.max(1, Math.round((maxTimeline - minTimeline) / 86400000))
    : null
  const throughputPerWeek = windowDays ? Math.round((doneTasks.length / (windowDays / 7)) * 10) / 10 : null
  const { byWorkType, workTypeData, byWorkTypeByList } = summarizeWorkMix(tasks)
  const qualityMeta = parentTasks
    .map(task => cycleMetaMap[task.id])
    .filter(Boolean)
  const reopenedTasks = qualityMeta.filter(meta => (meta.reopenCount || 0) > 0).length
  const reviewBounceBackTasks = qualityMeta.filter(meta => (meta.reviewBounceBackCount || 0) > 0).length
  const testingBounceBackTasks = qualityMeta.filter(meta => (meta.testingBounceBackCount || 0) > 0).length
  const qualityMeasuredTasks = qualityMeta.length
  const reopenRatePct = qualityMeasuredTasks > 0 ? Math.round((reopenedTasks / qualityMeasuredTasks) * 100) : null
  const reviewBounceBackPct = qualityMeasuredTasks > 0 ? Math.round((reviewBounceBackTasks / qualityMeasuredTasks) * 100) : null
  const testingBounceBackPct = qualityMeasuredTasks > 0 ? Math.round((testingBounceBackTasks / qualityMeasuredTasks) * 100) : null
  const weeklyTrendData = buildWeeklyTrendData(tasks, bugTasks, cycleMetaMap)

  // Per-assignee breakdown
  const assigneeMap = {}
  tasks.forEach(t => {
    ;(t.assignees || []).forEach(a => {
      if (!assigneeMap[a.id])
        assigneeMap[a.id] = { id: a.id, name: a.username || a.email, tasks: [], done: 0, active: 0, notStarted: 0, est: 0, tracked: 0 }
      assigneeMap[a.id].tasks.push(t)
      if (isDone(t)) assigneeMap[a.id].done++
      else if (isActive(t)) assigneeMap[a.id].active++
      else if (isNotStarted(t)) assigneeMap[a.id].notStarted++
      assigneeMap[a.id].est += parseInt(t.time_estimate) || 0
      assigneeMap[a.id].tracked += t.time_spent || 0
    })
  })

  // Priority breakdown
  const byPriority = { urgent: 0, high: 0, normal: 0, low: 0, none: 0 }
  tasks.forEach(t => {
    const p = (t.priority?.priority || 'none').toLowerCase()
    byPriority[p] = (byPriority[p] || 0) + 1
  })

  const noEstimate = tasks.filter(t => !t.time_estimate || parseInt(t.time_estimate) === 0).length
  const overdue = tasks.filter(t => !isDone(t) && t.due_date && parseInt(t.due_date) < now).length

  // Pipeline counts — how many tasks are waiting at each handoff stage
  const pipeline = {
    awaitingReview: tasks.filter(t => normalizeStatus(t) === 'awaiting review').length,
    inReview: tasks.filter(t => normalizeStatus(t) === 'in-review').length,
    awaitingTesting: tasks.filter(t => normalizeStatus(t) === 'awaiting testing').length,
    inTesting: tasks.filter(t => normalizeStatus(t) === 'in-testing').length,
    awaitingAcceptance: tasks.filter(t => normalizeStatus(t) === 'awaiting acceptance').length,
    awaitingOpsValidation: tasks.filter(t =>
      normalizeStatus(t) === 'awaiting ops validation' || normalizeStatus(t) === 'awaiting ops validati...'
    ).length,
    awaitingQcValidation: tasks.filter(t => normalizeStatus(t) === 'awaiting qc validation').length,
  }

  return {
    totalTasks: tasks.length,
    committedParentTasks: parentTasks.length,
    doneTasks: doneTasks.length,
    activeTasks: activeTasks.length,
    notStarted: notStartedTasks.length,
    canceled: canceledTasks.length,
    noInProgressHistory: missingInProgressParents.length,
    blocked: blockedTasks.length,
    completionPct: tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
    historicalCompletionPct: tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
    estimatedHours: msToHours(totalEst),
    trackedHours: msToHours(totalTracked),
    parentEstimatedHours: msToHours(estimateTracked.parentEstimatedMs),
    parentTrackedHours: msToHours(estimateTracked.parentTrackedMs),
    subtaskEstimatedHours: msToHours(estimateTracked.subtaskEstimatedMs),
    subtaskTrackedHours: msToHours(estimateTracked.subtaskTrackedMs),
    parentTaskCount: estimateTracked.parentTaskCount,
    subtaskCount: estimateTracked.subtaskCount,
    estimateAccuracyPct: totalEst > 0 ? Math.min(100, Math.round((totalTracked / totalEst) * 100)) : null,
    sprintCompletionPct: tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
    onTimePct: dueDatedDoneTasks.length > 0 ? Math.round((onTimeDoneTasks.length / dueDatedDoneTasks.length) * 100) : null,
    dueDatedDoneTasks: dueDatedDoneTasks.length,
    onTimeDoneTasks: onTimeDoneTasks.length,
    totalBugs: bugTasks.length,
    doneBugs: doneBugs.length,
    bugFixPct: bugTasks.length > 0 ? Math.round((doneBugs.length / bugTasks.length) * 100) : null,
    avgLeadTimeDays: avgLeadTime ? msToDays(avgLeadTime) : null,
    avgAgingDays: avgAgingTime ? msToDays(avgAgingTime) : null,
    throughputPerWeek,
    throughputWindowDays: windowDays,
    qualityMeasuredTasks,
    reopenedTasks,
    reviewBounceBackTasks,
    testingBounceBackTasks,
    reopenRatePct,
    reviewBounceBackPct,
    testingBounceBackPct,
    byWorkType,
    byWorkTypeByList,
    workTypeData,
    classifiedBugCount: byWorkType.bug || 0,
    bugListTaskCount: bugTasks.length,
    weeklyTrendData,
    avgCycleTimeDays:     avgCycleTime     ? msToDays(avgCycleTime)     : null,
    minCycleTimeDays:     minCycleTime     ? msToDays(minCycleTime)     : null,
    maxCycleTimeDays:     maxCycleTime     ? msToDays(maxCycleTime)     : null,
    avgFullCycleTimeDays: avgFullCycleTime ? msToDays(avgFullCycleTime) : null,
    minFullCycleTimeDays: minFullCycleTime ? msToDays(minFullCycleTime) : null,
    maxFullCycleTimeDays: maxFullCycleTime ? msToDays(maxFullCycleTime) : null,
    totalPoints,
    donePoints,
    velocityPct: totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : null,
    assigneeBreakdown: Object.values(assigneeMap),
    byPriority,
    byStatus,
    statusChartData,
    pipeline,
    noEstimate,
    overdue,
  }
}

// ─── Garment IO status taxonomy ───────────────────────────────────────────────
//
// NOT STARTED   → new, open, ready
// ACTIVE        → incomplete, in-progress, in-review, awaiting review,
//                 reviewed, awaiting testing, in-testing, awaiting rc solution
// DONE          → awaiting acceptance, accepted, completed,
//                 awaiting ops validation, awaiting qc validation,
//                 needs-info, prod beta, production
// CLOSED        → production  (also counts as done)
//
// Cycle time is measured from first ACTIVE status → first DONE status.
// "Awaiting acceptance / ops / qc validation" are done from dev perspective —
// the code is shipped, we're waiting for sign-off, not for more dev work.
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_NOT_STARTED = new Set(['new', 'open', 'ready'])

const STATUS_CANCELED = new Set(['canceled', 'cancelled', 'rejected'])
const STATUS_CANCELED_IN_SPRINT = new Set(['canceled', 'cancelled', 'rejected', 'incomplete'])

const STATUS_ACTIVE = new Set([
  'incomplete',
  'in-progress',
  'in-review',
  'awaiting review',
  'reviewed',
  'awaiting testing',
  'in-testing',
  'awaiting rc solution',
])

const STATUS_DONE = new Set([
  'awaiting acceptance',
  'accepted',
  'completed',
  'awaiting ops validation',
  'awaiting ops validati...', // ClickUp truncates long names in API
  'awaiting qc validation',
  'needs-info',
  'prod beta',
  'production',
])

export function normalizeStatus(t) {
  const s = (t.status?.status || '').toLowerCase().trim()
  if (s === 'in progress') return 'in-progress'
  if (s === 'waiting for testing') return 'awaiting testing'
  if (s === 'in testing') return 'in-testing'
  if (s === 'waiting for review') return 'awaiting review'
  if (s === 'waiting for uat') return 'awaiting acceptance'
  if (s === 'ready for development') return 'ready'
  return s
}

export function isDone(t) {
  return STATUS_DONE.has(normalizeStatus(t))
}

export function isActive(t) {
  return STATUS_ACTIVE.has(normalizeStatus(t))
}

export function isNotStarted(t) {
  return STATUS_NOT_STARTED.has(normalizeStatus(t))
}

export function isCanceled(t) {
  return STATUS_CANCELED.has(normalizeStatus(t))
}

export function isCanceledInSprint(t) {
  return STATUS_CANCELED_IN_SPRINT.has(normalizeStatus(t))
}

// Kept for backward compat — maps to isActive
export function isInProgress(t) {
  return isActive(t)
}

export function isBlocked(t) {
  // No explicit blocked status — treat awaiting rc solution as closest proxy
  return normalizeStatus(t) === 'awaiting rc solution'
}

export function getWorkTypeHelp(typeLabel, byWorkTypeByList = {}) {
  const key = typeLabel.toLowerCase() === 'features' ? 'feature'
    : typeLabel.toLowerCase() === 'bugs' ? 'bug'
    : typeLabel.toLowerCase() === 'chores' ? 'chore'
    : typeLabel.toLowerCase()
  return formatWorkTypeSources(key, byWorkTypeByList[key])
}

// Human-readable label for the status group
export function statusGroup(t) {
  const s = normalizeStatus(t)
  if (STATUS_NOT_STARTED.has(s)) return 'not started'
  if (STATUS_CANCELED.has(s)) return 'canceled'
  if (STATUS_ACTIVE.has(s)) return 'active'
  if (STATUS_DONE.has(s)) return 'done'
  return 'unknown'
}

// All unique statuses for the sprint status breakdown chart,
// preserving their logical order
export const STATUS_ORDER = [
  'new', 'open', 'ready',
  'canceled', 'cancelled', 'rejected',
  'incomplete', 'in-progress', 'in-review', 'awaiting review',
  'reviewed', 'awaiting testing', 'in-testing', 'awaiting rc solution',
  'awaiting acceptance', 'accepted', 'completed',
  'awaiting ops validation', 'awaiting qc validation',
  'needs-info', 'prod beta', 'production',
]

export const STATUS_COLOR = {
  // not started — gray tones
  'new': '#555560',
  'open': '#555560',
  'ready': '#888890',
  'canceled': '#f0524f',
  'cancelled': '#f0524f',
  'rejected': '#f0524f',
  // active — blue tones
  'incomplete': '#4f7cff',
  'in-progress': '#4f7cff',
  'in-review': '#06b6d4',
  'awaiting review': '#06b6d4',
  'reviewed': '#06b6d4',
  'awaiting testing': '#a855f7',
  'in-testing': '#a855f7',
  'awaiting rc solution': '#f0524f',
  // done — green tones
  'awaiting acceptance': '#3ecf8e',
  'accepted': '#3ecf8e',
  'completed': '#3ecf8e',
  'awaiting ops validation': '#3ecf8e',
  'awaiting ops validati...': '#3ecf8e',
  'awaiting qc validation': '#3ecf8e',
  'needs-info': '#f5a623',
  'prod beta': '#3ecf8e',
  'production': '#3ecf8e',
}
