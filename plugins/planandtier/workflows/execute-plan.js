export const meta = {
  name: 'execute-plan',
  description: 'Run an approved planandtier plan one task at a time, each at its tagged model and effort',
}

// The plugin's hook fills args.tasks from the approved plan, so this script never parses
// plan text and no model recalls the tasks.
const tasks = args?.tasks
if (!Array.isArray(tasks) || tasks.length === 0) {
  return {
    status: 'error',
    message:
      'No tasks were supplied. Approve a plan in plan mode, then launch this workflow through ' +
      'Claude, so the plugin can supply the approved tasks.',
  }
}

const resultSchema = {
  type: 'object',
  required: ['status', 'summary'],
  properties: {
    status: { type: 'string', enum: ['done', 'failed'] },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
  },
}

const results = []
for (const task of tasks) {
  phase(`${task.id}: ${task.title}`)
  let result
  try {
    result = await agent(task.prompt, {
      label: task.id,
      model: task.model,
      effort: task.effort,
      agentType: 'planandtier:worker',
      schema: resultSchema,
    })
  } catch (e) {
    result = { status: 'failed', summary: `The task threw: ${String(e)}` }
  }
  results.push({ id: task.id, ...(result ?? { status: 'stopped', summary: 'The task was stopped or its subagent failed.' }) })
  if (!result || result.status !== 'done') {
    log(`Halting at ${task.id}`)
    return { status: 'halted', at: task.id, results }
  }
}
return { status: 'complete', results }
