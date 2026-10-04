import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { withSupabase } from 'npm:@supabase/server@^1';

type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

const VALID_STATUSES: TaskStatus[] = [
  'open',
  'in_progress',
  'completed',
  'cancelled',
];
type ProjectStatus =
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'archived';

const VALID_PROJECT_STATUSES:
  ProjectStatus[] = [
    'active',
    'on_hold',
    'completed',
    'archived',
  ];

function validPriority(
  value: unknown
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function normalizeDueDate(
  value: unknown
): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== 'string'
  ) {
    return undefined;
  }

  const clean =
    value.trim();

  if (!clean) {
    return null;
  }

  const date =
    new Date(clean);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return undefined;
  }

  return date.toISOString();
}

function cleanOptionalText(
  value: unknown
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const clean =
    value.trim();

  return clean ||
    null;
}

async function resolveProject({
  supabase,
  userId,
  projectId,
  projectName,
}: {
  supabase: any;
  userId: string;
  projectId?: unknown;
  projectName?: unknown;
}) {
  // ----------------------------------------------------------
  // TRY PROJECT ID FIRST
  // ----------------------------------------------------------

  if (
    typeof projectId ===
      'string' &&
    projectId.trim()
  ) {
    const {
      data,
      error,
    } =
      await supabase
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
        .eq(
          'id',
          projectId.trim()
        )
        .maybeSingle();

    if (error) {
      console.error(
        'A2 live project ID lookup error:',
        error
      );
    }

    if (data) {
      return {
        project:
          data,

        ambiguous:
          false,

        matches:
          [] as string[],
      };
    }
  }

  // ----------------------------------------------------------
  // PROJECT NAME
  // ----------------------------------------------------------

  if (
    typeof projectName !==
      'string' ||
    !projectName.trim()
  ) {
    return {
      project:
        null,

      ambiguous:
        false,

      matches:
        [] as string[],
    };
  }

  const cleanName =
    projectName.trim();

  // Exact case-insensitive match.
  const {
    data:
      exactMatches,

    error:
      exactError,
  } =
    await supabase
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
      .ilike(
        'name',
        cleanName
      )
      .limit(2);

  if (exactError) {
    console.error(
      'A2 live exact project lookup error:',
      exactError
    );
  }

  if (
    exactMatches?.length ===
    1
  ) {
    return {
      project:
        exactMatches[0],

      ambiguous:
        false,

      matches:
        [] as string[],
    };
  }

  // Partial name match.
  const {
    data:
      partialMatches,

    error:
      partialError,
  } =
    await supabase
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
      .ilike(
        'name',
        `%${cleanName}%`
      )
      .limit(10);

  if (partialError) {
    console.error(
      'A2 live partial project lookup error:',
      partialError
    );
  }

  if (
    partialMatches?.length ===
    1
  ) {
    return {
      project:
        partialMatches[0],

      ambiguous:
        false,

      matches:
        [] as string[],
    };
  }

  if (
    partialMatches &&
    partialMatches.length >
      1
  ) {
    return {
      project:
        null,

      ambiguous:
        true,

      matches:
        partialMatches.map(
          (
            project: any
          ) =>
            project.name
        ),
    };
  }

  return {
    project:
      null,

    ambiguous:
      false,

    matches:
      [] as string[],
  };
}

