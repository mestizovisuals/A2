import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import {
  withSupabase,
} from 'npm:@supabase/server@^1';

type NotificationPreferences = {
  user_id: string;

  enabled: boolean;

  task_reminders: boolean;
  overdue_alerts: boolean;
  project_followups: boolean;
  daily_brief: boolean;

  push_enabled: boolean;

  task_reminder_minutes: number;

  daily_brief_time: string;

  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;

  timezone: string;
};

type TaskRow = {
  id: string;
  title: string;
  notes: string | null;

  status: string;

  priority: number;

  due_at: string | null;

  project_id: string | null;
};

type ProjectRow = {
  id: string;
  name: string;

  next_step: string | null;

  status: string;

  priority: number;

  last_activity_at: string;
};

type NotificationKind =
  | 'task_reminder'
  | 'task_overdue'
  | 'project_followup'
  | 'project_missing_next_step'
  | 'daily_brief'
  | 'system';

// ============================================================
// LOCAL TIME HELPERS
// ============================================================

function safeTimezone(
  timezone: string
): string {
  try {
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          timezone,
      }
    ).format(
      new Date()
    );

    return timezone;
  } catch {
    return 'UTC';
  }
}

function localParts(
  date: Date,
  timezone: string
) {
  const safeZone =
    safeTimezone(
      timezone
    );

  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          safeZone,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hourCycle:
          'h23',
      }
    );

  const parts =
    formatter
      .formatToParts(
        date
      );

  const get =
    (
      type: string
    ) =>
      parts.find(
        (part) =>
          part.type ===
          type
      )?.value ??
      '';

  return {
    year:
      get('year'),

    month:
      get('month'),

    day:
      get('day'),

    hour:
      Number(
        get('hour')
      ),

    minute:
      Number(
        get('minute')
      ),
  };
}

