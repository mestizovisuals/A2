import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import {
    withSupabase,
} from 'npm:@supabase/server@^1';

type BriefTask = {
  id: string;
  title: string;
  status: string;
  priority: number;
  due_at: string | null;
  project_id: string | null;
};

type BriefProject = {
  id: string;
  name: string;
  next_step: string | null;
  status: string;
  priority: number;
  last_activity_at: string;
};

// ============================================================
// OPENAI OUTPUT
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

  const parts: string[] =
    [];

  for (
    const item of
    data.output
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
// LOCAL DATE
// ============================================================

function localDateKey(
  date: Date,
  timezone: string
): string {
  try {
    const formatter =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            timezone,

          year:
            'numeric',

          month:
            '2-digit',

          day:
            '2-digit',
        }
      );

    const parts =
      formatter
        .formatToParts(
          date
        );

    const year =
      parts.find(
        (part) =>
          part.type ===
          'year'
      )?.value;

    const month =
      parts.find(
        (part) =>
          part.type ===
          'month'
      )?.value;

    const day =
      parts.find(
        (part) =>
          part.type ===
          'day'
      )?.value;

    if (
      year &&
      month &&
      day
    ) {
      return `${year}-${month}-${day}`;
    }
  } catch (
    error
  ) {
    console.warn(
      'A2 brief timezone formatting error:',
      error
    );
  }

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

// ============================================================
// TASK RANKING
// ============================================================

function taskBucket(
  task: BriefTask,
  todayKey: string,
  timezone: string
): number {
  if (
    !task.due_at
  ) {
    return 3;
  }

  const due =
    new Date(
      task.due_at
    );

  if (
    Number.isNaN(
      due.getTime()
    )
  ) {
    return 3;
  }

  const dueKey =
    localDateKey(
      due,
      timezone
    );

  if (
    dueKey <
    todayKey
  ) {
    return 0;
  }

  if (
    dueKey ===
    todayKey
  ) {
    return 1;
  }

  return 2;
}

// ============================================================
// SNAPSHOT HASH
// ============================================================

async function hashSnapshot(
  value: string
): Promise<string> {
  const bytes =
    new TextEncoder()
      .encode(
        value
      );

  const digest =
    await crypto.subtle
      .digest(
        'SHA-256',
        bytes
      );

  return Array
    .from(
      new Uint8Array(
        digest
      )
    )
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(
            2,
            '0'
          )
    )
    .join('');
}

// ============================================================
// FALLBACK BRIEF
// ============================================================

function buildFallbackBrief({
  overdueCount,
  dueTodayCount,
  topTask,
  topProject,
}: {
  overdueCount: number;
  dueTodayCount: number;
  topTask:
    BriefTask | null;
  topProject:
    BriefProject | null;
}): string {
  if (
    overdueCount >
    0 &&
    topTask
  ) {
    return `${overdueCount} ${
      overdueCount ===
      1
        ? 'task is'
        : 'tasks are'
    } overdue. Start with ${topTask.title}.`;
  }

  if (
    dueTodayCount >
    0 &&
    topTask
  ) {
    return `${dueTodayCount} ${
      dueTodayCount ===
      1
        ? 'task is'
        : 'tasks are'
    } due today. Your main focus is ${topTask.title}.`;
  }

  if (
    topTask
  ) {
    return `Nothing is overdue. Your next priority is ${topTask.title}.`;
  }

  if (
    topProject
      ?.next_step
  ) {
    return `Nothing is pressing today. ${topProject.name}'s next step is ${topProject.next_step}.`;
  }

  if (
    topProject
  ) {
    return `Nothing is pressing today. ${topProject.name} is your highest-priority active project.`;
  }

  return 'Nothing is pressing right now.';
}

// ============================================================
// MAIN FUNCTION
// ============================================================

