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