function localDateKey(
  date: Date,
  timezone: string
): string {
  const parts =
    localParts(
      date,
      timezone
    );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localMinutesNow(
  date: Date,
  timezone: string
): number {
  const parts =
    localParts(
      date,
      timezone
    );

  return (
    parts.hour *
      60 +
    parts.minute
  );
}

function parseTimeMinutes(
  value: string
): number | null {
  const match =
    /^(\d{1,2}):(\d{2})/
      .exec(
        value
      );

  if (!match) {
    return null;
  }

  const hour =
    Number(
      match[1]
    );

  const minute =
    Number(
      match[2]
    );

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return (
    hour *
      60 +
    minute
  );
}

// ============================================================
// WEEK KEY
// Used so stale Project reminders happen at most once/week.
// ============================================================

function weekKey(
  now: Date,
  timezone: string
) {
  const dateKey =
    localDateKey(
      now,
      timezone
    );

  const [
    year,
    month,
    day,
  ] =
    dateKey
      .split('-')
      .map(
        Number
      );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  const weekday =
    date
      .getUTCDay() ||
    7;

  date.setUTCDate(
    date.getUTCDate() +
      4 -
      weekday
  );

  const yearStart =
    new Date(
      Date.UTC(
        date.getUTCFullYear(),
        0,
        1
      )
    );

  const week =
    Math.ceil(
      (
        (
          date.getTime() -
          yearStart.getTime()
        ) /
          86400000 +
        1
      ) /
        7
    );

  return `${date.getUTCFullYear()}-W${String(
    week
  ).padStart(
    2,
    '0'
  )}`;
}

// ============================================================
// INSERT NOTIFICATION
// Duplicate keys are silently ignored.
// ============================================================

async function createNotification({
  supabase,
  userId,
  kind,
  title,
  body,
  priority,
  taskId,
  projectId,
  dedupeKey,
  scheduledFor,
  metadata,
}: {
  supabase: any;

  userId: string;

  kind:
    NotificationKind;

  title: string;

  body: string;

  priority: number;

  taskId?:
    string | null;

  projectId?:
    string | null;

  dedupeKey:
    string;

  scheduledFor:
    string;

  metadata?:
    Record<
      string,
      unknown
    >;
}): Promise<
  'created' |
  'duplicate' |
  'error'
> {
  const {
    error,
  } =
    await supabase
      .from(
        'notifications'
      )
      .insert({
        user_id:
          userId,

        kind,

        title,

        body,

        priority,

        task_id:
          taskId ??
          null,

        project_id:
          projectId ??
          null,

        scheduled_for:
          scheduledFor,

        status:
          'pending',

        dedupe_key:
          dedupeKey,

        metadata:
          metadata ??
          {},
      });

  if (!error) {
    return 'created';
  }

  // PostgreSQL unique violation.
  if (
    error.code ===
    '23505'
  ) {
    return 'duplicate';
  }

  console.error(
    'A2 notification insert error:',
    error
  );

  return 'error';
}

// ============================================================
// DAILY BRIEF COPY
// Deterministic for now.
// ============================================================

function buildDailyBrief({
  tasks,
  projects,
  now,
}: {
  tasks:
    TaskRow[];

  projects:
    ProjectRow[];

  now: Date;
}) {
  const overdue =
    tasks.filter(
      (
        task
      ) =>
        task.due_at &&
        new Date(
          task.due_at
        ) <
          now
    );

  const future =
    tasks
      .filter(
        (
          task
        ) =>
          task.due_at &&
          new Date(
            task.due_at
          ) >=
            now
      )
      .sort(
        (
          first,
          second
        ) =>
          new Date(
            first.due_at!
          ).getTime() -
          new Date(
            second.due_at!
          ).getTime()
      );

  const topTask =
    overdue
      .sort(
        (
          first,
          second
        ) =>
          second.priority -
          first.priority
      )[0] ??
    future[0] ??
    tasks
      .sort(
        (
          first,
          second
        ) =>
          second.priority -
          first.priority
      )[0] ??
    null;

  if (
    overdue.length >
    0 &&
    topTask
  ) {
    return {
      title:
        'A2 Daily Brief',

      body:
        `${overdue.length} ${
          overdue.length ===
          1
            ? 'task is'
            : 'tasks are'
        } overdue. Start with ${topTask.title}.`,
    };
  }

  if (
    topTask
  ) {
    return {
      title:
        'A2 Daily Brief',

      body:
        `Nothing is overdue. Your next priority is ${topTask.title}.`,
    };
  }

  const topProject =
    projects[0] ??
    null;

  if (
    topProject
      ?.next_step
  ) {
    return {
      title:
        'A2 Daily Brief',

      body:
        `Nothing is pressing today. ${topProject.name}'s next step is ${topProject.next_step}.`,
    };
  }

  return {
    title:
      'A2 Daily Brief',

    body:
      'Nothing is pressing right now.',
  };
}

// ============================================================
// PROCESS ONE USER
// ============================================================

async function processUser({
  supabase,
  preferences,
  now,
}: {
  supabase: any;

  preferences:
    NotificationPreferences;

  now: Date;
}) {
  const userId =
    preferences.user_id;

  const timezone =
    safeTimezone(
      preferences.timezone
    );

  let created =
    0;

  let duplicates =
    0;

  let errors =
    0;

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
          notes,
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
        .order(
          'due_at',
          {
            ascending:
              true,

            nullsFirst:
              false,
          }
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
              true,
          }
        )
        .limit(
          50
        ),
    ]);

  if (
    taskResult.error
  ) {
    throw taskResult.error;
  }

  if (
    projectResult.error
  ) {
    throw projectResult.error;
  }

  const tasks =
    (
      taskResult.data ??
      []
    ) as TaskRow[];

  const projects =
    (
      projectResult.data ??
      []
    ) as ProjectRow[];

  async function countResult(
    result:
      'created' |
      'duplicate' |
      'error'
  ) {
    if (
      result ===
      'created'
    ) {
      created += 1;
    } else if (
      result ===
      'duplicate'
    ) {
      duplicates += 1;
    } else {
      errors += 1;
    }
  }

  // ==========================================================
  // TASK REMINDERS
  // ==========================================================

  if (
    preferences
      .task_reminders
  ) {
    const reminderMinutes =
      Math.max(
        0,
        Math.min(
          10080,
          preferences
            .task_reminder_minutes
        )
      );

    const reminderCutoff =
      new Date(
        now.getTime() +
          reminderMinutes *
            60_000
      );

    for (
      const task of
      tasks
    ) {
      if (
        !task.due_at
      ) {
        continue;
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
        continue;
      }

      if (
        due <= now ||
        due >
          reminderCutoff
      ) {
        continue;
      }

      const result =
        await createNotification({
          supabase,

          userId,

          kind:
            'task_reminder',

          title:
            'Upcoming task',

          body:
            `${task.title} is due soon.`,

          priority:
            task.priority,

          taskId:
            task.id,

          projectId:
            task.project_id,

          scheduledFor:
            now.toISOString(),

          dedupeKey:
            `task-reminder:${task.id}:${task.due_at}:${reminderMinutes}`,

          metadata: {
            due_at:
              task.due_at,

            reminder_minutes:
              reminderMinutes,
          },
        });

      await countResult(
        result
      );
    }
  }

  // ==========================================================
  // OVERDUE TASKS
  // ==========================================================

  if (
    preferences
      .overdue_alerts
  ) {
    for (
      const task of
      tasks
    ) {
      if (
        !task.due_at
      ) {
        continue;
      }

      const due =
        new Date(
          task.due_at
        );

      if (
        Number.isNaN(
          due.getTime()
        ) ||
        due >= now
      ) {
        continue;
      }

      const result =
        await createNotification({
          supabase,

          userId,

          kind:
            'task_overdue',

          title:
            'Task overdue',

          body:
            `${task.title} is overdue.`,

          priority:
            Math.max(
              3,
              task.priority
            ),

          taskId:
            task.id,

          projectId:
            task.project_id,

          scheduledFor:
            now.toISOString(),

          dedupeKey:
            `task-overdue:${task.id}:${task.due_at}`,

          metadata: {
            due_at:
              task.due_at,
          },
        });

      await countResult(
        result
      );
    }
  }

  // ==========================================================
  // PROJECT FOLLOW-UPS
  // ==========================================================

  if (
    preferences
      .project_followups
  ) {
    const staleCutoff =
      now.getTime() -
      7 *
        24 *
        60 *
        60 *
        1000;

    const currentWeek =
      weekKey(
        now,
        timezone
      );

    for (
      const project of
      projects
    ) {
      // Don't nag about low-priority Projects.
      if (
        project.priority <
        4
      ) {
        continue;
      }

      if (
        !project
          .next_step
          ?.trim()
      ) {
        const result =
          await createNotification({
            supabase,

            userId,

            kind:
              'project_missing_next_step',

            title:
              'Project needs a next step',

            body:
              `${project.name} is active but has no next step.`,

            priority:
              project.priority,

            projectId:
              project.id,

            scheduledFor:
              now.toISOString(),

            dedupeKey:
              `project-next-step:${project.id}:${project.last_activity_at}`,

            metadata: {
              project_priority:
                project.priority,
            },
          });

        await countResult(
          result
        );

        // Don't create a second stale notification
        // for the same Project in this run.
        continue;
      }

      const lastActivity =
        new Date(
          project
            .last_activity_at
        );

      if (
        !Number.isNaN(
          lastActivity
            .getTime()
        ) &&
        lastActivity
          .getTime() <=
          staleCutoff
      ) {
        const result =
          await createNotification({
            supabase,

            userId,

            kind:
              'project_followup',

            title:
              'Project follow-up',

            body:
              `${project.name} has been quiet for a week. Next step: ${project.next_step}.`,

            priority:
              project.priority,

            projectId:
              project.id,

            scheduledFor:
              now.toISOString(),

            dedupeKey:
              `project-followup:${project.id}:${currentWeek}`,

            metadata: {
              last_activity_at:
                project
                  .last_activity_at,

              next_step:
                project
                  .next_step,
            },
          });

        await countResult(
          result
        );
      }
    }
  }

  // ==========================================================
  // DAILY BRIEF
  // ==========================================================

  if (
    preferences
      .daily_brief
  ) {
    const currentMinutes =
      localMinutesNow(
        now,
        timezone
      );

    const targetMinutes =
      parseTimeMinutes(
        preferences
          .daily_brief_time
      );

    // Generate during the hour following
    // the configured briefing time.
    if (
      targetMinutes !==
        null &&
      currentMinutes >=
        targetMinutes &&
      currentMinutes <
        targetMinutes +
          60
    ) {
      const today =
        localDateKey(
          now,
          timezone
        );

      const brief =
        buildDailyBrief({
          tasks,
          projects,
          now,
        });

      const result =
        await createNotification({
          supabase,

          userId,

          kind:
            'daily_brief',

          title:
            brief.title,

          body:
            brief.body,

          priority:
            2,

          scheduledFor:
            now.toISOString(),

          dedupeKey:
            `daily-brief:${today}`,

          metadata: {
            timezone,

            local_date:
              today,

            open_tasks:
              tasks.length,

            active_projects:
              projects.length,
          },
        });

      await countResult(
        result
      );
    }
  }

  return {
    created,
    duplicates,
    errors,
  };
}

