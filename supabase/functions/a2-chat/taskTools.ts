// ============================================================
// A2 TASK TOOLS
// Converts natural-language task requests into safe database
// actions for A2's Today system.
// ============================================================

type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  status:
    | 'open'
    | 'in_progress'
    | 'completed'
    | 'cancelled';
  priority: number;
  due_at: string | null;
};

type PlannedTaskAction = {
  action:
    | 'none'
    | 'create'
    | 'update'
    | 'start'
    | 'complete'
    | 'reopen'
    | 'delete'
    | 'list';

  target_task_id: string | null;

  title: string | null;
  notes: string | null;
  priority: number | null;
  due_at: string | null;

  clear_due_date: boolean;
};

type TaskPlan = {
  needs_clarification: boolean;
  clarification_question: string | null;
  actions: PlannedTaskAction[];
};

export type TaskToolResult = {
  handled: boolean;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  context: string;
};

// ============================================================
// OPENAI OUTPUT HELPER
// ============================================================

function getOutputText(data: any): string {
  if (
    typeof data?.output_text === 'string' &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return '';
  }

  const parts: string[] = [];

  for (const item of data.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content?.type === 'output_text' &&
        typeof content?.text === 'string'
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

// ============================================================
// DISPLAY EXISTING TASKS TO THE PLANNER
// ============================================================

function buildTaskList(
  tasks: TaskRow[]
): string {
  if (!tasks.length) {
    return 'No existing tasks.';
  }

  return tasks
    .map((task) => {
      return [
        `ID: ${task.id}`,
        `Title: ${task.title}`,
        `Status: ${task.status}`,
        `Priority: ${task.priority}`,
        `Due: ${task.due_at ?? 'none'}`,
        `Notes: ${task.notes ?? 'none'}`,
      ].join(' | ');
    })
    .join('\n');
}

// ============================================================
// HUMAN-READABLE TASK RESULT FOR MAIN A2
// ============================================================

function describeTask(
  task: TaskRow
): string {
  const due =
    task.due_at
      ? ` Due: ${task.due_at}.`
      : '';

  return `${task.title} — ${task.status}, priority ${task.priority}.${due}`;
}

// ============================================================
// MAIN TASK INTENT PROCESSOR
// ============================================================

export async function processTaskIntent({
  openAIKey,
  supabase,
  userId,
  message,
  clientNow,
  clientTimezone,
}: {
  openAIKey: string;
  supabase: any;
  userId: string;
  message: string;
  clientNow: string;
  clientTimezone: string;
}): Promise<TaskToolResult> {
  try {
    // --------------------------------------------------------
    // LOAD USER'S CURRENT TASKS
    // --------------------------------------------------------

    const {
      data: taskRows,
      error: taskLoadError,
    } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        notes,
        status,
        priority,
        due_at
      `)
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .order('created_at', {
        ascending: false,
      })
      .limit(50);

    if (taskLoadError) {
      console.error(
        'A2 task tool load error:',
        taskLoadError
      );

      return {
        handled: false,
        needsClarification: false,
        clarificationQuestion: null,
        context:
          'A2 attempted to access Today tasks but could not load them.',
      };
    }

    const existingTasks =
      (taskRows ?? []) as TaskRow[];

    // --------------------------------------------------------
    // ASK OPENAI WHETHER THE MESSAGE CONTAINS A TASK ACTION
    // --------------------------------------------------------

    const plannerResponse =
      await fetch(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${openAIKey}`,

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            model: 'gpt-5.6-luna',

            store: false,

            instructions: `
You are A2's private task-action planner.

You do NOT respond conversationally.

You inspect the user's latest message and decide whether it asks A2 to interact with the user's Today task system.

SUPPORTED ACTIONS

none
The message does not request task management.

create
Create a new task.

update
Change an existing task's title, notes, priority, or due date.

start
Set an existing task to in_progress.

complete
Mark an existing task completed.

reopen
Return a completed task to open.

delete
Permanently delete a task.

list
The user is asking what tasks they have, what is due, what is overdue, etc.

IMPORTANT SAFETY RULES

- Never create a task merely because the user mentions something they might do.
- Only act when task intent is reasonably clear.
- Never delete a task unless deletion is explicitly requested.
- Match existing tasks conservatively.
- Use target_task_id only when the intended existing task is clear.
- If multiple existing tasks could match, request clarification.
- Never invent a task ID.
- Return at most 3 actions.

CREATE RULES

For create:
- title should be short and action-oriented.
- notes may contain useful extra context.
- priority defaults to 3 unless the user indicates urgency or importance.
- priority must be 1 through 5.
- due_at may be null when no timing is requested.

TIME RULES

The user's current local date/time and timezone are supplied below.

Convert explicit dates/times into ISO 8601.

Examples:
"tomorrow afternoon" can reasonably mean 15:00 local time.
"tomorrow morning" can reasonably mean 08:00 local time.
"tomorrow evening" can reasonably mean 19:00 local time.

If the user explicitly asks to be reminded or complete something on a particular day but gives no time or daypart, request clarification rather than inventing a clock time.

If the user simply asks to add something to their task list without a date, due_at should be null.

UPDATE RULES

For update:
- null fields mean leave that field unchanged.
- clear_due_date=true means remove the due date.
- target_task_id must identify the existing task.

LIST RULES

For list:
- no database mutation is needed.
- use one list action.

CLARIFICATION

Set needs_clarification=true only when A2 cannot safely perform the intended task action without additional information.

Examples:
- "remind me tomorrow" with no task specified
- ambiguous matching between multiple existing tasks
- an explicitly requested reminder date with no time/daypart

Do not ask unnecessary questions.
            `.trim(),

            input: [
              {
                role: 'user',

                content: `
CURRENT LOCAL TIME

${clientNow}

TIMEZONE

${clientTimezone}

EXISTING TASKS

${buildTaskList(existingTasks)}

LATEST USER MESSAGE

${message}
                `.trim(),
              },
            ],

            text: {
              format: {
                type: 'json_schema',

                name:
                  'a2_task_action_plan',

                strict: true,

                schema: {
                  type: 'object',

                  additionalProperties:
                    false,

                  properties: {
                    needs_clarification: {
                      type: 'boolean',
                    },

                    clarification_question: {
                      anyOf: [
                        {
                          type: 'string',
                        },
                        {
                          type: 'null',
                        },
                      ],
                    },

                    actions: {
                      type: 'array',

                      maxItems: 3,

                      items: {
                        type: 'object',

                        additionalProperties:
                          false,

                        properties: {
                          action: {
                            type: 'string',

                            enum: [
                              'none',
                              'create',
                              'update',
                              'start',
                              'complete',
                              'reopen',
                              'delete',
                              'list',
                            ],
                          },

                          target_task_id: {
                            anyOf: [
                              {
                                type: 'string',
                              },
                              {
                                type: 'null',
                              },
                            ],
                          },

                          title: {
                            anyOf: [
                              {
                                type: 'string',
                              },
                              {
                                type: 'null',
                              },
                            ],
                          },

                          notes: {
                            anyOf: [
                              {
                                type: 'string',
                              },
                              {
                                type: 'null',
                              },
                            ],
                          },

                          priority: {
                            anyOf: [
                              {
                                type: 'integer',
                                minimum: 1,
                                maximum: 5,
                              },
                              {
                                type: 'null',
                              },
                            ],
                          },

                          due_at: {
                            anyOf: [
                              {
                                type: 'string',
                              },
                              {
                                type: 'null',
                              },
                            ],
                          },

                          clear_due_date: {
                            type: 'boolean',
                          },
                        },

                        required: [
                          'action',
                          'target_task_id',
                          'title',
                          'notes',
                          'priority',
                          'due_at',
                          'clear_due_date',
                        ],
                      },
                    },
                  },

                  required: [
                    'needs_clarification',
                    'clarification_question',
                    'actions',
                  ],
                },
              },
            },

            max_output_tokens: 700,
          }),
        }
      );

    const plannerData =
      await plannerResponse.json();

    if (!plannerResponse.ok) {
      console.error(
        'A2 task planner OpenAI error:',
        JSON.stringify(plannerData)
      );

      return {
        handled: false,
        needsClarification: false,
        clarificationQuestion: null,
        context:
          'No task action was performed.',
      };
    }

    const plannerText =
      getOutputText(plannerData);

    if (!plannerText) {
      return {
        handled: false,
        needsClarification: false,
        clarificationQuestion: null,
        context:
          'No task action was detected.',
      };
    }

    let plan: TaskPlan;

    try {
      plan =
        JSON.parse(plannerText);
    } catch (error) {
      console.error(
        'A2 task plan JSON error:',
        error
      );

      return {
        handled: false,
        needsClarification: false,
        clarificationQuestion: null,
        context:
          'No task action was performed.',
      };
    }

    // --------------------------------------------------------
    // CLARIFICATION NEEDED
    // --------------------------------------------------------

    if (
      plan.needs_clarification
    ) {
      return {
        handled: true,

        needsClarification:
          true,

        clarificationQuestion:
          plan.clarification_question ||
          'What details should I use for that task?',

        context:
          'The requested task action needs clarification before A2 changes the task system.',
      };
    }

    const actions =
      Array.isArray(plan.actions)
        ? plan.actions.slice(0, 3)
        : [];

    if (
      actions.length === 0 ||
      actions.every(
        (action) =>
          action.action === 'none'
      )
    ) {
      return {
        handled: false,
        needsClarification: false,
        clarificationQuestion: null,
        context:
          'The latest message did not request a Today task action.',
      };
    }

    // --------------------------------------------------------
    // EXECUTE ACTIONS
    // --------------------------------------------------------

    const results: string[] = [];

    for (const action of actions) {
      // ------------------------------------------------------
      // NONE
      // ------------------------------------------------------

      if (
        action.action === 'none'
      ) {
        continue;
      }

      // ------------------------------------------------------
      // LIST
      // ------------------------------------------------------

      if (
        action.action === 'list'
      ) {
        if (
          existingTasks.length === 0
        ) {
          results.push(
            'The user currently has no tasks.'
          );
        } else {
          results.push(
            `Current tasks:\n${existingTasks
              .map(
                (task) =>
                  `- ${describeTask(task)}`
              )
              .join('\n')}`
          );
        }

        continue;
      }

      // ------------------------------------------------------
      // CREATE
      // ------------------------------------------------------

      if (
        action.action === 'create'
      ) {
        if (
          !action.title?.trim()
        ) {
          results.push(
            'A requested task could not be created because it had no title.'
          );

          continue;
        }

        const {
          data: createdTask,
          error: createError,
        } = await supabase
          .from('tasks')
          .insert({
            user_id:
              userId,

            title:
              action.title.trim(),

            notes:
              action.notes?.trim() ||
              null,

            priority:
              action.priority ?? 3,

            due_at:
              action.due_at,

            status:
              'open',

            source:
              'a2',
          })
          .select(`
            id,
            title,
            notes,
            status,
            priority,
            due_at
          `)
          .single();

        if (createError) {
          console.error(
            'A2 task create error:',
            createError
          );

          results.push(
            `A2 could not create "${action.title}".`
          );

          continue;
        }

        results.push(
          `Created task: ${describeTask(
            createdTask as TaskRow
          )}`
        );

        continue;
      }

      // All remaining actions need an existing task ID.

      if (
        !action.target_task_id
      ) {
        results.push(
          `A2 could not safely perform the ${action.action} action because no task was clearly matched.`
        );

        continue;
      }

      const matchedTask =
        existingTasks.find(
          (task) =>
            task.id ===
            action.target_task_id
        );

      if (!matchedTask) {
        results.push(
          `A2 could not find the task selected for ${action.action}.`
        );

        continue;
      }

      // ------------------------------------------------------
      // UPDATE
      // ------------------------------------------------------

      if (
        action.action === 'update'
      ) {
        const updates:
          Record<string, any> = {};

        if (
          action.title !== null &&
          action.title.trim()
        ) {
          updates.title =
            action.title.trim();
        }

        if (
          action.notes !== null
        ) {
          updates.notes =
            action.notes.trim() ||
            null;
        }

        if (
          action.priority !== null
        ) {
          updates.priority =
            action.priority;
        }

        if (
          action.clear_due_date
        ) {
          updates.due_at =
            null;
        } else if (
          action.due_at !== null
        ) {
          updates.due_at =
            action.due_at;
        }

        if (
          Object.keys(updates)
            .length === 0
        ) {
          results.push(
            `No changes were needed for "${matchedTask.title}".`
          );

          continue;
        }

        const {
          data: updatedTask,
          error: updateError,
        } = await supabase
          .from('tasks')
          .update(updates)
          .eq(
            'id',
            matchedTask.id
          )
          .eq(
            'user_id',
            userId
          )
          .select(`
            id,
            title,
            notes,
            status,
            priority,
            due_at
          `)
          .single();

        if (updateError) {
          console.error(
            'A2 task update error:',
            updateError
          );

          results.push(
            `A2 could not update "${matchedTask.title}".`
          );

          continue;
        }

        results.push(
          `Updated task: ${describeTask(
            updatedTask as TaskRow
          )}`
        );

        continue;
      }

      // ------------------------------------------------------
      // START
      // ------------------------------------------------------

      if (
        action.action === 'start'
      ) {
        const {
          error,
        } = await supabase
          .from('tasks')
          .update({
            status:
              'in_progress',

            completed_at:
              null,
          })
          .eq(
            'id',
            matchedTask.id
          )
          .eq(
            'user_id',
            userId
          );

        if (error) {
          console.error(
            'A2 task start error:',
            error
          );

          results.push(
            `A2 could not start "${matchedTask.title}".`
          );
        } else {
          results.push(
            `Started task: ${matchedTask.title}.`
          );
        }

        continue;
      }

      // ------------------------------------------------------
      // COMPLETE
      // ------------------------------------------------------

      if (
        action.action ===
        'complete'
      ) {
        const {
          error,
        } = await supabase
          .from('tasks')
          .update({
            status:
              'completed',

            completed_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            matchedTask.id
          )
          .eq(
            'user_id',
            userId
          );

        if (error) {
          console.error(
            'A2 task completion error:',
            error
          );

          results.push(
            `A2 could not complete "${matchedTask.title}".`
          );
        } else {
          results.push(
            `Completed task: ${matchedTask.title}.`
          );
        }

        continue;
      }

      // ------------------------------------------------------
      // REOPEN
      // ------------------------------------------------------

      if (
        action.action ===
        'reopen'
      ) {
        const {
          error,
        } = await supabase
          .from('tasks')
          .update({
            status:
              'open',

            completed_at:
              null,
          })
          .eq(
            'id',
            matchedTask.id
          )
          .eq(
            'user_id',
            userId
          );

        if (error) {
          console.error(
            'A2 task reopen error:',
            error
          );

          results.push(
            `A2 could not reopen "${matchedTask.title}".`
          );
        } else {
          results.push(
            `Reopened task: ${matchedTask.title}.`
          );
        }

        continue;
      }

      // ------------------------------------------------------
      // DELETE
      // ------------------------------------------------------

      if (
        action.action ===
        'delete'
      ) {
        const {
          error,
        } = await supabase
          .from('tasks')
          .delete()
          .eq(
            'id',
            matchedTask.id
          )
          .eq(
            'user_id',
            userId
          );

        if (error) {
          console.error(
            'A2 task delete error:',
            error
          );

          results.push(
            `A2 could not delete "${matchedTask.title}".`
          );
        } else {
          results.push(
            `Deleted task: ${matchedTask.title}.`
          );
        }
      }
    }

    return {
      handled:
        results.length > 0,

      needsClarification:
        false,

      clarificationQuestion:
        null,

      context:
        results.length > 0
          ? results.join('\n')
          : 'No task action was performed.',
    };
  } catch (error) {
    console.error(
      'A2 task tool error:',
      error
    );

    return {
      handled: false,
      needsClarification: false,
      clarificationQuestion: null,
      context:
        'A2 encountered an internal task-system error and did not change any tasks.',
    };
  }
}