export default {
  fetch: withSupabase(
    {
      auth:
        'user',
    },

    async (
      req,
      ctx
    ) => {
      if (
        req.method !==
        'POST'
      ) {
        return Response.json(
          {
            error:
              'Method not allowed.',
          },
          {
            status:
              405,
          }
        );
      }

      try {
        const userId =
          ctx.userClaims
            ?.id;

        if (
          !userId
        ) {
          return Response.json(
            {
              error:
                'Authenticated user not found.',
            },
            {
              status:
                401,
            }
          );
        }

        const supabase =
          ctx.supabase;

        // ------------------------------------------------------
        // REQUEST CONTEXT
        // ------------------------------------------------------

        let body: any =
          {};

        try {
          body =
            await req.json();
        } catch {
          body =
            {};
        }

        const clientNow =
          typeof body
            ?.client_now ===
            'string'
            ? body.client_now
            : new Date()
                .toISOString();

        const clientTimezone =
          typeof body
            ?.client_timezone ===
            'string'
            ? body.client_timezone
            : 'UTC';

        const previousSignature =
          typeof body
            ?.previous_signature ===
            'string'
            ? body
                .previous_signature
            : null;

        const parsedNow =
          new Date(
            clientNow
          );

        const safeNow =
          Number.isNaN(
            parsedNow.getTime()
          )
            ? new Date()
            : parsedNow;

        const todayKey =
          localDateKey(
            safeNow,
            clientTimezone
          );

        // ------------------------------------------------------
        // LOAD CURRENT TASKS + PROJECTS
        // ------------------------------------------------------

        const [
          taskResult,
          projectResult,
        ] =
          await Promise.all([
            supabase
              .from(
                'tasks'
              )
              .select(`
                id,
                title,
                status,
                priority,
                due_at,
                project_id
              `)
              .eq(
                'user_id',
                userId
              )
              .neq(
                'status',
                'completed'
              )
              .neq(
                'status',
                'cancelled'
              )
              .limit(
                100
              ),

            supabase
              .from(
                'projects'
              )
              .select(`
                id,
                name,
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
                'status',
                'active'
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
              )
              .limit(
                50
              ),
          ]);

        if (
          taskResult.error
        ) {
          console.error(
            'A2 brief task load error:',
            taskResult.error
          );

          return Response.json(
            {
              error:
                'Could not load Today tasks.',
            },
            {
              status:
                500,
            }
          );
        }

        if (
          projectResult.error
        ) {
          console.error(
            'A2 brief project load error:',
            projectResult.error
          );

          return Response.json(
            {
              error:
                'Could not load Projects.',
            },
            {
              status:
                500,
            }
          );
        }

        const tasks =
          (
            taskResult.data ??
            []
          ) as BriefTask[];

        const projects =
          (
            projectResult.data ??
            []
          ) as BriefProject[];

        // ------------------------------------------------------
        // CLASSIFY TASKS
        // ------------------------------------------------------

        const overdueTasks =
          tasks.filter(
            (
              task
            ) =>
              taskBucket(
                task,
                todayKey,
                clientTimezone
              ) ===
              0
          );

        const dueTodayTasks =
          tasks.filter(
            (
              task
            ) =>
              taskBucket(
                task,
                todayKey,
                clientTimezone
              ) ===
              1
          );

        const rankedTasks =
          [...tasks]
            .sort(
              (
                first,
                second
              ) => {
                const bucketDifference =
                  taskBucket(
                    first,
                    todayKey,
                    clientTimezone
                  ) -
                  taskBucket(
                    second,
                    todayKey,
                    clientTimezone
                  );

                if (
                  bucketDifference !==
                  0
                ) {
                  return bucketDifference;
                }

                const priorityDifference =
                  second.priority -
                  first.priority;

                if (
                  priorityDifference !==
                  0
                ) {
                  return priorityDifference;
                }

                const firstDue =
                  first.due_at
                    ? new Date(
                        first.due_at
                      )
                        .getTime()
                    : Number
                        .POSITIVE_INFINITY;

                const secondDue =
                  second.due_at
                    ? new Date(
                        second.due_at
                      )
                        .getTime()
                    : Number
                        .POSITIVE_INFINITY;

                return (
                  firstDue -
                  secondDue
                );
              }
            );

        const topTask =
          rankedTasks[0] ??
          null;

        const topProject =
          projects[0] ??
          null;

        // ------------------------------------------------------
        // CREATE STABLE SNAPSHOT
        //
        // Including todayKey guarantees a new brief after
        // the user's local calendar day changes.
        // ------------------------------------------------------

        const snapshotData = {
          today:
            todayKey,

          tasks:
            tasks.map(
              (
                task
              ) => ({
                id:
                  task.id,

                title:
                  task.title,

                status:
                  task.status,

                priority:
                  task.priority,

                due_at:
                  task.due_at,

                project_id:
                  task.project_id,
              })
            ),

          projects:
            projects.map(
              (
                project
              ) => ({
                id:
                  project.id,

                name:
                  project.name,

                next_step:
                  project.next_step,

                status:
                  project.status,

                priority:
                  project.priority,

                last_activity_at:
                  project
                    .last_activity_at,
              })
            ),
        };

        const signature =
          await hashSnapshot(
            JSON.stringify(
              snapshotData
            )
          );

        // ------------------------------------------------------
        // DON'T SPEND TOKENS IF NOTHING CHANGED
        // ------------------------------------------------------

        if (
          previousSignature &&
          previousSignature ===
            signature
        ) {
          return Response.json({
            success:
              true,

            unchanged:
              true,

            signature,

            counts: {
              open_tasks:
                tasks.length,

              overdue:
                overdueTasks.length,

              due_today:
                dueTodayTasks.length,

              active_projects:
                projects.length,
            },
          });
        }

        // ------------------------------------------------------
        // DETERMINISTIC FALLBACK
        // ------------------------------------------------------

        const fallbackBrief =
          buildFallbackBrief({
            overdueCount:
              overdueTasks.length,

            dueTodayCount:
              dueTodayTasks.length,

            topTask,

            topProject,
          });

        const openAIKey =
          Deno.env.get(
            'OPENAI_API_KEY'
          );

        // A missing AI key should not break Home.
        if (
          !openAIKey
        ) {
          return Response.json({
            success:
              true,

            unchanged:
              false,

            signature,

            brief:
              fallbackBrief,

            source:
              'fallback',
          });
        }

        // ------------------------------------------------------
        // DATA FOR A2
        // ------------------------------------------------------

        const taskContext =
          rankedTasks
            .slice(
              0,
              8
            )
            .map(
              (
                task
              ) => {
                const classification =
                  taskBucket(
                    task,
                    todayKey,
                    clientTimezone
                  );

                const label =
                  classification ===
                  0
                    ? 'OVERDUE'
                    : classification ===
                        1
                      ? 'TODAY'
                      : classification ===
                          2
                        ? 'UPCOMING'
                        : 'NO DATE';

                return [
                  task.title,
                  `state=${label}`,
                  `priority=${task.priority}`,
                  task.due_at
                    ? `due=${task.due_at}`
                    : null,
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    ' | '
                  );
              }
            )
            .join(
              '\n'
            );

        const projectContext =
          projects
            .slice(
              0,
              6
            )
            .map(
              (
                project
              ) =>
                [
                  project.name,
                  `priority=${project.priority}`,
                  project
                    .next_step
                    ? `next=${project.next_step}`
                    : 'next=not set',
                ]
                  .join(
                    ' | '
                  )
            )
            .join(
              '\n'
            );

        // ------------------------------------------------------
        // GENERATE SHORT JARVIS-STYLE BRIEF
        // ------------------------------------------------------

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
You generate A2's quiet Home briefing.

This is NOT a chat response.

Use only the supplied current Today and Project data.

Write one polished sentence whenever possible.

Two very short sentences are allowed only when clearly better.

Maximum 45 words.

Priority of attention:

1. overdue tasks
2. tasks due today
3. the next important scheduled task
4. a useful active Project next step

Do not list everything.

Do not mention counts merely because they exist.

Do not manufacture urgency.

Do not invent dates, tasks, Projects, or priorities.

If nothing is urgent, say so calmly and surface the most useful next focus.

If there is nothing useful to surface, say:
"Nothing is pressing right now."

Do not greet the user.

Do not say "Good morning" or "Good evening."

Do not use Markdown.

Do not use bullets.

Do not say "According to your tasks."

Sound calm, intelligent, understated, and concise.
                  `.trim(),

                  input: `
USER LOCAL DATE

${todayKey}

USER TIMEZONE

${clientTimezone}

CURRENT COUNTS

Open tasks:
${tasks.length}

Overdue:
${overdueTasks.length}

Due today:
${dueTodayTasks.length}

Active Projects:
${projects.length}

HIGHEST-RELEVANCE TASKS

${taskContext ||
'None'}

ACTIVE PROJECTS

${projectContext ||
'None'}
                  `.trim(),

                  max_output_tokens:
                    120,
                }),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          console.error(
            'A2 Home brief OpenAI error:',
            JSON.stringify(
              data
            )
          );

          return Response.json({
            success:
              true,

            unchanged:
              false,

            signature,

            brief:
              fallbackBrief,

            source:
              'fallback',
          });
        }

        const generatedBrief =
          getOutputText(
            data
          )
            .replace(
              /\s+/g,
              ' '
            )
            .trim();

        return Response.json({
          success:
            true,

          unchanged:
            false,

          signature,

          brief:
            generatedBrief ||
            fallbackBrief,

          source:
            generatedBrief
              ? 'ai'
              : 'fallback',

          counts: {
            open_tasks:
              tasks.length,

            overdue:
              overdueTasks.length,

            due_today:
              dueTodayTasks.length,

            active_projects:
              projects.length,
          },
        });
      } catch (
        error
      ) {
        console.error(
          'A2 Home brief error:',
          error
        );

        return Response.json(
          {
            error:
              'Unexpected A2 Home briefing error.',
          },
          {
            status:
              500,
          }
        );
      }
    }
  ),
};