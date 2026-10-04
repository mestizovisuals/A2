import {
  useFocusEffect,
  useRouter,
} from 'expo-router';

import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  StatusBar,
} from 'expo-status-bar';

import {
  supabase,
} from '../lib/supabase';

import {
  useA2Push,
} from '../hooks/useA2Push';

// ============================================================
// TYPES
// ============================================================

type NotificationStatus =
  | 'pending'
  | 'delivered'
  | 'read'
  | 'dismissed';

type A2Notification = {
  id: string;

  kind:
    | 'task_reminder'
    | 'task_overdue'
    | 'project_followup'
    | 'project_missing_next_step'
    | 'daily_brief'
    | 'system';

  title: string;
  body: string;

  priority: number;

  task_id: string | null;
  project_id: string | null;

  status:
    NotificationStatus;

  scheduled_for:
    string | null;

  created_at: string;

  read_at:
    string | null;
};

// ============================================================
// HELPERS
// ============================================================

function isUnread(
  notification:
    A2Notification
) {
  return (
    notification.status ===
      'pending' ||
    notification.status ===
      'delivered'
  );
}

function notificationLabel(
  kind:
    A2Notification['kind']
) {
  switch (kind) {
    case 'task_reminder':
      return 'REMINDER';

    case 'task_overdue':
      return 'OVERDUE';

    case 'project_followup':
      return 'PROJECT';

    case 'project_missing_next_step':
      return 'PROJECT';

    case 'daily_brief':
      return 'DAILY BRIEF';

    default:
      return 'A2';
  }
}

function formatTime(
  value: string
) {
  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  const now =
    new Date();

  const difference =
    now.getTime() -
    date.getTime();

  const minutes =
    Math.floor(
      difference /
        60_000
    );

  if (
    minutes <
    1
  ) {
    return 'Now';
  }

  if (
    minutes <
    60
  ) {
    return `${minutes}m`;
  }

  const hours =
    Math.floor(
      minutes /
        60
    );

  if (
    hours <
    24
  ) {
    return `${hours}h`;
  }

  const days =
    Math.floor(
      hours /
        24
    );

  if (
    days <
    7
  ) {
    return `${days}d`;
  }

  return date
    .toLocaleDateString(
      undefined,
      {
        month:
          'short',

        day:
          'numeric',
      }
    );
}

// ============================================================
// SCREEN
// ============================================================

