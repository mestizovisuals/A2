import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { supabase } from '../lib/supabase';

type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

type Task = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: number;
  due_at: string | null;
  completed_at: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export default function TodayScreen() {
  const router = useRouter();

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [tasks, setTasks] =
    useState<Task[]>([]);

  const [errorMessage, setErrorMessage] =
    useState('');

  const [showComposer, setShowComposer] =
    useState(false);

  const [title, setTitle] =
    useState('');

  const [notes, setNotes] =
    useState('');

  const [priority, setPriority] =
    useState(3);

  const [dueDate, setDueDate] =
    useState('');

  const [dueTime, setDueTime] =
    useState('');

  const [busyTaskId, setBusyTaskId] =
    useState<string | null>(null);

  const [
    confirmDeleteId,
    setConfirmDeleteId,
  ] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    setErrorMessage('');

    try {
      const {
        data: { session },
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        router.replace('/');
        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from('tasks')
        .select(`
          id,
          user_id,
          title,
          notes,
          status,
          priority,
          due_at,
          completed_at,
          source,
          created_at,
          updated_at
        `)
        .eq(
          'user_id',
          session.user.id
        )
        .neq(
          'status',
          'cancelled'
        )
        .order(
          'priority',
          {
            ascending: false,
          }
        )
        .order(
          'due_at',
          {
            ascending: true,
            nullsFirst: false,
          }
        )
        .order(
          'created_at',
          {
            ascending: false,
          }
        );

      if (error) {
        throw error;
      }

      setTasks(
        (data ?? []) as Task[]
      );
    } catch (error) {
      console.error(
        'A2 Today load error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not load your tasks.'
      );
    } finally {
      setLoading(false);
    }
  }

  function resetComposer() {
    setTitle('');
    setNotes('');
    setPriority(3);
    setDueDate('');
    setDueTime('');
    setShowComposer(false);
  }

  function buildDueDate():
    | string
    | null {
    const cleanDate =
      dueDate.trim();

    const cleanTime =
      dueTime.trim();

    if (!cleanDate) {
      return null;
    }

    const datePattern =
      /^\d{4}-\d{2}-\d{2}$/;

    const timePattern =
      /^\d{2}:\d{2}$/;

    if (
      !datePattern.test(
        cleanDate
      )
    ) {
      throw new Error(
        'Use YYYY-MM-DD for the due date.'
      );
    }

    if (
      cleanTime &&
      !timePattern.test(
        cleanTime
      )
    ) {
      throw new Error(
        'Use HH:MM for the due time.'
      );
    }

    const date =
      new Date(
        `${cleanDate}T${
          cleanTime || '12:00'
        }:00`
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      throw new Error(
        'That due date is not valid.'
      );
    }

    return date.toISOString();
  }

  async function createTask() {
    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      setErrorMessage(
        'Give the task a title.'
      );

      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const {
        data: { session },
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        router.replace('/');
        return;
      }

      const dueAt =
        buildDueDate();

      const {
        error,
      } = await supabase
        .from('tasks')
        .insert({
          user_id:
            session.user.id,

          title:
            cleanTitle,

          notes:
            notes.trim() ||
            null,

          priority,

          due_at:
            dueAt,

          status:
            'open',

          source:
            'manual',
        });

      if (error) {
        throw error;
      }

      resetComposer();

      await loadTasks();
    } catch (error) {
      console.error(
        'A2 task creation error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not create the task.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function setTaskStatus(
    task: Task,
    status: TaskStatus
  ) {
    setBusyTaskId(
      task.id
    );

    setConfirmDeleteId(
      null
    );

    try {
      const completedAt =
        status === 'completed'
          ? new Date()
              .toISOString()
          : null;

      const {
        error,
      } = await supabase
        .from('tasks')
        .update({
          status,
          completed_at:
            completedAt,
        })
        .eq(
          'id',
          task.id
        );

      if (error) {
        throw error;
      }

      await loadTasks();
    } catch (error) {
      console.error(
        'A2 task update error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not update the task.'
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  async function deleteTask(
    task: Task
  ) {
    setBusyTaskId(
      task.id
    );

    try {
      const {
        error,
      } = await supabase
        .from('tasks')
        .delete()
        .eq(
          'id',
          task.id
        );

      if (error) {
        throw error;
      }

      setConfirmDeleteId(
        null
      );

      await loadTasks();
    } catch (error) {
      console.error(
        'A2 task delete error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not delete the task.'
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  const openTasks =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.status ===
              'open' ||
            task.status ===
              'in_progress'
        ),
      [tasks]
    );

  const completedTasks =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.status ===
            'completed'
        ),
      [tasks]
    );

  const todayTasks =
    useMemo(
      () =>
        openTasks.filter(
          (task) =>
            task.due_at &&
            isToday(
              new Date(
                task.due_at
              )
            )
        ),
      [openTasks]
    );

  const overdueTasks =
    useMemo(
      () =>
        openTasks.filter(
          (task) => {
            if (
              !task.due_at
            ) {
              return false;
            }

            const due =
              new Date(
                task.due_at
              );

            return (
              !isToday(due) &&
              due.getTime() <
                startOfToday()
                  .getTime()
            );
          }
        ),
      [openTasks]
    );

  const upcomingTasks =
    useMemo(
      () =>
        openTasks.filter(
          (task) => {
            if (
              !task.due_at
            ) {
              return false;
            }

            const due =
              new Date(
                task.due_at
              );

            return (
              !isToday(due) &&
              due.getTime() >
                endOfToday()
                  .getTime()
            );
          }
        ),
      [openTasks]
    );

  const unscheduledTasks =
    useMemo(
      () =>
        openTasks.filter(
          (task) =>
            !task.due_at
        ),
      [openTasks]
    );

  const dateLabel =
    useMemo(() => {
      return new Intl.DateTimeFormat(
        undefined,
        {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }
      ).format(
        new Date()
      );
    }, []);

  const topPriority =
    useMemo(() => {
      const candidates = [
        ...overdueTasks,
        ...todayTasks,
        ...unscheduledTasks,
        ...upcomingTasks,
      ];

      return candidates
        .sort(
          (a, b) =>
            b.priority -
            a.priority
        )[0];
    }, [
      overdueTasks,
      todayTasks,
      unscheduledTasks,
      upcomingTasks,
    ]);

  return (
    <View
      style={
        styles.screen
      }
    >
      <StatusBar
        style="dark"
      />

      <View
        style={
          styles.header
        }
      >
        <Pressable
          onPress={() =>
            router.replace('/')
          }
          style={
            styles.headerButton
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

        <Text
          style={
            styles.brand
          }
        >
          A2
        </Text>

        <Pressable
          onPress={loadTasks}
          style={[
            styles.headerButton,
            styles.headerButtonRight,
          ]}
        >
          <Text
            style={
              styles.refreshText
            }
          >
            ↻
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            color="#25241F"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Loading today...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={
            styles.scroll
          }
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            TODAY
          </Text>

          <Text
            style={
              styles.date
            }
          >
            {dateLabel}
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            A focused view of
            what deserves your
            attention.
          </Text>

          {errorMessage ? (
            <View
              style={
                styles.errorCard
              }
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {errorMessage}
              </Text>

              <Pressable
                onPress={() =>
                  setErrorMessage(
                    ''
                  )
                }
              >
                <Text
                  style={
                    styles.dismissText
                  }
                >
                  DISMISS
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View
            style={
              styles.divider
            }
          />

          <View
            style={
              styles.priorityHeader
            }
          >
            <Text
              style={
                styles.sectionLabel
              }
            >
              PRIORITY
            </Text>

            <Pressable
              onPress={() =>
                setShowComposer(
                  (current) =>
                    !current
                )
              }
            >
              <Text
                style={
                  styles.addText
                }
              >
                {showComposer
                  ? 'CLOSE'
                  : '+ ADD TASK'}
              </Text>
            </Pressable>
          </View>

          {topPriority ? (
            <View
              style={
                styles.heroTask
              }
            >
              <View
                style={
                  styles.heroTop
                }
              >
                <Text
                  style={
                    styles.heroPriority
                  }
                >
                  PRIORITY{' '}
                  {topPriority.priority}
                </Text>

                {topPriority.status ===
                  'in_progress' && (
                  <Text
                    style={
                      styles.inProgressBadge
                    }
                  >
                    IN PROGRESS
                  </Text>
                )}
              </View>

              <Text
                style={
                  styles.heroTitle
                }
              >
                {
                  topPriority.title
                }
              </Text>

              {topPriority.notes ? (
                <Text
                  style={
                    styles.heroNotes
                  }
                >
                  {
                    topPriority.notes
                  }
                </Text>
              ) : null}

              {topPriority.due_at ? (
                <Text
                  style={
                    styles.heroDue
                  }
                >
                  {formatDueDate(
                    topPriority.due_at
                  )}
                </Text>
              ) : (
                <Text
                  style={
                    styles.heroDue
                  }
                >
                  No due date
                </Text>
              )}
            </View>
          ) : (
            <View
              style={
                styles.emptyHero
              }
            >
              <Text
                style={
                  styles.emptyHeroTitle
                }
              >
                Nothing demanding
                your attention.
              </Text>

              <Text
                style={
                  styles.emptyHeroText
                }
              >
                Add a task when
                something needs to
                enter your radar.
              </Text>
            </View>
          )}

          {showComposer && (
            <View
              style={
                styles.composerCard
              }
            >
              <Text
                style={
                  styles.composerTitle
                }
              >
                New task
              </Text>

              <TextInput
                value={title}
                onChangeText={
                  setTitle
                }
                placeholder="What needs to happen?"
                placeholderTextColor="rgba(37, 36, 31, 0.28)"
                style={
                  styles.input
                }
              />

              <TextInput
                value={notes}
                onChangeText={
                  setNotes
                }
                placeholder="Notes — optional"
                placeholderTextColor="rgba(37, 36, 31, 0.28)"
                multiline
                style={[
                  styles.input,
                  styles.notesInput,
                ]}
              />

              <Text
                style={
                  styles.formLabel
                }
              >
                PRIORITY
              </Text>

              <View
                style={
                  styles.priorityButtons
                }
              >
                {[
                  1,
                  2,
                  3,
                  4,
                  5,
                ].map(
                  (value) => (
                    <Pressable
                      key={
                        value
                      }
                      onPress={() =>
                        setPriority(
                          value
                        )
                      }
                      style={[
                        styles.priorityButton,

                        priority ===
                          value &&
                          styles.priorityButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityButtonText,

                          priority ===
                            value &&
                            styles.priorityButtonTextActive,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              <View
                style={
                  styles.dateRow
                }
              >
                <View
                  style={
                    styles.dateField
                  }
                >
                  <Text
                    style={
                      styles.formLabel
                    }
                  >
                    DUE DATE
                  </Text>

                  <TextInput
                    value={
                      dueDate
                    }
                    onChangeText={
                      setDueDate
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="rgba(37, 36, 31, 0.28)"
                    autoCapitalize="none"
                    style={
                      styles.input
                    }
                  />
                </View>

                <View
                  style={
                    styles.timeField
                  }
                >
                  <Text
                    style={
                      styles.formLabel
                    }
                  >
                    TIME
                  </Text>

                  <TextInput
                    value={
                      dueTime
                    }
                    onChangeText={
                      setDueTime
                    }
                    placeholder="HH:MM"
                    placeholderTextColor="rgba(37, 36, 31, 0.28)"
                    autoCapitalize="none"
                    style={
                      styles.input
                    }
                  />
                </View>
              </View>

              <Text
                style={
                  styles.dateHint
                }
              >
                Date and time are
                optional. Example:
                2026-10-03 and
                09:30.
              </Text>

              <View
                style={
                  styles.composerActions
                }
              >
                <Pressable
                  onPress={
                    resetComposer
                  }
                  style={
                    styles.secondaryButton
                  }
                >
                  <Text
                    style={
                      styles.secondaryButtonText
                    }
                  >
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={
                    createTask
                  }
                  disabled={
                    saving ||
                    !title.trim()
                  }
                  style={[
                    styles.primaryButton,

                    (saving ||
                      !title.trim()) &&
                      styles.primaryButtonDisabled,
                  ]}
                >
                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    {saving
                      ? 'Adding...'
                      : 'Add task'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <TaskSection
            label="OVERDUE"
            tasks={
              overdueTasks
            }
            emptyText=""
            busyTaskId={
              busyTaskId
            }
            confirmDeleteId={
              confirmDeleteId
            }
            setConfirmDeleteId={
              setConfirmDeleteId
            }
            onStatusChange={
              setTaskStatus
            }
            onDelete={
              deleteTask
            }
          />

          <TaskSection
            label="TODAY"
            tasks={
              todayTasks
            }
            emptyText="Nothing else due today."
            busyTaskId={
              busyTaskId
            }
            confirmDeleteId={
              confirmDeleteId
            }
            setConfirmDeleteId={
              setConfirmDeleteId
            }
            onStatusChange={
              setTaskStatus
            }
            onDelete={
              deleteTask
            }
          />

          <TaskSection
            label="UPCOMING"
            tasks={
              upcomingTasks.slice(
                0,
                8
              )
            }
            emptyText="No upcoming deadlines."
            busyTaskId={
              busyTaskId
            }
            confirmDeleteId={
              confirmDeleteId
            }
            setConfirmDeleteId={
              setConfirmDeleteId
            }
            onStatusChange={
              setTaskStatus
            }
            onDelete={
              deleteTask
            }
          />

          <TaskSection
            label="NO DATE"
            tasks={
              unscheduledTasks
            }
            emptyText="No unscheduled tasks."
            busyTaskId={
              busyTaskId
            }
            confirmDeleteId={
              confirmDeleteId
            }
            setConfirmDeleteId={
              setConfirmDeleteId
            }
            onStatusChange={
              setTaskStatus
            }
            onDelete={
              deleteTask
            }
          />

          {completedTasks.length >
            0 && (
            <TaskSection
              label="COMPLETED"
              tasks={
                completedTasks.slice(
                  0,
                  10
                )
              }
              emptyText=""
              busyTaskId={
                busyTaskId
              }
              confirmDeleteId={
                confirmDeleteId
              }
              setConfirmDeleteId={
                setConfirmDeleteId
              }
              onStatusChange={
                setTaskStatus
              }
              onDelete={
                deleteTask
              }
              completed
            />
          )}

          <View
            style={
              styles.footerSpace
            }
          />
        </ScrollView>
      )}
    </View>
  );
}

function TaskSection({
  label,
  tasks,
  emptyText,
  busyTaskId,
  confirmDeleteId,
  setConfirmDeleteId,
  onStatusChange,
  onDelete,
  completed = false,
}: {
  label: string;
  tasks: Task[];
  emptyText: string;
  busyTaskId:
    | string
    | null;
  confirmDeleteId:
    | string
    | null;
  setConfirmDeleteId: (
    id: string | null
  ) => void;
  onStatusChange: (
    task: Task,
    status: TaskStatus
  ) => Promise<void>;
  onDelete: (
    task: Task
  ) => Promise<void>;
  completed?: boolean;
}) {
  if (
    tasks.length === 0 &&
    !emptyText
  ) {
    return null;
  }

  return (
    <View
      style={
        styles.taskSection
      }
    >
      <View
        style={
          styles.sectionHeader
        }
      >
        <Text
          style={
            styles.sectionLabel
          }
        >
          {label}
        </Text>

        {tasks.length >
          0 && (
          <Text
            style={
              styles.sectionCount
            }
          >
            {tasks.length}
          </Text>
        )}
      </View>

      {tasks.length === 0 ? (
        <Text
          style={
            styles.emptySectionText
          }
        >
          {emptyText}
        </Text>
      ) : (
        <View
          style={
            styles.taskList
          }
        >
          {tasks.map(
            (task) => (
              <TaskCard
                key={
                  task.id
                }
                task={
                  task
                }
                busy={
                  busyTaskId ===
                  task.id
                }
                completed={
                  completed
                }
                confirmingDelete={
                  confirmDeleteId ===
                  task.id
                }
                onStatusChange={
                  onStatusChange
                }
                onDeleteRequest={() =>
                  setConfirmDeleteId(
                    task.id
                  )
                }
                onDeleteCancel={() =>
                  setConfirmDeleteId(
                    null
                  )
                }
                onDelete={() =>
                  onDelete(
                    task
                  )
                }
              />
            )
          )}
        </View>
      )}
    </View>
  );
}

function TaskCard({
  task,
  busy,
  completed,
  confirmingDelete,
  onStatusChange,
  onDeleteRequest,
  onDeleteCancel,
  onDelete,
}: {
  task: Task;
  busy: boolean;
  completed: boolean;
  confirmingDelete: boolean;
  onStatusChange: (
    task: Task,
    status: TaskStatus
  ) => Promise<void>;
  onDeleteRequest:
    () => void;
  onDeleteCancel:
    () => void;
  onDelete:
    () => void;
}) {
  return (
    <View
      style={[
        styles.taskCard,

        completed &&
          styles.taskCardCompleted,
      ]}
    >
      <View
        style={
          styles.taskTop
        }
      >
        <View
          style={
            styles.taskPriority
          }
        >
          <Text
            style={
              styles.taskPriorityText
            }
          >
            P{task.priority}
          </Text>
        </View>

        {task.status ===
          'in_progress' && (
          <Text
            style={
              styles.inProgressBadge
            }
          >
            IN PROGRESS
          </Text>
        )}
      </View>

      <Text
        style={[
          styles.taskTitle,

          completed &&
            styles.completedText,
        ]}
      >
        {task.title}
      </Text>

      {task.notes ? (
        <Text
          style={[
            styles.taskNotes,

            completed &&
              styles.completedText,
          ]}
        >
          {task.notes}
        </Text>
      ) : null}

      <Text
        style={
          styles.taskDue
        }
      >
        {task.due_at
          ? formatDueDate(
              task.due_at
            )
          : 'No due date'}
      </Text>

      <View
        style={
          styles.taskControls
        }
      >
        {!completed &&
          task.status ===
            'open' && (
            <Pressable
              onPress={() =>
                onStatusChange(
                  task,
                  'in_progress'
                )
              }
              disabled={
                busy
              }
            >
              <Text
                style={
                  styles.controlText
                }
              >
                START
              </Text>
            </Pressable>
          )}

        {!completed &&
          task.status ===
            'in_progress' && (
            <Pressable
              onPress={() =>
                onStatusChange(
                  task,
                  'open'
                )
              }
              disabled={
                busy
              }
            >
              <Text
                style={
                  styles.controlText
                }
              >
                PAUSE
              </Text>
            </Pressable>
          )}

        {!completed && (
          <Pressable
            onPress={() =>
              onStatusChange(
                task,
                'completed'
              )
            }
            disabled={busy}
          >
            <Text
              style={
                styles.completeText
              }
            >
              COMPLETE
            </Text>
          </Pressable>
        )}

        {completed && (
          <Pressable
            onPress={() =>
              onStatusChange(
                task,
                'open'
              )
            }
            disabled={busy}
          >
            <Text
              style={
                styles.controlText
              }
            >
              REOPEN
            </Text>
          </Pressable>
        )}

        {!confirmingDelete ? (
          <Pressable
            onPress={
              onDeleteRequest
            }
            disabled={busy}
          >
            <Text
              style={
                styles.deleteText
              }
            >
              DELETE
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={
                onDeleteCancel
              }
            >
              <Text
                style={
                  styles.controlText
                }
              >
                CANCEL
              </Text>
            </Pressable>

            <Pressable
              onPress={
                onDelete
              }
            >
              <Text
                style={
                  styles.confirmDeleteText
                }
              >
                CONFIRM DELETE
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function startOfToday() {
  const date =
    new Date();

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date;
}

function endOfToday() {
  const date =
    new Date();

  date.setHours(
    23,
    59,
    59,
    999
  );

  return date;
}

function isToday(
  date: Date
) {
  const today =
    new Date();

  return (
    date.getFullYear() ===
      today.getFullYear() &&
    date.getMonth() ===
      today.getMonth() &&
    date.getDate() ===
      today.getDate()
  );
}

function formatDueDate(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Due date unavailable';
  }

  const day =
    new Intl.DateTimeFormat(
      undefined,
      {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }
    ).format(date);

  const time =
    new Intl.DateTimeFormat(
      undefined,
      {
        hour: 'numeric',
        minute: '2-digit',
      }
    ).format(date);

  return `${day} • ${time}`;
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        '#F3F1EC',
    },

    header: {
      height: 78,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      paddingHorizontal:
        22,
      borderBottomWidth:
        1,
      borderBottomColor:
        'rgba(35, 33, 29, 0.06)',
    },

    headerButton: {
      width: 44,
      height: 44,
      justifyContent:
        'center',
    },

    headerButtonRight: {
      alignItems:
        'flex-end',
    },

    backText: {
      fontSize: 23,
      color:
        '#25241F',
    },

    refreshText: {
      fontSize: 20,
      color:
        'rgba(37, 36, 31, 0.5)',
    },

    brand: {
      fontSize: 14,
      fontWeight:
        '600',
      letterSpacing: 5,
      color:
        '#22211E',
    },

    loading: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    loadingText: {
      marginTop: 14,
      fontSize: 12,
      letterSpacing: 1,
      color:
        'rgba(37, 36, 31, 0.42)',
    },

    scroll: {
      flex: 1,
    },

    content: {
      width: '100%',
      maxWidth: 900,
      alignSelf:
        'center',
      paddingHorizontal:
        26,
      paddingTop: 56,
    },

    eyebrow: {
      fontSize: 9,
      fontWeight:
        '600',
      letterSpacing:
        2.4,
      color:
        'rgba(37, 36, 31, 0.38)',
      marginBottom: 15,
    },

    date: {
      fontSize: 35,
      lineHeight: 40,
      letterSpacing:
        -1.2,
      color:
        '#25241F',
    },

    subtitle: {
      marginTop: 13,
      fontSize: 15,
      lineHeight: 23,
      color:
        'rgba(37, 36, 31, 0.48)',
    },

    divider: {
      height: 1,
      backgroundColor:
        'rgba(35, 33, 29, 0.07)',
      marginTop: 42,
      marginBottom: 34,
    },

    priorityHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    sectionHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    sectionLabel: {
      fontSize: 9,
      fontWeight:
        '600',
      letterSpacing:
        2.1,
      color:
        'rgba(37, 36, 31, 0.4)',
    },

    sectionCount: {
      fontSize: 10,
      color:
        'rgba(37, 36, 31, 0.35)',
    },

    addText: {
      fontSize: 9,
      letterSpacing:
        1.2,
      color:
        'rgba(37, 36, 31, 0.55)',
    },

    heroTask: {
      marginTop: 15,
      padding: 25,
      borderRadius: 25,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.07)',
      backgroundColor:
        'rgba(255,255,255,0.5)',
    },

    heroTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    heroPriority: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.6,
      color:
        'rgba(37, 36, 31, 0.4)',
    },

    heroTitle: {
      marginTop: 18,
      fontSize: 25,
      lineHeight: 31,
      letterSpacing:
        -0.7,
      color:
        '#25241F',
    },

    heroNotes: {
      marginTop: 10,
      maxWidth: 650,
      fontSize: 14,
      lineHeight: 21,
      color:
        'rgba(37, 36, 31, 0.6)',
    },

    heroDue: {
      marginTop: 18,
      fontSize: 10,
      letterSpacing:
        0.8,
      color:
        'rgba(37, 36, 31, 0.38)',
    },

    emptyHero: {
      marginTop: 15,
      padding: 25,
      borderRadius: 25,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.07)',
      backgroundColor:
        'rgba(255,255,255,0.32)',
    },

    emptyHeroTitle: {
      fontSize: 18,
      color:
        '#25241F',
    },

    emptyHeroText: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(37, 36, 31, 0.45)',
    },

    composerCard: {
      marginTop: 12,
      padding: 22,
      borderRadius: 23,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.08)',
      backgroundColor:
        'rgba(255,255,255,0.58)',
    },

    composerTitle: {
      fontSize: 18,
      color:
        '#25241F',
      marginBottom: 15,
    },

    input: {
      width: '100%',
      minHeight: 48,
      paddingHorizontal:
        14,
      paddingVertical:
        11,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.08)',
      backgroundColor:
        'rgba(255,255,255,0.56)',
      fontSize: 14,
      color:
        '#25241F',
      marginBottom: 10,
    },

    notesInput: {
      minHeight: 82,
      textAlignVertical:
        'top',
    },

    formLabel: {
      marginTop: 8,
      marginBottom: 8,
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.5,
      color:
        'rgba(37, 36, 31, 0.36)',
    },

    priorityButtons: {
      flexDirection:
        'row',
      gap: 7,
      marginBottom: 8,
    },

    priorityButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(35, 33, 29, 0.045)',
    },

    priorityButtonActive: {
      backgroundColor:
        '#25241F',
    },

    priorityButtonText: {
      fontSize: 11,
      color:
        'rgba(37, 36, 31, 0.55)',
    },

    priorityButtonTextActive: {
      color:
        '#F3F1EC',
    },

    dateRow: {
      flexDirection:
        'row',
      gap: 10,
    },

    dateField: {
      flex: 2,
    },

    timeField: {
      flex: 1,
    },

    dateHint: {
      marginTop: 1,
      fontSize: 10,
      lineHeight: 15,
      color:
        'rgba(37, 36, 31, 0.32)',
    },

    composerActions: {
      marginTop: 17,
      flexDirection:
        'row',
      justifyContent:
        'flex-end',
      gap: 9,
    },

    secondaryButton: {
      paddingHorizontal:
        18,
      paddingVertical:
        11,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.08)',
    },

    secondaryButtonText: {
      fontSize: 11,
      color:
        'rgba(37, 36, 31, 0.6)',
    },

    primaryButton: {
      paddingHorizontal:
        20,
      paddingVertical:
        11,
      borderRadius: 15,
      backgroundColor:
        '#25241F',
    },

    primaryButtonDisabled: {
      opacity: 0.3,
    },

    primaryButtonText: {
      fontSize: 11,
      color:
        '#F3F1EC',
    },

    taskSection: {
      marginTop: 48,
    },

    taskList: {
      marginTop: 12,
      gap: 10,
    },

    taskCard: {
      padding: 20,
      borderRadius: 21,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.07)',
      backgroundColor:
        'rgba(255,255,255,0.36)',
    },

    taskCardCompleted: {
      opacity: 0.52,
    },

    taskTop: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    taskPriority: {
      paddingHorizontal:
        8,
      paddingVertical:
        5,
      borderRadius: 999,
      backgroundColor:
        'rgba(35, 33, 29, 0.045)',
    },

    taskPriorityText: {
      fontSize: 8,
      letterSpacing: 1,
      color:
        'rgba(37, 36, 31, 0.46)',
    },

    inProgressBadge: {
      fontSize: 8,
      letterSpacing:
        1.2,
      color:
        'rgba(37, 36, 31, 0.42)',
    },

    taskTitle: {
      marginTop: 14,
      fontSize: 18,
      lineHeight: 24,
      color:
        '#25241F',
    },

    taskNotes: {
      marginTop: 7,
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(37, 36, 31, 0.58)',
    },

    taskDue: {
      marginTop: 13,
      fontSize: 9,
      letterSpacing:
        0.5,
      color:
        'rgba(37, 36, 31, 0.34)',
    },

    completedText: {
      textDecorationLine:
        'line-through',
    },

    taskControls: {
      marginTop: 17,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor:
        'rgba(35, 33, 29, 0.05)',
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      gap: 18,
    },

    controlText: {
      fontSize: 8,
      letterSpacing:
        1.2,
      color:
        'rgba(37, 36, 31, 0.45)',
    },

    completeText: {
      fontSize: 8,
      letterSpacing:
        1.2,
      color:
        'rgba(20, 70, 45, 0.7)',
    },

    deleteText: {
      fontSize: 8,
      letterSpacing:
        1.2,
      color:
        'rgba(95, 35, 35, 0.52)',
    },

    confirmDeleteText: {
      fontSize: 8,
      letterSpacing:
        1.2,
      color:
        'rgba(115, 35, 35, 0.76)',
    },

    emptySectionText: {
      marginTop: 12,
      fontSize: 12,
      color:
        'rgba(37, 36, 31, 0.36)',
    },

    errorCard: {
      marginTop: 24,
      padding: 16,
      borderRadius: 17,
      backgroundColor:
        'rgba(100, 35, 35, 0.05)',
    },

    errorText: {
      fontSize: 12,
      lineHeight: 18,
      color:
        'rgba(90, 35, 35, 0.75)',
    },

    dismissText: {
      marginTop: 10,
      fontSize: 8,
      letterSpacing:
        1.2,
      color:
        'rgba(90, 35, 35, 0.6)',
    },

    footerSpace: {
      height: 90,
    },
  });