export default {
  fetch: withSupabase(
    {
      auth: 'user',
    },

    async (req, ctx) => {
      if (
        req.method !== 'POST'
      ) {
        return Response.json(
          {
            error:
              'Method not allowed.',
          },
          {
            status: 405,
          }
        );
      }

      try {
        const userId =
          ctx.userClaims?.id;

        if (!userId) {
          return Response.json(
            {
              error:
                'Authenticated user not found.',
            },
            {
              status: 401,
            }
          );
        }

        const supabase =
          ctx.supabase;

        const body =
          await req.json();

        const tool =
          body?.tool;

        const args =
          body?.arguments ??
          {};

        if (
          typeof tool !==
          'string'
        ) {
          return Response.json(
            {
              error:
                'Tool name is required.',
            },
            {
              status: 400,
            }
          );
        }

        // ====================================================
        // GET TODAY TASKS
        // ====================================================

        if (
          tool ===
          'get_today_tasks'
        ) {
          const {
            data,
            error,
          } = await supabase
            .from('tasks')
            .select(`
              id,
              title,
              notes,
              status,
              priority,
              due_at,
              completed_at,
              project_id,
              source,
              created_at
            `)
            .eq(
              'user_id',
              userId
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
            )
            .order(
              'due_at',
              {
                ascending:
                  true,
                nullsFirst:
                  false,
              }
            )
            .limit(50);

          if (error) {
            console.error(
              'A2 live task lookup error:',
              error
            );

            return Response.json(
              {
                success:
                  false,

                error:
                  'Could not load tasks.',
              },
              {
                status: 500,
              }
            );
          }

          return Response.json({
            success: true,

            tasks:
              data ?? [],
          });
        }

        // ====================================================
        // CREATE TASK
        // ====================================================

        if (
          tool ===
          'create_today_task'
        ) {
          const title =
            typeof args.title ===
              'string'
              ? args.title.trim()
              : '';

          if (!title) {
            return Response.json(
              {
                success:
                  false,

                error:
                  'Task title is required.',
              },
              {
                status: 400,
              }
            );
          }

          const priority =
            args.priority ===
              undefined ||
            args.priority ===
              null
              ? 3
              : args.priority;

          if (
            !validPriority(
              priority
            )
          ) {
            return Response.json(
              {
                success:
                  false,

                error:
                  'Priority must be between 1 and 5.',
              },
              {
                status: 400,
              }
            );
          }

          const dueAt =
            normalizeDueDate(
              args.due_at
            );

          if (
            args.due_at !==
              undefined &&
            dueAt ===
              undefined
          ) {
            return Response.json(
              {
                success:
                  false,

                error:
                  'Invalid due date.',
              },
              {
                status: 400,
              }
            );
          }

          const {
            data,
            error,
          } = await supabase
            .from('tasks')
            .insert({
              user_id:
                userId,

              title,

              notes:
                typeof args.notes ===
                  'string' &&
                args.notes.trim()
                  ? args.notes.trim()
                  : null,

              priority,

              due_at:
                dueAt ??
                null,

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
              project_id,
              priority,
              due_at
            `)
            .single();

          if (error) {
            console.error(
              'A2 live create task error:',
              error
            );

            return Response.json(
              {
                success:
                  false,

                error:
                  'Could not create task.',
              },
              {
                status: 500,
              }
            );
          }

          return Response.json({
            success: true,

            message:
              `Created "${data.title}".`,

            task:
              data,
          });
        }

        // ====================================================
        // UPDATE TASK
        // ====================================================

        if (
          tool ===
          'update_today_task'
        ) {
          const taskId =
            typeof args.task_id ===
              'string'
              ? args.task_id.trim()
              : '';

          if (!taskId) {
            return Response.json(
              {
                success: false,
                error:
                  'Task ID is required.',
              },
              {
                status: 400,
              }
            );
          }

          const updates:
            Record<string, unknown> = {};

          // --------------------------------------------------
          // TITLE
          // null = leave unchanged
          // --------------------------------------------------

          if (
            args.title !==
              undefined &&
            args.title !== null
          ) {
            const title =
              typeof args.title ===
                'string'
                ? args.title.trim()
                : '';

            if (!title) {
              return Response.json(
                {
                  success:
                    false,

                  error:
                    'Task title cannot be empty.',
                },
                {
                  status:
                    400,
                }
              );
            }

            updates.title =
              title;
          }

          // --------------------------------------------------
          // NOTES
          // null = leave unchanged
          // empty string = clear notes
          // --------------------------------------------------

          if (
            args.notes !==
              undefined &&
            args.notes !== null
          ) {
            if (
              typeof args.notes !==
              'string'
            ) {
              return Response.json(
                {
                  success:
                    false,

                  error:
                    'Task notes must be text.',
                },
                {
                  status:
                    400,
                }
              );
            }

            updates.notes =
              args.notes.trim() ||
              null;
          }

          // --------------------------------------------------
          // PRIORITY
          // null = leave unchanged
          // --------------------------------------------------

          if (
            args.priority !==
              undefined &&
            args.priority !== null
          ) {
            if (
              !validPriority(
                args.priority
              )
            ) {
              return Response.json(
                {
                  success:
                    false,

                  error:
                    'Priority must be between 1 and 5.',
                },
                {
                  status:
                    400,
                }
              );
            }

            updates.priority =
              args.priority;
          }

          // --------------------------------------------------
          // DUE DATE
          // null = leave unchanged
          // clear_due_date=true = remove due date
          // --------------------------------------------------

          if (
            args.clear_due_date ===
            true
          ) {
            updates.due_at =
              null;
          } else if (
            args.due_at !==
              undefined &&
            args.due_at !== null
          ) {
            const dueAt =
              normalizeDueDate(
                args.due_at
              );

            if (
              dueAt === undefined
            ) {
              return Response.json(
                {
                  success:
                    false,

                  error:
                    'Invalid due date.',
                },
                {
                  status:
                    400,
                }
              );
            }

            updates.due_at =
              dueAt;
          }

          // --------------------------------------------------
          // STATUS
          // null = leave unchanged
          // --------------------------------------------------

          if (
            args.status !==
              undefined &&
            args.status !== null
          ) {
            if (
              typeof args.status !==
                'string' ||
              !VALID_STATUSES.includes(
                args.status as
                  TaskStatus
              )
            ) {
              return Response.json(
                {
                  success:
                    false,

                  error:
                    'Invalid task status.',
                },
                {
                  status:
                    400,
                }
              );
            }

            updates.status =
              args.status;

            if (
              args.status ===
              'completed'
            ) {
              updates.completed_at =
                new Date()
                  .toISOString();
            } else {
              updates.completed_at =
                null;
            }
          }

          // --------------------------------------------------
          // NOTHING TO CHANGE
          // --------------------------------------------------

          if (
            Object.keys(
              updates
            ).length === 0
          ) {
            return Response.json(
              {
                success:
                  false,

                error:
                  'No task changes were supplied.',
              },
              {
                status: 400,
              }
            );
          }

          // --------------------------------------------------
          // APPLY UPDATE
          // --------------------------------------------------

          const {
            data,
            error,
          } = await supabase
            .from('tasks')
            .update(
              updates
            )
            .eq(
              'id',
              taskId
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
              project_id,
              due_at,
              completed_at
            `)
            .maybeSingle();

          if (error) {
            console.error(
              'A2 live update task error:',
              error
            );

            return Response.json(
              {
                success:
                  false,

                error:
                  'Could not update task.',
              },
              {
                status: 500,
              }
            );
          }

          if (!data) {
            return Response.json(
              {
                success:
                  false,

                error:
                  'Task not found.',
              },
              {
                status: 404,
              }
            );
          }

          return Response.json({
            success: true,

            message:
              `Updated "${data.title}".`,

            task:
              data,
          });
        }
        // ====================================================
        // DELETE TASK
        // ====================================================

        if (
          tool ===
          'delete_today_task'
        ) {
          const taskId =
            typeof args.task_id ===
              'string'
              ? args.task_id.trim()
              : '';

          if (!taskId) {
            return Response.json(
              {
                success:
                  false,

                error:
                  'Task ID is required.',
              },
              {
                status: 400,
              }
            );
          }

          const {
            data:
              existingTask,
            error:
              lookupError,
          } = await supabase
            .from('tasks')
            .select(`
              id,
              title
            `)
            .eq(
              'id',
              taskId
            )
            .eq(
              'user_id',
              userId
            )
            .maybeSingle();

          if (
            lookupError
          ) {
            console.error(
              'A2 live delete lookup error:',
              lookupError
            );

            return Response.json(
              {
                success:
                  false,

                error:
                  'Could not find task.',
              },
              {
                status: 500,
              }
            );
          }

          if (
            !existingTask
          ) {
            return Response.json(
              {
                success:
                  false,

                error:
                  'Task not found.',
              },
              {
                status: 404,
              }
            );
          }

          const {
            error:
              deleteError,
          } = await supabase
            .from('tasks')
            .delete()
            .eq(
              'id',
              taskId
            )
            .eq(
              'user_id',
              userId
            );

          if (
            deleteError
          ) {
            console.error(
              'A2 live delete task error:',
              deleteError
            );

            return Response.json(
              {
                success:
                  false,

                error:
                  'Could not delete task.',
              },
              {
                status: 500,
              }
            );
          }

          return Response.json({
            success: true,

            message:
              `Deleted "${existingTask.title}".`,
          });
        }

// ====================================================
// LIST PROJECTS
// ====================================================

if (
  tool ===
  'list_projects'
) {
  const {
    data,
    error,
  } =
    await supabase
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
      .neq(
        'status',
        'archived'
      )
      .order(
        'priority',
        {
          ascending:
            false,
        }
      )
      .order(
        'last_activity_at',
        {
          ascending:
            false,
        }
      );

  if (error) {
    console.error(
      'A2 live project list error:',
      error
    );

    return Response.json(
      {
        success:
          false,

        error:
          'Could not load projects.',
      },
      {
        status:
          500,
      }
    );
  }

  return Response.json({
    success:
      true,

    projects:
      data ?? [],
  });
}

// ====================================================
// GET PROJECT
// ====================================================

if (
  tool ===
  'get_project'
) {
  const resolved =
    await resolveProject({
      supabase,

      userId,

      projectId:
        args.project_id,

      projectName:
        args.project_name,
    });

  if (
    resolved.ambiguous
  ) {
    return Response.json({
      success:
        false,

      needs_clarification:
        true,

      error:
        'More than one project matched.',

      matches:
        resolved.matches,
    });
  }

  if (
    !resolved.project
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'Project not found.',
      },
      {
        status:
          404,
      }
    );
  }

  const project =
    resolved.project;

  const {
    data:
      projectTasks,

    error:
      taskError,
  } =
    await supabase
      .from(
        'tasks'
      )
      .select(`
        id,
        title,
        notes,
        status,
        priority,
        due_at,
        completed_at
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
      )
      .order(
        'due_at',
        {
          ascending:
            true,

          nullsFirst:
            false,
        }
      );

  if (taskError) {
    console.error(
      'A2 live project task lookup error:',
      taskError
    );
  }

  return Response.json({
    success:
      true,

    project,

    tasks:
      projectTasks ??
      [],
  });
}

// ====================================================
// CREATE PROJECT
// ====================================================

if (
  tool ===
  'create_project'
) {
  const name =
    typeof args.name ===
      'string'
      ? args.name.trim()
      : '';

  if (!name) {
    return Response.json(
      {
        success:
          false,

        error:
          'Project name is required.',
      },
      {
        status:
          400,
      }
    );
  }

  const {
    data:
      existingProject,

    error:
      existingError,
  } =
    await supabase
      .from(
        'projects'
      )
      .select(`
        id,
        name
      `)
      .eq(
        'user_id',
        userId
      )
      .ilike(
        'name',
        name
      )
      .limit(1)
      .maybeSingle();

  if (existingError) {
    console.error(
      'A2 live duplicate project lookup error:',
      existingError
    );
  }

  if (
    existingProject
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'A project with that name already exists.',

        existing_project:
          existingProject,
      },
      {
        status:
          409,
      }
    );
  }

  const priority =
    args.priority ===
      undefined ||
    args.priority ===
      null
      ? 3
      : args.priority;

  if (
    !validPriority(
      priority
    )
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'Priority must be between 1 and 5.',
      },
      {
        status:
          400,
      }
    );
  }

  const status =
    args.status ===
      undefined ||
    args.status ===
      null
      ? 'active'
      : args.status;

  if (
    typeof status !==
      'string' ||
    !VALID_PROJECT_STATUSES.includes(
      status as
        ProjectStatus
    )
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'Invalid project status.',
      },
      {
        status:
          400,
      }
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        'projects'
      )
      .insert({
        user_id:
          userId,

        name,

        summary:
          cleanOptionalText(
            args.summary
          ),

        objective:
          cleanOptionalText(
            args.objective
          ),

        next_step:
          cleanOptionalText(
            args.next_step
          ),

        status,

        priority,

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

  if (error) {
    console.error(
      'A2 live create project error:',
      error
    );

    return Response.json(
      {
        success:
          false,

        error:
          'Could not create project.',
      },
      {
        status:
          500,
      }
    );
  }

  return Response.json({
    success:
      true,

    message:
      `Created project "${data.name}".`,

    project:
      data,
  });
}

// ====================================================
// UPDATE PROJECT
// ====================================================

if (
  tool ===
  'update_project'
) {
  const resolved =
    await resolveProject({
      supabase,

      userId,

      projectId:
        args.project_id,

      projectName:
        args.project_name,
    });

  if (
    resolved.ambiguous
  ) {
    return Response.json({
      success:
        false,

      needs_clarification:
        true,

      error:
        'More than one project matched.',

      matches:
        resolved.matches,
    });
  }

  if (
    !resolved.project
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'Project not found.',
      },
      {
        status:
          404,
      }
    );
  }

  const updates:
    Record<
      string,
      unknown
    > = {};

  // --------------------------------------------------
  // SUMMARY
  // null = unchanged
  // empty string = clear
  // --------------------------------------------------

  if (
    args.summary !==
      undefined &&
    args.summary !==
      null
  ) {
    if (
      typeof args.summary !==
      'string'
    ) {
      return Response.json(
        {
          success:
            false,

          error:
            'Project summary must be text.',
        },
        {
          status:
            400,
        }
      );
    }

    updates.summary =
      args.summary.trim() ||
      null;
  }

  // --------------------------------------------------
  // OBJECTIVE
  // --------------------------------------------------

  if (
    args.objective !==
      undefined &&
    args.objective !==
      null
  ) {
    if (
      typeof args.objective !==
      'string'
    ) {
      return Response.json(
        {
          success:
            false,

          error:
            'Project objective must be text.',
        },
        {
          status:
            400,
        }
      );
    }

    updates.objective =
      args.objective.trim() ||
      null;
  }

  // --------------------------------------------------
  // NEXT STEP
  // --------------------------------------------------

  if (
    args.next_step !==
      undefined &&
    args.next_step !==
      null
  ) {
    if (
      typeof args.next_step !==
      'string'
    ) {
      return Response.json(
        {
          success:
            false,

          error:
            'Project next step must be text.',
        },
        {
          status:
            400,
        }
      );
    }

    updates.next_step =
      args.next_step.trim() ||
      null;
  }

  // --------------------------------------------------
  // PRIORITY
  // --------------------------------------------------

  if (
    args.priority !==
      undefined &&
    args.priority !==
      null
  ) {
    if (
      !validPriority(
        args.priority
      )
    ) {
      return Response.json(
        {
          success:
            false,

          error:
            'Priority must be between 1 and 5.',
        },
        {
          status:
            400,
        }
      );
    }

    updates.priority =
      args.priority;
  }

  // --------------------------------------------------
  // STATUS
  // --------------------------------------------------

  if (
    args.status !==
      undefined &&
    args.status !==
      null
  ) {
    if (
      typeof args.status !==
        'string' ||
      !VALID_PROJECT_STATUSES.includes(
        args.status as
          ProjectStatus
      )
    ) {
      return Response.json(
        {
          success:
            false,

          error:
            'Invalid project status.',
        },
        {
          status:
            400,
        }
      );
    }

    updates.status =
      args.status;
  }

  if (
    Object.keys(
      updates
    ).length ===
    0
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'No project changes were supplied.',
      },
      {
        status:
          400,
      }
    );
  }

  updates.last_activity_at =
    new Date()
      .toISOString();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        'projects'
      )
      .update(
        updates
      )
      .eq(
        'id',
        resolved.project.id
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
      .maybeSingle();

  if (error) {
    console.error(
      'A2 live update project error:',
      error
    );

    return Response.json(
      {
        success:
          false,

        error:
          'Could not update project.',
      },
      {
        status:
          500,
      }
    );
  }

  if (!data) {
    return Response.json(
      {
        success:
          false,

        error:
          'Project not found.',
      },
      {
        status:
          404,
      }
    );
  }

  return Response.json({
    success:
      true,

    message:
      `Updated project "${data.name}".`,

    project:
      data,
  });
}

// ====================================================
// ADD PROJECT TASK
// ====================================================

if (
  tool ===
  'add_project_task'
) {
  const resolved =
    await resolveProject({
      supabase,

      userId,

      projectId:
        args.project_id,

      projectName:
        args.project_name,
    });

  if (
    resolved.ambiguous
  ) {
    return Response.json({
      success:
        false,

      needs_clarification:
        true,

      error:
        'More than one project matched.',

      matches:
        resolved.matches,
    });
  }

  if (
    !resolved.project
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'Project not found.',
      },
      {
        status:
          404,
      }
    );
  }

  const title =
    typeof args.title ===
      'string'
      ? args.title.trim()
      : '';

  if (!title) {
    return Response.json(
      {
        success:
          false,

        error:
          'Task title is required.',
      },
      {
        status:
          400,
      }
    );
  }

  const priority =
    args.priority ===
      undefined ||
    args.priority ===
      null
      ? 3
      : args.priority;

  if (
    !validPriority(
      priority
    )
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'Priority must be between 1 and 5.',
      },
      {
        status:
          400,
      }
    );
  }

  const dueAt =
    normalizeDueDate(
      args.due_at
    );

  if (
    args.due_at !==
      undefined &&
    args.due_at !==
      null &&
    dueAt ===
      undefined
  ) {
    return Response.json(
      {
        success:
          false,

        error:
          'Invalid due date.',
      },
      {
        status:
          400,
      }
    );
  }

  const {
    data:
      task,

    error:
      taskError,
  } =
    await supabase
      .from(
        'tasks'
      )
      .insert({
        user_id:
          userId,

        project_id:
          resolved.project.id,

        title,

        notes:
          cleanOptionalText(
            args.notes
          ),

        status:
          'open',

        priority,

        due_at:
          dueAt ??
          null,

        source:
          'a2',
      })
      .select(`
        id,
        title,
        notes,
        status,
        priority,
        due_at,
        project_id
      `)
      .single();

  if (taskError) {
    console.error(
      'A2 live create project task error:',
      taskError
    );

    return Response.json(
      {
        success:
          false,

        error:
          'Could not create project task.',
      },
      {
        status:
          500,
      }
    );
  }

  const {
    error:
      projectTouchError,
  } =
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
        resolved.project.id
      )
      .eq(
        'user_id',
        userId
      );

  if (
    projectTouchError
  ) {
    console.error(
      'A2 live project activity update error:',
      projectTouchError
    );
  }

  return Response.json({
    success:
      true,

    message:
      `Added "${task.title}" to ${resolved.project.name}.`,

    project: {
      id:
        resolved.project.id,

      name:
        resolved.project.name,
    },

    task,
  });
}

        // ====================================================
        // UNKNOWN TOOL
        // ====================================================

        return Response.json(
          {
            success:
              false,

            error:
              'Unknown A2 live tool.',
          },
          {
            status: 400,
          }
        );
      } catch (error) {
        console.error(
          'A2 live tool error:',
          error
        );

        return Response.json(
          {
            success:
              false,

            error:
              'Unexpected A2 live tool error.',
          },
          {
            status: 500,
          }
        );
      }
    }
  ),
};