export default function NotificationsScreen() {
  const router =
    useRouter();

    const {
  supported:
    pushSupported,

  subscribed:
    pushSubscribed,

  permission:
    pushPermission,

  loading:
    pushLoading,

  errorMessage:
    pushError,

  enablePush,

  disablePush,
} =
  useA2Push();

  const [
    notifications,
    setNotifications,
  ] =
    useState<
      A2Notification[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  // ----------------------------------------------------------
  // LOAD
  // ----------------------------------------------------------

  const loadNotifications =
    useCallback(
      async () => {
        setLoading(
          true
        );

        setErrorMessage(
          ''
        );

        try {
          const {
            data,
            error,
          } =
            await supabase
              .from(
                'notifications'
              )
              .select(`
                id,
                kind,
                title,
                body,
                priority,
                task_id,
                project_id,
                status,
                scheduled_for,
                created_at,
                read_at
              `)
              .neq(
                'status',
                'dismissed'
              )
              .order(
                'created_at',
                {
                  ascending:
                    false,
                }
              )
              .limit(
                100
              );

          if (
            error
          ) {
            throw error;
          }

          setNotifications(
            (
              data ??
              []
            ) as A2Notification[]
          );
        } catch (
          error
        ) {
          console.warn(
            'A2 notification load error:',
            error
          );

          setErrorMessage(
            'A2 could not load notifications.'
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  useFocusEffect(
    useCallback(
      () => {
        void loadNotifications();
      },
      [
        loadNotifications,
      ]
    )
  );

  // ----------------------------------------------------------
  // COUNTS
  // ----------------------------------------------------------

  const unreadCount =
    useMemo(
      () =>
        notifications
          .filter(
            isUnread
          )
          .length,
      [
        notifications,
      ]
    );

  // ----------------------------------------------------------
  // MARK READ
  // ----------------------------------------------------------

  async function markRead(
    notification:
      A2Notification
  ) {
    if (
      !isUnread(
        notification
      )
    ) {
      return true;
    }

    const now =
      new Date()
        .toISOString();

    const {
      error,
    } =
      await supabase
        .from(
          'notifications'
        )
        .update({
          status:
            'read',

          read_at:
            now,
        })
        .eq(
          'id',
          notification.id
        );

    if (
      error
    ) {
      console.warn(
        'A2 mark notification read error:',
        error
      );

      return false;
    }

    setNotifications(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            notification.id
              ? {
                  ...item,

                  status:
                    'read',

                  read_at:
                    now,
                }
              : item
        )
    );

    return true;
  }

  // ----------------------------------------------------------
  // OPEN
  // ----------------------------------------------------------

  async function openNotification(
    notification:
      A2Notification
  ) {
    await markRead(
      notification
    );

    if (
      notification
        .project_id
    ) {
      router.push({
        pathname:
          '/projects/[id]',

        params: {
          id:
            notification
              .project_id,
        },
      });

      return;
    }

    if (
      notification
        .task_id
    ) {
      router.push(
        '/today'
      );
    }
  }

  // ----------------------------------------------------------
  // DISMISS
  // ----------------------------------------------------------

  async function dismissNotification(
    notification:
      A2Notification
  ) {
    const now =
      new Date()
        .toISOString();

    const {
      error,
    } =
      await supabase
        .from(
          'notifications'
        )
        .update({
          status:
            'dismissed',

          dismissed_at:
            now,
        })
        .eq(
          'id',
          notification.id
        );

    if (
      error
    ) {
      console.warn(
        'A2 dismiss notification error:',
        error
      );

      return;
    }

    setNotifications(
      (
        current
      ) =>
        current.filter(
          (
            item
          ) =>
            item.id !==
            notification.id
        )
    );
  }

  // ----------------------------------------------------------
  // MARK ALL READ
  // ----------------------------------------------------------

  async function markAllRead() {
    if (
      unreadCount ===
      0
    ) {
      return;
    }

    const now =
      new Date()
        .toISOString();

    const {
      error,
    } =
      await supabase
        .from(
          'notifications'
        )
        .update({
          status:
            'read',

          read_at:
            now,
        })
        .in(
          'status',
          [
            'pending',
            'delivered',
          ]
        );

    if (
      error
    ) {
      console.warn(
        'A2 mark all notifications error:',
        error
      );

      return;
    }

    setNotifications(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            isUnread(
              item
            )
              ? {
                  ...item,

                  status:
                    'read',

                  read_at:
                    now,
                }
              : item
        )
    );
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <View
      style={
        styles.screen
      }
    >
      <StatusBar
        style="dark"
      />

      {/* HEADER */}

      <View
        style={
          styles.header
        }
      >
        <Pressable
          onPress={() =>
            router.back()
          }
          style={
            styles.backButton
          }
        >
          <Text
            style={
              styles.backText
            }
          >
            ←
          </Text>
        </Pressable>

        <View
          style={
            styles.headerCenter
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            A2
          </Text>

          <Text
            style={
              styles.title
            }
          >
            Notifications
          </Text>
        </View>

        <Pressable
          onPress={
            markAllRead
          }
          disabled={
            unreadCount ===
            0
          }
          style={
            styles.markAllButton
          }
        >
          <Text
            style={[
              styles.markAllText,

              unreadCount ===
                0 &&
                styles.markAllDisabled,
            ]}
          >
            READ ALL
          </Text>
        </Pressable>
      </View>

      {/* SUMMARY */}

      <View
        style={
          styles.summary
        }
      >
        <Text
          style={
            styles.summaryText
          }
        >
          {unreadCount ===
          0
            ? 'Nothing needs your attention.'
            : unreadCount ===
                1
              ? '1 item needs your attention.'
              : `${unreadCount} items need your attention.`}
        </Text>
      </View>

      <View
  style={
    styles.pushShell
  }
>
  <View
    style={
      styles.pushCard
    }
  >
    <View
      style={
        styles.pushTextArea
      }
    >
      <Text
        style={
          styles.pushLabel
        }
      >
        PUSH
      </Text>

      <Text
        style={
          styles.pushTitle
        }
      >
        {pushSubscribed
          ? 'Push notifications enabled'
          : 'Enable proactive alerts'}
      </Text>

      <Text
        style={
          styles.pushDescription
        }
      >
        {!pushSupported
          ? 'Web Push is not supported in this environment.'
          : pushPermission ===
              'denied'
            ? 'Notifications are blocked in browser settings.'
            : pushSubscribed
              ? 'A2 can deliver important alerts when the app is not open.'
              : 'Allow A2 to notify you about reminders and important follow-ups.'}
      </Text>

      {pushError ? (
        <Text
          style={
            styles.pushError
          }
        >
          {pushError}
        </Text>
      ) : null}
    </View>

    {pushSupported &&
      pushPermission !==
        'denied' && (
      <Pressable
        onPress={() => {
          if (
            pushSubscribed
          ) {
            void disablePush();
          } else {
            void enablePush();
          }
        }}
        disabled={
          pushLoading
        }
        style={[
          styles.pushButton,

          pushSubscribed &&
            styles.pushButtonSecondary,
        ]}
      >
        <Text
          style={[
            styles.pushButtonText,

            pushSubscribed &&
              styles.pushButtonTextSecondary,
          ]}
        >
          {pushLoading
            ? 'WORKING'
            : pushSubscribed
              ? 'DISABLE'
              : 'ENABLE'}
        </Text>
      </Pressable>
    )}
  </View>
</View>

      {/* CONTENT */}

      <ScrollView
        style={
          styles.scroll
        }
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {loading ? (
          <View
            style={
              styles.emptyState
            }
          >
            <Text
              style={
                styles.emptyLabel
              }
            >
              SYNCING
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Checking A2 notifications…
            </Text>
          </View>
        ) : errorMessage ? (
          <View
            style={
              styles.emptyState
            }
          >
            <Text
              style={
                styles.emptyText
              }
            >
              {errorMessage}
            </Text>
          </View>
        ) : notifications
            .length ===
          0 ? (
          <View
            style={
              styles.emptyState
            }
          >
            <Text
              style={
                styles.emptyLabel
              }
            >
              QUIET
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              A2 is quiet for now.
            </Text>
          </View>
        ) : (
          notifications.map(
            (
              notification
            ) => {
              const unread =
                isUnread(
                  notification
                );

              const actionable =
                Boolean(
                  notification
                    .task_id ||
                    notification
                      .project_id
                );

              return (
                <View
                  key={
                    notification.id
                  }
                  style={[
                    styles.card,

                    unread &&
                      styles.cardUnread,
                  ]}
                >
                  <Pressable
                    onPress={() =>
                      openNotification(
                        notification
                      )
                    }
                    style={
                      styles.cardBody
                    }
                  >
                    <View
                      style={
                        styles.cardTop
                      }
                    >
                      <View
                        style={
                          styles.cardMeta
                        }
                      >
                        {unread && (
                          <View
                            style={
                              styles.unreadDot
                            }
                          />
                        )}

                        <Text
                          style={
                            styles.kind
                          }
                        >
                          {notificationLabel(
                            notification.kind
                          )}
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.time
                        }
                      >
                        {formatTime(
                          notification
                            .created_at
                        )}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.cardTitle
                      }
                    >
                      {
                        notification.title
                      }
                    </Text>

                    <Text
                      style={
                        styles.cardText
                      }
                    >
                      {
                        notification.body
                      }
                    </Text>

                    {actionable && (
                      <Text
                        style={
                          styles.actionText
                        }
                      >
                        {notification
                          .project_id
                          ? 'OPEN PROJECT →'
                          : 'OPEN TODAY →'}
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      dismissNotification(
                        notification
                      )
                    }
                    style={
                      styles.dismissButton
                    }
                  >
                    <Text
                      style={
                        styles.dismissText
                      }
                    >
                      ×
                    </Text>
                  </Pressable>
                </View>
              );
            }
          )
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,

      backgroundColor:
        '#F3F1EC',
    },

    header: {
      height: 94,

      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal:
        24,
    },

    backButton: {
      width: 70,
      height: 44,

      justifyContent:
        'center',
    },

    backText: {
      fontSize: 20,

      color:
        'rgba(36,35,32,0.68)',
    },

    headerCenter: {
      flex: 1,

      alignItems:
        'center',
    },

    eyebrow: {
      fontSize: 7,

      fontWeight:
        '600',

      letterSpacing:
        2.4,

      color:
        'rgba(36,35,32,0.28)',
    },

    title: {
      marginTop: 5,

      fontSize: 18,

      fontWeight:
        '400',

      letterSpacing:
        -0.3,

      color:
        '#262520',
    },

    markAllButton: {
      width: 70,

      alignItems:
        'flex-end',
    },

    markAllText: {
      fontSize: 7,

      fontWeight:
        '600',

      letterSpacing:
        1.1,

      color:
        'rgba(36,35,32,0.52)',
    },

    markAllDisabled: {
      opacity: 0.28,
    },

    summary: {
      alignItems:
        'center',

      paddingBottom: 20,

      paddingHorizontal: 24,
    },

    summaryText: {
      fontSize: 12,

      color:
        'rgba(36,35,32,0.42)',
    },

    scroll: {
      flex: 1,
    },

    scrollContent: {
      width: '100%',

      maxWidth: 720,

      alignSelf:
        'center',

      paddingHorizontal: 20,

      paddingBottom: 50,
    },

    emptyState: {
      minHeight: 280,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    emptyLabel: {
      fontSize: 7,

      fontWeight:
        '600',

      letterSpacing:
        2,

      color:
        'rgba(36,35,32,0.26)',
    },

    emptyText: {
      marginTop: 12,

      fontSize: 16,

      color:
        'rgba(36,35,32,0.48)',
    },

    card: {
      position:
        'relative',

      marginBottom: 10,

      borderRadius: 20,

      borderWidth: 1,

      borderColor:
        'rgba(35,33,29,0.065)',

      backgroundColor:
        'rgba(255,255,255,0.28)',

      overflow:
        'hidden',
    },

    cardUnread: {
      backgroundColor:
        'rgba(255,255,255,0.52)',

      borderColor:
        'rgba(35,33,29,0.10)',
    },

    cardBody: {
      paddingHorizontal: 18,

      paddingTop: 16,

      paddingBottom: 17,

      paddingRight: 48,
    },

    cardTop: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    cardMeta: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    unreadDot: {
      width: 5,
      height: 5,

      borderRadius: 3,

      marginRight: 8,

      backgroundColor:
        '#262520',
    },

    kind: {
      fontSize: 7,

      fontWeight:
        '600',

      letterSpacing:
        1.5,

      color:
        'rgba(36,35,32,0.34)',
    },

    time: {
      fontSize: 9,

      color:
        'rgba(36,35,32,0.28)',
    },

    cardTitle: {
      marginTop: 10,

      fontSize: 15,

      fontWeight:
        '500',

      color:
        '#262520',
    },

    cardText: {
      marginTop: 5,

      fontSize: 13,

      lineHeight: 19,

      color:
        'rgba(36,35,32,0.58)',
    },

    actionText: {
      marginTop: 12,

      fontSize: 7,

      fontWeight:
        '600',

      letterSpacing:
        1.25,

      color:
        'rgba(36,35,32,0.42)',
    },

    dismissButton: {
      position:
        'absolute',

      top: 8,
      right: 8,

      width: 34,
      height: 34,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    dismissText: {
      fontSize: 18,

      fontWeight:
        '300',

      color:
        'rgba(36,35,32,0.28)',
    },

    pushShell: {
  width: '100%',
  maxWidth: 720,

  alignSelf:
    'center',

  paddingHorizontal: 20,

  marginBottom: 12,
},

pushCard: {
  flexDirection:
    'row',

  alignItems:
    'center',

  borderRadius: 20,

  borderWidth: 1,

  borderColor:
    'rgba(35,33,29,0.07)',

  backgroundColor:
    'rgba(255,255,255,0.30)',

  paddingHorizontal: 18,

  paddingVertical: 16,
},

pushTextArea: {
  flex: 1,

  paddingRight: 18,
},

pushLabel: {
  fontSize: 7,

  fontWeight:
    '600',

  letterSpacing: 1.7,

  color:
    'rgba(36,35,32,0.28)',
},

pushTitle: {
  marginTop: 6,

  fontSize: 14,

  fontWeight:
    '500',

  color:
    '#262520',
},

pushDescription: {
  marginTop: 5,

  fontSize: 11,

  lineHeight: 16,

  color:
    'rgba(36,35,32,0.48)',
},

pushError: {
  marginTop: 7,

  fontSize: 10,

  color:
    'rgba(110,45,45,0.72)',
},

pushButton: {
  minWidth: 72,

  minHeight: 34,

  borderRadius: 17,

  alignItems:
    'center',

  justifyContent:
    'center',

  paddingHorizontal: 14,

  backgroundColor:
    '#262520',
},

pushButtonSecondary: {
  backgroundColor:
    'transparent',

  borderWidth: 1,

  borderColor:
    'rgba(36,35,32,0.16)',
},

pushButtonText: {
  fontSize: 7,

  fontWeight:
    '600',

  letterSpacing: 1.1,

  color:
    '#F3F1EC',
},

pushButtonTextSecondary: {
  color:
    'rgba(36,35,32,0.48)',
},
  });