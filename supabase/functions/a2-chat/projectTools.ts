type ProjectStatus =
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'archived';

type ProjectPlannerAction =
  | 'none'
  | 'list'
  | 'inspect'
  | 'create'
  | 'update'
  | 'add_task';

type ProjectRow = {
  id: string;
  name: string;
  summary: string | null;
  objective: string | null;
  next_step: string | null;
  status: ProjectStatus;
  priority: number;
  last_activity_at: string;
};

type ProjectPlan = {
  action: ProjectPlannerAction;

  project_id: string | null;
  project_name: string | null;

  summary: string | null;
  objective: string | null;
  next_step: string | null;

  status:
    | ProjectStatus
    | null;

  priority: number | null;

  task_title: string | null;
  task_notes: string | null;
  task_priority: number | null;
  task_due_at: string | null;

  clarification_question:
    | string
    | null;
};

export type ProjectToolResult = {
  handled: boolean;

  needsClarification:
    boolean;

  clarificationQuestion:
    string | null;

  context: string;

  action?:
    ProjectPlannerAction;

  projectId?:
    string | null;

  projectName?:
    string | null;
};

// ============================================================
// RESPONSE TEXT
// ============================================================

function getOutputText(
  data: any
): string {
  if (
    typeof data?.output_text ===
      'string' &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (
    !Array.isArray(
      data?.output
    )
  ) {
    return '';
  }

  const parts: string[] = [];

  for (
    const item of data.output
  ) {
    if (
      !Array.isArray(
        item?.content
      )
    ) {
      continue;
    }

    for (
      const content of
      item.content
    ) {
      if (
        content?.type ===
          'output_text' &&
        typeof content?.text ===
          'string'
      ) {
        parts.push(
          content.text
        );
      }
    }
  }

  return parts
    .join('\n')
    .trim();
}

// ============================================================
// PROJECT RESOLUTION
// ============================================================

function resolveProject(
  projects: ProjectRow[],
  projectId: string | null,
  projectName: string | null
):
  | {
      project:
        ProjectRow | null;

      ambiguous:
        ProjectRow[];
    } {
  if (
    projectId
  ) {
    const byId =
      projects.find(
        (project) =>
          project.id ===
          projectId
      ) ??
      null;

    return {
      project:
        byId,

      ambiguous: [],
    };
  }

  const cleanName =
    projectName
      ?.trim()
      .toLowerCase();

  if (
    !cleanName
  ) {
    return {
      project: null,
      ambiguous: [],
    };
  }

  const exact =
    projects.find(
      (project) =>
        project.name
          .trim()
          .toLowerCase() ===
        cleanName
    );

  if (
    exact
  ) {
    return {
      project:
        exact,

      ambiguous: [],
    };
  }

  const partial =
    projects.filter(
      (project) => {
        const currentName =
          project.name
            .trim()
            .toLowerCase();

        return (
          currentName.includes(
            cleanName
          ) ||
          cleanName.includes(
            currentName
          )
        );
      }
    );

  if (
    partial.length ===
    1
  ) {
    return {
      project:
        partial[0],

      ambiguous: [],
    };
  }

  if (
    partial.length >
    1
  ) {
    return {
      project: null,
      ambiguous:
        partial,
    };
  }

  return {
    project: null,
    ambiguous: [],
  };
}

// ============================================================
// DISPLAY PROJECT
// ============================================================

function projectSummaryLine(
  project: ProjectRow
) {
  const parts = [
    `${project.name}`,
    `status=${project.status}`,
    `priority=${project.priority}`,
  ];

  if (
    project.next_step
  ) {
    parts.push(
      `next=${project.next_step}`
    );
  }

  return parts.join(
    ' | '
  );
}

// ============================================================
// MAIN PROJECT PLANNER
// ============================================================

export async function processProjectIntent({
  openAIKey,
  supabase,
  userId,
  message,
  clientNow,
  clientTimezone,
  recentConversation,
}: {
  openAIKey: string;
  supabase: any;
  userId: string;
  message: string;
  clientNow: string;
  clientTimezone: string;
  recentConversation: string;
}): Promise<ProjectToolResult> {
  try {
    // --------------------------------------------------------
    // LOAD PROJECTS
    // --------------------------------------------------------

    const {
      data:
        projectRows,

      error:
        projectLoadError,
    } = await supabase
      .from(
        'projects'
      )
      .select(`
        id,
        name,
        summary,
        objective,
        next_step,
        status,
        priority,
        last_activity_at
      `)
      .eq(
        'user_id',
        userId
      )
      .order(
        'last_activity_at',
        {
          ascending:
            false,
        }
      )
      .limit(50);

    if (
      projectLoadError
    ) {
      console.error(
        'A2 project planner load error:',
        projectLoadError
      );

      return {
        handled: false,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        context:
          'The Projects system could not be loaded.',
      };
    }

    const projects =
      (
        projectRows ??
        []
      ) as ProjectRow[];

    const projectContext =
      projects.length
        ? projects
            .map(
              projectSummaryLine
            )
            .join('\n')
        : 'No projects currently exist.';

    // --------------------------------------------------------
    // ASK MODEL TO CLASSIFY / PLAN
    // --------------------------------------------------------

    const response =
      await fetch(
        'https://api.openai.com/v1/responses',
        {
          method:
            'POST',

          headers: {
            Authorization:
              `Bearer ${openAIKey}`,

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              model:
                'gpt-5.6-luna',

              store:
                false,

              instructions: `
You are A2's private Project action planner.

You DO NOT speak directly to the user.

Your job is to determine whether the latest message requires an action or lookup in A2's persistent Projects system.

AVAILABLE ACTIONS

none
No Project operation is required.

list
The user wants to know what projects exist or their overall project status.

inspect
The user wants information about one existing project, including its objective, next step, status, or project tasks.

create
The user explicitly wants a new project created.

update
The user wants to modify an existing project's:
- summary
- objective
- next step
- status
- priority

add_task
The user wants to create a task belonging to a particular project.

IMPORTANT RULES

Do not create or modify anything unless the user's intent is clear.

Do not confuse ordinary discussion ABOUT something with an instruction to create a Project.

Examples:

"Tell me about Azucar"
may be none unless context clearly refers to the existing Project workspace.

"What's next for Azucar?"
should be inspect if Azucar is an existing project.

"Create an Azucar project"
is create.

"Put Mestizo on hold"
is update.

"Add finish homepage to Azucar"
is add_task.

For an existing project, prefer the exact project_id supplied in CURRENT PROJECTS.

Never invent a UUID.

If more than one project could match, return a clarification question rather than guessing.

If the user refers to one existing project by an obvious unique partial name, use that project.

If creating a project:
- project_name is required.
- default priority to 3 unless the user indicates importance.
- default status is active.

If adding a task:
- task_title is required.
- project_id or an unambiguous project_name is required.
- default task_priority to 3.
- task_due_at is null unless the user actually specifies timing.
- if timing is supplied, use an ISO 8601 timestamp with an explicit offset.

If updating:
Only populate fields the user actually wants changed.
Use null for fields that should remain unchanged.

Statuses:

active
on_hold
completed
archived

"pause", "hold", or "put aside" normally means on_hold.

"finish project" or "project is done" normally means completed.

"archive" means archived.

Do not permanently delete Projects.

LOCAL TIME

Current local time:
${clientNow}

Timezone:
${clientTimezone}
              `.trim(),

              input: [
                {
                  role:
                    'user',

                  content: `
CURRENT PROJECTS

${projectContext}


RECENT CONVERSATION

${recentConversation}


LATEST MESSAGE

${message}
                  `.trim(),
                },
              ],

              text: {
                format: {
                  type:
                    'json_schema',

                  name:
                    'a2_project_plan',

                  strict:
                    true,

                  schema: {
                    type:
                      'object',

                    additionalProperties:
                      false,

                    properties: {
                      action: {
                        type:
                          'string',

                        enum: [
                          'none',
                          'list',
                          'inspect',
                          'create',
                          'update',
                          'add_task',
                        ],
                      },

                      project_id: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      project_name: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      summary: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      objective: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      next_step: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      status: {
                        anyOf: [
                          {
                            type:
                              'string',

                            enum: [
                              'active',
                              'on_hold',
                              'completed',
                              'archived',
                            ],
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      priority: {
                        anyOf: [
                          {
                            type:
                              'integer',

                            minimum: 1,
                            maximum: 5,
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      task_title: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      task_notes: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      task_priority: {
                        anyOf: [
                          {
                            type:
                              'integer',

                            minimum: 1,
                            maximum: 5,
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      task_due_at: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },

                      clarification_question: {
                        anyOf: [
                          {
                            type:
                              'string',
                          },
                          {
                            type:
                              'null',
                          },
                        ],
                      },
                    },

                    required: [
                      'action',
                      'project_id',
                      'project_name',
                      'summary',
                      'objective',
                      'next_step',
                      'status',
                      'priority',
                      'task_title',
                      'task_notes',
                      'task_priority',
                      'task_due_at',
                      'clarification_question',
                    ],
                  },
                },
              },

              max_output_tokens:
                700,
            }),
        }
      );

    const data =
      await response.json();

    if (
      !response.ok
    ) {
      console.error(
        'A2 project planner OpenAI error:',
        JSON.stringify(
          data
        )
      );

      return {
        handled: false,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        context:
          'No Project action was completed.',
      };
    }

    const output =
      getOutputText(
        data
      );

    if (
      !output
    ) {
      return {
        handled: false,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        context:
          'No Project action was requested.',
      };
    }

    let plan:
      ProjectPlan;

    try {
      plan =
        JSON.parse(
          output
        );
    } catch (error) {
      console.error(
        'A2 project planner JSON error:',
        error
      );

      return {
        handled: false,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        context:
          'No Project action was completed.',
      };
    }

    // ========================================================
    // NONE
    // ========================================================

    if (
      plan.action ===
      'none'
    ) {
      return {
        handled: false,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        context:
          'No Project action was requested.',
      };
    }

    // ========================================================
    // LIST
    // ========================================================

    if (
      plan.action ===
      'list'
    ) {
      return {
        handled: true,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        action:
          'list',

        context:
          projects.length
            ? `Current Projects:\n${projects
                .map(
                  (
                    project
                  ) =>
                    `- ${projectSummaryLine(
                      project
                    )}`
                )
                .join(
                  '\n'
                )}`
            : 'The user currently has no Projects.',
      };
    }

    // ========================================================
    // CREATE
    // ========================================================

    if (
      plan.action ===
      'create'
    ) {
      const projectName =
        plan.project_name
          ?.trim();

      if (
        !projectName
      ) {
        return {
          handled: false,

          needsClarification:
            true,

          clarificationQuestion:
            plan
              .clarification_question ||
            'What should I call the new project?',

          context:
            'Project creation needs a project name.',
        };
      }

      const existing =
        projects.find(
          (project) =>
            project.name
              .trim()
              .toLowerCase() ===
            projectName
              .toLowerCase()
        );

      if (
        existing
      ) {
        return {
          handled: true,

          needsClarification:
            false,

          clarificationQuestion:
            null,

          action:
            'inspect',

          projectId:
            existing.id,

          projectName:
            existing.name,

          context:
            `A Project named "${existing.name}" already exists. ${projectSummaryLine(
              existing
            )}`,
        };
      }

      const {
        data:
          created,

        error:
          createError,
      } = await supabase
        .from(
          'projects'
        )
        .insert({
          user_id:
            userId,

          name:
            projectName,

          summary:
            plan.summary
              ?.trim() ||
            null,

          objective:
            plan.objective
              ?.trim() ||
            null,

          next_step:
            plan.next_step
              ?.trim() ||
            null,

          status:
            plan.status ||
            'active',

          priority:
            plan.priority ??
            3,

          last_activity_at:
            new Date()
              .toISOString(),
        })
        .select(`
          id,
          name,
          summary,
          objective,
          next_step,
          status,
          priority,
          last_activity_at
        `)
        .single();

      if (
        createError
      ) {
        console.error(
          'A2 project create error:',
          createError
        );

        return {
          handled: false,
          needsClarification:
            false,
          clarificationQuestion:
            null,

          context:
            'The Project could not be created.',
        };
      }

      return {
        handled: true,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        action:
          'create',

        projectId:
          created.id,

        projectName:
          created.name,

        context:
          `Created Project "${created.name}" with priority ${created.priority} and status ${created.status}.`,
      };
    }

    // ========================================================
    // RESOLVE EXISTING PROJECT
    // ========================================================

    const resolution =
      resolveProject(
        projects,
        plan.project_id,
        plan.project_name
      );

    if (
      resolution
        .ambiguous
        .length >
      1
    ) {
      return {
        handled: false,

        needsClarification:
          true,

        clarificationQuestion:
          `Which project do you mean: ${resolution.ambiguous
            .map(
              (
                project
              ) =>
                project.name
            )
            .join(
              ', '
            )}?`,

        context:
          'More than one Project matched.',
      };
    }

    const project =
      resolution.project;

    if (
      !project
    ) {
      return {
        handled: false,

        needsClarification:
          true,

        clarificationQuestion:
          plan
            .clarification_question ||
          'Which project do you mean?',

        context:
          'The requested Project could not be identified.',
      };
    }

    // ========================================================
    // INSPECT
    // ========================================================

    if (
      plan.action ===
      'inspect'
    ) {
      const {
        data:
          projectTasks,

        error:
          tasksError,
      } = await supabase
        .from(
          'tasks'
        )
        .select(`
          id,
          title,
          status,
          priority,
          due_at
        `)
        .eq(
          'user_id',
          userId
        )
        .eq(
          'project_id',
          project.id
        )
        .neq(
          'status',
          'cancelled'
        )
        .order(
          'priority',
          {
            ascending:
              false,
          }
        );

      if (
        tasksError
      ) {
        console.error(
          'A2 project task lookup error:',
          tasksError
        );
      }

      const taskContext =
        projectTasks?.length
          ? projectTasks
              .map(
                (
                  task: any
                ) =>
                  `- ${task.title} | status=${task.status} | priority=${task.priority}${
                    task.due_at
                      ? ` | due=${task.due_at}`
                      : ''
                  }`
              )
              .join(
                '\n'
              )
          : 'No linked tasks.';

      return {
        handled: true,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        action:
          'inspect',

        projectId:
          project.id,

        projectName:
          project.name,

        context: `
Project: ${project.name}
Status: ${project.status}
Priority: ${project.priority}
Summary: ${project.summary ?? 'None'}
Objective: ${project.objective ?? 'None'}
Next step: ${project.next_step ?? 'None'}

Linked tasks:
${taskContext}
        `.trim(),
      };
    }

    // ========================================================
    // UPDATE
    // ========================================================

    if (
      plan.action ===
      'update'
    ) {
      const updates:
        Record<
          string,
          unknown
        > = {};

      if (
        plan.summary !==
        null
      ) {
        updates.summary =
          plan.summary
            .trim() ||
          null;
      }

      if (
        plan.objective !==
        null
      ) {
        updates.objective =
          plan.objective
            .trim() ||
          null;
      }

      if (
        plan.next_step !==
        null
      ) {
        updates.next_step =
          plan.next_step
            .trim() ||
          null;
      }

      if (
        plan.status !==
        null
      ) {
        updates.status =
          plan.status;
      }

      if (
        plan.priority !==
        null
      ) {
        updates.priority =
          plan.priority;
      }

      if (
        Object.keys(
          updates
        ).length ===
        0
      ) {
        return {
          handled: false,

          needsClarification:
            true,

          clarificationQuestion:
            plan
              .clarification_question ||
            `What would you like me to change about ${project.name}?`,

          context:
            'No Project changes were supplied.',
        };
      }

      updates.last_activity_at =
        new Date()
          .toISOString();

      const {
        data:
          updated,

        error:
          updateError,
      } = await supabase
        .from(
          'projects'
        )
        .update(
          updates
        )
        .eq(
          'id',
          project.id
        )
        .eq(
          'user_id',
          userId
        )
        .select(`
          id,
          name,
          summary,
          objective,
          next_step,
          status,
          priority,
          last_activity_at
        `)
        .single();

      if (
        updateError
      ) {
        console.error(
          'A2 project update error:',
          updateError
        );

        return {
          handled: false,
          needsClarification:
            false,
          clarificationQuestion:
            null,

          context:
            'The Project could not be updated.',
        };
      }

      return {
        handled: true,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        action:
          'update',

        projectId:
          updated.id,

        projectName:
          updated.name,

        context: `
Updated Project "${updated.name}".
Status: ${updated.status}
Priority: ${updated.priority}
Summary: ${updated.summary ?? 'None'}
Objective: ${updated.objective ?? 'None'}
Next step: ${updated.next_step ?? 'None'}
        `.trim(),
      };
    }

    // ========================================================
    // ADD LINKED TASK
    // ========================================================

    if (
      plan.action ===
      'add_task'
    ) {
      const taskTitle =
        plan.task_title
          ?.trim();

      if (
        !taskTitle
      ) {
        return {
          handled: false,

          needsClarification:
            true,

          clarificationQuestion:
            plan
              .clarification_question ||
            `What task should I add to ${project.name}?`,

          context:
            'A linked task needs a title.',
        };
      }

      let dueAt:
        string | null =
        null;

      if (
        plan.task_due_at
      ) {
        const parsedDue =
          new Date(
            plan.task_due_at
          );

        if (
          Number.isNaN(
            parsedDue.getTime()
          )
        ) {
          return {
            handled:
              false,

            needsClarification:
              true,

            clarificationQuestion:
              'What date or time should I use for that task?',

            context:
              'The supplied task due date was invalid.',
          };
        }

        dueAt =
          parsedDue.toISOString();
      }

      const {
        data:
          createdTask,

        error:
          taskCreateError,
      } = await supabase
        .from(
          'tasks'
        )
        .insert({
          user_id:
            userId,

          project_id:
            project.id,

          title:
            taskTitle,

          notes:
            plan.task_notes
              ?.trim() ||
            null,

          status:
            'open',

          priority:
            plan.task_priority ??
            3,

          due_at:
            dueAt,

          source:
            'a2',
        })
        .select(`
          id,
          title,
          priority,
          due_at,
          status
        `)
        .single();

      if (
        taskCreateError
      ) {
        console.error(
          'A2 project-linked task creation error:',
          taskCreateError
        );

        return {
          handled: false,
          needsClarification:
            false,
          clarificationQuestion:
            null,

          context:
            'The linked task could not be created.',
        };
      }

      await supabase
        .from(
          'projects'
        )
        .update({
          last_activity_at:
            new Date()
              .toISOString(),
        })
        .eq(
          'id',
          project.id
        )
        .eq(
          'user_id',
          userId
        );

      return {
        handled: true,
        needsClarification:
          false,
        clarificationQuestion:
          null,

        action:
          'add_task',

        projectId:
          project.id,

        projectName:
          project.name,

        context:
          `Created task "${createdTask.title}" inside Project "${project.name}" with priority ${createdTask.priority}${
            createdTask.due_at
              ? `, due ${createdTask.due_at}`
              : ''
          }. The task is also part of the user's Today system.`,
      };
    }

    return {
      handled: false,
      needsClarification:
        false,
      clarificationQuestion:
        null,

      context:
        'No Project action was requested.',
    };
  } catch (error) {
    console.error(
      'A2 project planner error:',
      error
    );

    return {
      handled: false,
      needsClarification:
        false,
      clarificationQuestion:
        null,

      context:
        'A2 encountered an internal Projects error.',
    };
  }
}