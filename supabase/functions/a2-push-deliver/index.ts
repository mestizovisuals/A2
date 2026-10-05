import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import {
  withSupabase,
} from 'npm:@supabase/server@^1';

import webpush from 'npm:web-push@3.6.7';

type NotificationRow = {
  id: string;
  user_id: string;

  kind: string;

  title: string;
  body: string;

  priority: number;

  task_id: string | null;
  project_id: string | null;

  status: string;

  scheduled_for: string | null;
  created_at: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;

  endpoint: string;

  p256dh: string;
  auth: string;

  is_active: boolean;
};

type PreferenceRow = {
  user_id: string;

  enabled: boolean;
  push_enabled: boolean;

  quiet_hours_enabled: boolean;

  quiet_hours_start: string;
  quiet_hours_end: string;

  timezone: string;
};

type DeliveryRow = {
  notification_id: string;
  subscription_id: string;

  status:
    | 'pending'
    | 'delivered'
    | 'failed'
    | 'expired';

  attempts: number;
};

// ============================================================
// TIME HELPERS
// ============================================================

function safeTimezone(
  timezone: string
) {
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

function currentLocalMinutes(
  date: Date,
  timezone: string
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          safeTimezone(
            timezone
          ),

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

  const hour =
    Number(
      parts.find(
        (
          part
        ) =>
          part.type ===
          'hour'
      )?.value ??
      0
    );

  const minute =
    Number(
      parts.find(
        (
          part
        ) =>
          part.type ===
          'minute'
      )?.value ??
      0
    );

  return (
    hour *
      60 +
    minute
  );
}

function timeToMinutes(
  value: string
) {
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

function isQuietHours(
  preferences:
    PreferenceRow,
  now: Date
) {
  if (
    !preferences
      .quiet_hours_enabled
  ) {
    return false;
  }

  const start =
    timeToMinutes(
      preferences
        .quiet_hours_start
    );

  const end =
    timeToMinutes(
      preferences
        .quiet_hours_end
    );

  if (
    start === null ||
    end === null ||
    start === end
  ) {
    return false;
  }

  const current =
    currentLocalMinutes(
      now,
      preferences
        .timezone
    );

  // Normal range such as
  // 13:00 → 17:00.
  if (
    start <
    end
  ) {
    return (
      current >=
        start &&
      current <
        end
    );
  }

  // Overnight range such as
  // 22:00 → 07:00.
  return (
    current >=
      start ||
    current <
      end
  );
}

// ============================================================
// PUSH PAYLOAD
// ============================================================

function notificationUrl(
  notification:
    NotificationRow
) {
  if (
    notification
      .project_id
  ) {
    return `/projects/${notification.project_id}`;
  }

  if (
    notification
      .task_id
  ) {
    return '/today';
  }

  return '/notifications';
}

function urgencyFor(
  notification:
    NotificationRow
) {
  if (
    notification
      .priority >=
      5 ||
    notification.kind ===
      'task_overdue'
  ) {
    return 'high';
  }

  if (
    notification.kind ===
      'daily_brief'
  ) {
    return 'low';
  }

  return 'normal';
}

// ============================================================
// MAIN
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

        const publicKey =
          Deno.env.get(
            'A2_VAPID_PUBLIC_KEY'
          );

        const privateKey =
          Deno.env.get(
            'A2_VAPID_PRIVATE_KEY'
          );

        const vapidSubject =
          Deno.env.get(
            'A2_VAPID_SUBJECT'
          ) ||
          Deno.env.get(
            'SUPABASE_URL'
          );

        if (
          !publicKey ||
          !privateKey ||
          !vapidSubject
        ) {
          return Response.json(
            {
              success:
                false,

              error:
                'A2 VAPID configuration is incomplete.',
            },
            {
              status:
                500,
            }
          );
        }

        webpush
          .setVapidDetails(
            vapidSubject,
            publicKey,
            privateKey
          );

        const now =
          new Date();

        const nowIso =
          now.toISOString();

        // Prevent newly-added devices from
        // receiving ancient notifications.
        const recentCutoff =
          new Date(
            now.getTime() -
              48 *
                60 *
                60 *
                1000
          )
            .toISOString();

        // ------------------------------------------------------
        // LOAD PUSHABLE NOTIFICATIONS
        // ------------------------------------------------------

        const {
          data:
            notificationData,

          error:
            notificationError,
        } =
          await supabase
            .from(
              'notifications'
            )
            .select(`
              id,
              user_id,
              kind,
              title,
              body,
              priority,
              task_id,
              project_id,
              status,
              scheduled_for,
              created_at
            `)
            .in(
              'status',
              [
                'pending',
                'delivered',
              ]
            )
            .gte(
              'created_at',
              recentCutoff
            )
            .lte(
              'scheduled_for',
              nowIso
            )
            .order(
              'created_at',
              {
                ascending:
                  true,
              }
            )
            .limit(
              100
            );

        if (
          notificationError
        ) {
          throw notificationError;
        }

        const notifications =
          (
            notificationData ??
            []
          ) as NotificationRow[];

        if (
          notifications.length ===
          0
        ) {
          return Response.json({
            success:
              true,

            notifications_checked:
              0,

            pushes_delivered:
              0,

            message:
              'No push notifications are currently due.',
          });
        }

        const userIds =
          [
            ...new Set(
              notifications.map(
                (
                  notification
                ) =>
                  notification
                    .user_id
              )
            ),
          ];

        const notificationIds =
          notifications.map(
            (
              notification
            ) =>
              notification.id
          );

        // ------------------------------------------------------
        // LOAD PREFERENCES + SUBSCRIPTIONS + DELIVERY HISTORY
        // ------------------------------------------------------

        const [
          preferenceResult,
          subscriptionResult,
          deliveryResult,
        ] =
          await Promise.all([
            supabase
              .from(
                'notification_preferences'
              )
              .select(`
                user_id,
                enabled,
                push_enabled,
                quiet_hours_enabled,
                quiet_hours_start,
                quiet_hours_end,
                timezone
              `)
              .in(
                'user_id',
                userIds
              )
              .eq(
                'enabled',
                true
              ),

            supabase
              .from(
                'push_subscriptions'
              )
              .select(`
                id,
                user_id,
                endpoint,
                p256dh,
                auth,
                is_active
              `)
              .in(
                'user_id',
                userIds
              )
              .eq(
                'is_active',
                true
              ),

            supabase
              .from(
                'push_deliveries'
              )
              .select(`
                notification_id,
                subscription_id,
                status,
                attempts
              `)
              .in(
                'notification_id',
                notificationIds
              ),
          ]);

        if (
          preferenceResult.error
        ) {
          throw preferenceResult.error;
        }

        if (
          subscriptionResult.error
        ) {
          throw subscriptionResult.error;
        }

        if (
          deliveryResult.error
        ) {
          throw deliveryResult.error;
        }

        const preferences =
          (
            preferenceResult.data ??
            []
          ) as PreferenceRow[];

        const subscriptions =
          (
            subscriptionResult.data ??
            []
          ) as SubscriptionRow[];

        const deliveries =
          (
            deliveryResult.data ??
            []
          ) as DeliveryRow[];

        const preferenceMap =
          new Map<
            string,
            PreferenceRow
          >();

        for (
          const preference of
          preferences
        ) {
          preferenceMap.set(
            preference.user_id,
            preference
          );
        }

        const subscriptionMap =
          new Map<
            string,
            SubscriptionRow[]
          >();

        for (
          const subscription of
          subscriptions
        ) {
          const existing =
            subscriptionMap.get(
              subscription.user_id
            ) ??
            [];

          existing.push(
            subscription
          );

          subscriptionMap.set(
            subscription.user_id,
            existing
          );
        }

        const deliveryMap =
          new Map<
            string,
            DeliveryRow
          >();

        for (
          const delivery of
          deliveries
        ) {
          deliveryMap.set(
            `${delivery.notification_id}:${delivery.subscription_id}`,
            delivery
          );
        }

        let deliveredCount =
          0;

        let failedCount =
          0;

        let expiredCount =
          0;

        let quietSkipped =
          0;

        let noSubscription =
          0;

        // ------------------------------------------------------
        // SEND
        // ------------------------------------------------------

        for (
          const notification of
          notifications
        ) {
          const preference =
            preferenceMap.get(
              notification.user_id
            );

          if (
            !preference ||
            !preference
              .push_enabled
          ) {
            continue;
          }

          if (
            isQuietHours(
              preference,
              now
            )
          ) {
            quietSkipped +=
              1;

            continue;
          }

          const userSubscriptions =
            subscriptionMap.get(
              notification.user_id
            ) ??
            [];

          if (
            userSubscriptions.length ===
            0
          ) {
            noSubscription +=
              1;

            continue;
          }

          let notificationDelivered =
            false;

          for (
            const subscription of
            userSubscriptions
          ) {
            const deliveryKey =
              `${notification.id}:${subscription.id}`;

            const previous =
              deliveryMap.get(
                deliveryKey
              );

            // Already sent to this exact device.
            if (
              previous?.status ===
                'delivered' ||
              previous?.status ===
                'expired'
            ) {
              if (
                previous.status ===
                'delivered'
              ) {
                notificationDelivered =
                  true;
              }

              continue;
            }

            // Avoid endlessly retrying a
            // temporarily broken endpoint.
            if (
              previous?.status ===
                'failed' &&
              previous.attempts >=
                3
            ) {
              continue;
            }

            const attempts =
              (
                previous
                  ?.attempts ??
                0
              ) +
              1;

            const payload =
              JSON.stringify({
                title:
                  notification.title,

                body:
                  notification.body,

                tag:
                  `a2-${notification.id.slice(
                    0,
                    8
                  )}`,

                url:
                  notificationUrl(
                    notification
                  ),

                notification_id:
                  notification.id,

                kind:
                  notification.kind,
              });

            try {
              const result =
                await webpush
                  .sendNotification(
                    {
                      endpoint:
                        subscription
                          .endpoint,

                      keys: {
                        p256dh:
                          subscription
                            .p256dh,

                        auth:
                          subscription
                            .auth,
                      },
                    },

                    payload,

                    {
                      TTL:
                        3600,

                      urgency:
                        urgencyFor(
                          notification
                        ),
                    }
                  );

              const deliveredAt =
                new Date()
                  .toISOString();

              await supabase
                .from(
                  'push_deliveries'
                )
                .upsert(
                  {
                    notification_id:
                      notification.id,

                    subscription_id:
                      subscription.id,

                    status:
                      'delivered',

                    attempts,

                    last_status_code:
                      result
                        ?.statusCode ??
                      null,

                    last_error:
                      null,

                    delivered_at:
                      deliveredAt,
                  },
                  {
                    onConflict:
                      'notification_id,subscription_id',
                  }
                );

              deliveryMap.set(
                deliveryKey,
                {
                  notification_id:
                    notification.id,

                  subscription_id:
                    subscription.id,

                  status:
                    'delivered',

                  attempts,
                }
              );

              notificationDelivered =
                true;

              deliveredCount +=
                1;
            } catch (
              error: any
            ) {
              const statusCode =
                typeof error
                  ?.statusCode ===
                  'number'
                  ? error.statusCode
                  : null;

              const message =
                typeof error
                  ?.message ===
                  'string'
                  ? error.message
                  : 'Web Push delivery failed.';

              // 404 / 410 generally means this
              // browser subscription no longer exists.
              if (
                statusCode ===
                  404 ||
                statusCode ===
                  410
              ) {
                await supabase
                  .from(
                    'push_subscriptions'
                  )
                  .update({
                    is_active:
                      false,
                  })
                  .eq(
                    'id',
                    subscription.id
                  );

                await supabase
                  .from(
                    'push_deliveries'
                  )
                  .upsert(
                    {
                      notification_id:
                        notification.id,

                      subscription_id:
                        subscription.id,

                      status:
                        'expired',

                      attempts,

                      last_status_code:
                        statusCode,

                      last_error:
                        message,
                    },
                    {
                      onConflict:
                        'notification_id,subscription_id',
                    }
                  );

                expiredCount +=
                  1;

                continue;
              }

              await supabase
                .from(
                  'push_deliveries'
                )
                .upsert(
                  {
                    notification_id:
                      notification.id,

                    subscription_id:
                      subscription.id,

                    status:
                      'failed',

                    attempts,

                    last_status_code:
                      statusCode,

                    last_error:
                      message,
                  },
                  {
                    onConflict:
                      'notification_id,subscription_id',
                  }
                );

              failedCount +=
                1;

              console.warn(
                'A2 push delivery error:',
                {
                  notification:
                    notification.id,

                  subscription:
                    subscription.id,

                  statusCode,

                  message,
                }
              );
            }
          }

          // "delivered" means at least one
          // registered device received the push.
          //
          // We still keep delivered notifications in
          // future delivery scans because another
          // device may not have received it yet.
          if (
            notificationDelivered &&
            notification.status ===
              'pending'
          ) {
            await supabase
              .from(
                'notifications'
              )
              .update({
                status:
                  'delivered',

                delivered_at:
                  new Date()
                    .toISOString(),
              })
              .eq(
                'id',
                notification.id
              );
          }
        }

        return Response.json({
          success:
            true,

          notifications_checked:
            notifications.length,

          pushes_delivered:
            deliveredCount,

          pushes_failed:
            failedCount,

          subscriptions_expired:
            expiredCount,

          quiet_hours_skipped:
            quietSkipped,

          users_without_subscription:
            noSubscription,

          ran_at:
            nowIso,
        });
      } catch (
        error
      ) {
        console.error(
          'A2 push delivery engine error:',
          error
        );

        return Response.json(
          {
            success:
              false,

            error:
              'A2 Push delivery failed.',
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