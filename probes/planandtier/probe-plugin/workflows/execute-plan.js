export const meta = {
  name: 'execute-plan',
  description: 'Spike: run each task at its tagged model and effort, one at a time',
}

// P5: record what type the hook-supplied args arrive as.
log(`args typeof: ${typeof args}`)
log(`args raw: ${JSON.stringify(args)}`)

let input = args
if (typeof args === 'string') {
  try {
    input = JSON.parse(args)
  } catch {
    input = undefined
  }
}

// If the hook's args did not arrive, run a single-task matrix so P6 still gets an answer.
const tasks = Array.isArray(input?.tasks)
  ? input.tasks
  : [
      {
        id: 'T01',
        title: 'fallback sonnet low',
        model: 'sonnet',
        effort: 'low',
        prompt:
          'Reply with status "done". In summary, state the exact model name you are running as ' +
          'and whether you can call the Agent tool (yes or no).',
      },
    ]

const resultSchema = {
  type: 'object',
  required: ['status', 'summary'],
  properties: {
    status: { type: 'string', enum: ['done', 'failed'] },
    summary: { type: 'string' },
  },
}

// P6, P7: a task that fails or throws is recorded and the run continues, so one
// rejected model/effort pair does not hide the rest of the matrix.
const results = []
for (const task of tasks) {
  phase(`${task.id}: ${task.title}`)
  try {
    const result = await agent(task.prompt, {
      label: task.id,
      model: task.model,
      effort: task.effort,
      agentType: 'planandtier-probe:worker',
      schema: resultSchema,
    })
    results.push({ id: task.id, model: task.model, effort: task.effort, ...(result ?? { status: 'stopped' }) })
  } catch (e) {
    results.push({ id: task.id, model: task.model, effort: task.effort, status: 'threw', summary: String(e) })
  }
}
return { argsType: typeof args, tasksFromArgs: Array.isArray(input?.tasks), results }