// ============================================================
// EDGE FUNCTION
// ============================================================

export default {
  fetch: withSupabase(
    {
auth:
  'secret:automations',
    },

    async (
      _req,
      ctx
    ) => {
      try {
        const supabase =
          ctx.supabaseAdmin;

        const now =
          new Date();

        const {
          data:
            preferences,

          error:
            preferencesError,
        } =
          await supabase
            .from(
              'notification_preferences'
            )
            .select(`
              user_id,
              enabled,
              task_reminders,
              overdue_alerts,
              project_followups,
              daily_brief,
              push_enabled,
              task_reminder_minutes,
              daily_brief_time,
              quiet_hours_enabled,
              quiet_hours_start,
              quiet_hours_end,
              timezone
            `)
            .eq(
              'enabled',
              true
            )
            .limit(
              500
            );

        if (
          preferencesError
        ) {
          throw preferencesError;
        }

        let usersProcessed =
          0;

        let notificationsCreated =
          0;

        let duplicates =
          0;

        let errors =
          0;

        for (
          const preferencesRow of
          preferences ??
          []
        ) {
          try {
            const result =
              await processUser({
                supabase,

                preferences:
                  preferencesRow as
                    NotificationPreferences,

                now,
              });

            usersProcessed +=
              1;

            notificationsCreated +=
              result.created;

            duplicates +=
              result.duplicates;

            errors +=
              result.errors;
          } catch (
            error
          ) {
            errors +=
              1;

            console.error(
              'A2 proactive user processing error:',
              preferencesRow
                .user_id,
              error
            );
          }
        }

        return Response.json({
          success:
            true,

          users_processed:
            usersProcessed,

          notifications_created:
            notificationsCreated,

          duplicates_skipped:
            duplicates,

          errors,

          ran_at:
            now
              .toISOString(),
        });
      } catch (
        error
      ) {
        console.error(
          'A2 proactive engine error:',
          error
        );

        return Response.json(
          {
            success:
              false,

            error:
              'A2 proactive engine failed.',
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