import {
    useCallback,
    useEffect,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import {
    StatusBar,
} from 'expo-status-bar';

import {
    useLocalSearchParams,
    useRouter,
} from 'expo-router';

import {
    supabase,
} from '../../lib/supabase';

type ProjectStatus =
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'archived';

type Project = {
  id: string;
  name: string;
  summary: string | null;
  objective: string | null;
  next_step: string | null;
  status: ProjectStatus;
  priority: number;
  last_activity_at: string;
};

type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: number;
  due_at: string | null;
};

export default function ProjectDetailScreen() {
  const router =
    useRouter();

  const {
    id,
  } =
    useLocalSearchParams<{
      id: string;
    }>();

  const projectId =
    Array.isArray(
      id
    )
      ? id[0]
      : id;

  const [
    project,
    setProject,
  ] =
    useState<Project | null>(
      null
    );

  const [
    tasks,
    setTasks,
  ] =
    useState<Task[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const [
    summary,
    setSummary,
  ] =
    useState('');

  const [
    objective,
    setObjective,
  ] =
    useState('');

  const [
    nextStep,
    setNextStep,
  ] =
    useState('');

  const [
    taskTitle,
    setTaskTitle,
  ] =
    useState('');

  // ==========================================================
  // LOAD
  // ==========================================================

  const loadProject =
    useCallback(
      async () => {
        if (
          !projectId
        ) {
          return;
        }

        setErrorMessage('');

        try {
          const [
            projectResult,
            taskResult,
          ] =
            await Promise.all([
              supabase
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
                  'id',
                  projectId
                )
                .single(),

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
                  due_at
                `)
                .eq(
                  'project_id',
                  projectId
                )
                .neq(
                  'status',
                  'cancelled'
                )
                .order(
                  'status',
                  {
                    ascending:
                      true,
                  }
                )
                .order(
                  'priority',
                  {
                    ascending:
                      false,
                  }
                ),
            ]);

          if (
            projectResult.error
          ) {
            throw projectResult.error;
          }

          if (
            taskResult.error
          ) {
            throw taskResult.error;
          }

          const loaded =
            projectResult.data as Project;

          setProject(
            loaded
          );

          setSummary(
            loaded.summary ??
              ''
          );

          setObjective(
            loaded.objective ??
              ''
          );

          setNextStep(
            loaded.next_step ??
              ''
          );

          setTasks(
            (
              taskResult.data ??
              []
            ) as Task[]
          );
        } catch (error) {
          console.error(
            'A2 project detail load error:',
            error
          );

          setErrorMessage(
            'A2 could not load this project.'
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        projectId,
      ]
    );

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  // ==========================================================
  // SAVE PROJECT
  // ==========================================================

  async function saveProject() {
    if (
      !project ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const {
        error,
      } =
        await supabase
          .from(
            'projects'
          )
          .update({
            summary:
              summary.trim() ||
              null,

            objective:
              objective.trim() ||
              null,

            next_step:
              nextStep.trim() ||
              null,

            last_activity_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            project.id
          );

      if (error) {
        throw error;
      }

      await loadProject();
    } catch (error) {
      console.error(
        'A2 project save error:',
        error
      );

      setErrorMessage(
        'A2 could not save this project.'
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  // ==========================================================
  // STATUS
  // ==========================================================

  async function setProjectStatus(
    status:
      ProjectStatus
  ) {
    if (
      !project
    ) {
      return;
    }

    try {
      const {
        error,
      } =
        await supabase
          .from(
            'projects'
          )
          .update({
            status,

            last_activity_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            project.id
          );

      if (error) {
        throw error;
      }

      if (
        status ===
        'archived'
      ) {
        router.replace(
          '/projects' as any
        );

        return;
      }

      await loadProject();
    } catch (error) {
      console.error(
        'A2 project status error:',
        error
      );

      setErrorMessage(
        'A2 could not change project status.'
      );
    }
  }

  // ==========================================================
  // CREATE LINKED TASK
  // ==========================================================

  async function addTask() {
    const cleanTitle =
      taskTitle.trim();

    if (
      !cleanTitle ||
      !project
    ) {
      return;
    }

    try {
      const {
        data: {
          user,
        },
      } =
        await supabase
          .auth
          .getUser();

      if (
        !user
      ) {
        throw new Error(
          'No authenticated user.'
        );
      }

      const {
        error,
      } =
        await supabase
          .from(
            'tasks'
          )
          .insert({
            user_id:
              user.id,

            project_id:
              project.id,

            title:
              cleanTitle,

            status:
              'open',

            priority:
              3,

            source:
              'manual',
          });

      if (error) {
        throw error;
      }

      setTaskTitle('');

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
        );

      await loadProject();
    } catch (error) {
      console.error(
        'A2 project task create error:',
        error
      );

      setErrorMessage(
        'A2 could not create the task.'
      );
    }
  }

  // ==========================================================
  // COMPLETE TASK
  // ==========================================================

  async function toggleTask(
    task: Task
  ) {
    const completed =
      task.status ===
      'completed';

    try {
      const {
        error,
      } =
        await supabase
          .from(
            'tasks'
          )
          .update({
            status:
              completed
                ? 'open'
                : 'completed',

            completed_at:
              completed
                ? null
                : new Date()
                    .toISOString(),
          })
          .eq(
            'id',
            task.id
          );

      if (error) {
        throw error;
      }

      await loadProject();
    } catch (error) {
      console.error(
        'A2 project task update error:',
        error
      );
    }
  }

  // ==========================================================
  // UI
  // ==========================================================

  if (
    loading
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <StatusBar
          style="dark"
        />

        <ActivityIndicator />
      </View>
    );
  }

  if (
    !project
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <Text>
          Project unavailable.
        </Text>
      </View>
    );
  }

  const openTasks =
    tasks.filter(
      (
        task
      ) =>
        task.status !==
        'completed'
    );

  const completedTasks =
    tasks.filter(
      (
        task
      ) =>
        task.status ===
        'completed'
    );

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
            router.back()
          }
          style={
            styles.headerSide
          }
        >
          <Text
            style={
              styles.back
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
          PROJECT
        </Text>

        <View
          style={
            styles.headerSide
          }
        />
      </View>

      <ScrollView
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
          {project.status
            .replace(
              '_',
              ' '
            )
            .toUpperCase()}
          {'  •  '}
          PRIORITY {
            project.priority
          }
        </Text>

        <Text
          style={
            styles.title
          }
        >
          {
            project.name
          }
        </Text>

        {errorMessage ? (
          <Text
            style={
              styles.error
            }
          >
            {
              errorMessage
            }
          </Text>
        ) : null}

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionLabel
            }
          >
            SUMMARY
          </Text>

          <TextInput
            value={
              summary
            }
            onChangeText={
              setSummary
            }
            placeholder="What is this project?"
            placeholderTextColor="rgba(37,36,31,0.28)"
            multiline
            style={
              styles.largeInput
            }
          />
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionLabel
            }
          >
            OBJECTIVE
          </Text>

          <TextInput
            value={
              objective
            }
            onChangeText={
              setObjective
            }
            placeholder="What does success look like?"
            placeholderTextColor="rgba(37,36,31,0.28)"
            multiline
            style={
              styles.largeInput
            }
          />
        </View>

        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionLabel
            }
          >
            NEXT STEP
          </Text>

          <TextInput
            value={
              nextStep
            }
            onChangeText={
              setNextStep
            }
            placeholder="What should happen next?"
            placeholderTextColor="rgba(37,36,31,0.28)"
            multiline
            style={
              styles.largeInput
            }
          />
        </View>

        <Pressable
          onPress={
            saveProject
          }
          style={
            styles.saveButton
          }
        >
          <Text
            style={
              styles.saveButtonText
            }
          >
            {saving
              ? 'SAVING'
              : 'SAVE PROJECT'}
          </Text>
        </Pressable>

        <View
          style={
            styles.taskSection
          }
        >
          <Text
            style={
              styles.sectionLabel
            }
          >
            TASKS
          </Text>

          <View
            style={
              styles.taskComposer
            }
          >
            <TextInput
              value={
                taskTitle
              }
              onChangeText={
                setTaskTitle
              }
              placeholder="Add task..."
              placeholderTextColor="rgba(37,36,31,0.29)"
              onSubmitEditing={
                addTask
              }
              style={
                styles.taskInput
              }
            />

            <Pressable
              onPress={
                addTask
              }
              disabled={
                !taskTitle.trim()
              }
              style={[
                styles.taskAdd,

                !taskTitle.trim() &&
                  styles.taskAddDisabled,
              ]}
            >
              <Text
                style={
                  styles.taskAddText
                }
              >
                +
              </Text>
            </Pressable>
          </View>

          {openTasks.map(
            (
              task
            ) => (
              <Pressable
                key={
                  task.id
                }
                onPress={() =>
                  toggleTask(
                    task
                  )
                }
                style={
                  styles.taskRow
                }
              >
                <View
                  style={
                    styles.taskCircle
                  }
                />

                <View
                  style={
                    styles.taskTextWrap
                  }
                >
                  <Text
                    style={
                      styles.taskTitle
                    }
                  >
                    {
                      task.title
                    }
                  </Text>

                  <Text
                    style={
                      styles.taskMeta
                    }
                  >
                    PRIORITY {
                      task.priority
                    }
                  </Text>
                </View>
              </Pressable>
            )
          )}

          {completedTasks.length >
          0 ? (
            <Text
              style={
                styles.completedLabel
              }
            >
              COMPLETED
            </Text>
          ) : null}

          {completedTasks.map(
            (
              task
            ) => (
              <Pressable
                key={
                  task.id
                }
                onPress={() =>
                  toggleTask(
                    task
                  )
                }
                style={[
                  styles.taskRow,
                  styles.completedTask,
                ]}
              >
                <View
                  style={[
                    styles.taskCircle,
                    styles.taskCircleDone,
                  ]}
                />

                <Text
                  style={
                    styles.completedText
                  }
                >
                  {
                    task.title
                  }
                </Text>
              </Pressable>
            )
          )}
        </View>

        <View
          style={
            styles.statusSection
          }
        >
          {project.status !==
          'active' ? (
            <Pressable
              onPress={() =>
                setProjectStatus(
                  'active'
                )
              }
              style={
                styles.statusButton
              }
            >
              <Text
                style={
                  styles.statusButtonText
                }
              >
                MARK ACTIVE
              </Text>
            </Pressable>
          ) : null}

          {project.status !==
          'on_hold' ? (
            <Pressable
              onPress={() =>
                setProjectStatus(
                  'on_hold'
                )
              }
              style={
                styles.statusButton
              }
            >
              <Text
                style={
                  styles.statusButtonText
                }
              >
                PUT ON HOLD
              </Text>
            </Pressable>
          ) : null}

          {project.status !==
          'completed' ? (
            <Pressable
              onPress={() =>
                setProjectStatus(
                  'completed'
                )
              }
              style={
                styles.statusButton
              }
            >
              <Text
                style={
                  styles.statusButtonText
                }
              >
                COMPLETE
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() =>
              setProjectStatus(
                'archived'
              )
            }
            style={[
              styles.statusButton,
              styles.archiveButton,
            ]}
          >
            <Text
              style={
                styles.archiveText
              }
            >
              ARCHIVE PROJECT
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        '#F3F1EC',
    },

    loadingScreen: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#F3F1EC',
    },

    header: {
      height: 76,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      paddingHorizontal:
        20,
      borderBottomWidth:
        1,
      borderBottomColor:
        'rgba(35,33,29,0.055)',
    },

    headerSide: {
      width: 44,
      height: 44,
      justifyContent:
        'center',
    },

    back: {
      fontSize: 22,
      color:
        '#25241F',
    },

    brand: {
      fontSize: 10,
      fontWeight:
        '600',
      letterSpacing:
        3.2,
      color:
        '#25241F',
    },

    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf:
        'center',
      paddingHorizontal:
        23,
      paddingTop: 48,
      paddingBottom: 100,
    },

    eyebrow: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.7,
      color:
        'rgba(37,36,31,0.33)',
    },

    title: {
      marginTop: 12,
      marginBottom: 37,
      fontSize: 37,
      fontWeight:
        '400',
      letterSpacing:
        -1.25,
      color:
        '#25241F',
    },

    error: {
      marginBottom: 20,
      color:
        '#7E3737',
      fontSize: 13,
    },

    section: {
      marginBottom: 25,
    },

    sectionLabel: {
      marginBottom: 10,
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.7,
      color:
        'rgba(37,36,31,0.32)',
    },

    largeInput: {
      minHeight: 83,
      padding: 17,
      borderRadius: 18,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.07)',
      backgroundColor:
        'rgba(255,255,255,0.36)',
      color:
        '#25241F',
      fontSize: 15,
      lineHeight: 22,
      textAlignVertical:
        'top',
    },

    saveButton: {
      minHeight: 48,
      marginTop: 2,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius: 17,
      backgroundColor:
        '#25241F',
    },

    saveButtonText: {
      fontSize: 9,
      fontWeight:
        '600',
      letterSpacing:
        1.6,
      color:
        '#F3F1EC',
    },

    taskSection: {
      marginTop: 55,
    },

    taskComposer: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginBottom: 15,
      borderRadius: 18,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.07)',
      backgroundColor:
        'rgba(255,255,255,0.36)',
    },

    taskInput: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal:
        17,
      fontSize: 14,
      color:
        '#25241F',
    },

    taskAdd: {
      width: 44,
      height: 44,
      marginRight: 4,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius: 22,
      backgroundColor:
        '#25241F',
    },

    taskAddDisabled: {
      opacity: 0.14,
    },

    taskAddText: {
      color:
        '#F3F1EC',
      fontSize: 22,
    },

    taskRow: {
      minHeight: 59,
      flexDirection:
        'row',
      alignItems:
        'center',
      borderBottomWidth:
        1,
      borderBottomColor:
        'rgba(35,33,29,0.055)',
    },

    taskCircle: {
      width: 17,
      height: 17,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        'rgba(37,36,31,0.30)',
    },

    taskCircleDone: {
      backgroundColor:
        '#25241F',
    },

    taskTextWrap: {
      flex: 1,
      marginLeft: 13,
    },

    taskTitle: {
      fontSize: 14,
      color:
        '#25241F',
    },

    taskMeta: {
      marginTop: 4,
      fontSize: 7,
      letterSpacing:
        1.2,
      color:
        'rgba(37,36,31,0.28)',
    },

    completedLabel: {
      marginTop: 30,
      marginBottom: 6,
      fontSize: 7,
      letterSpacing:
        1.5,
      color:
        'rgba(37,36,31,0.27)',
    },

    completedTask: {
      opacity: 0.42,
    },

    completedText: {
      marginLeft: 13,
      fontSize: 14,
      textDecorationLine:
        'line-through',
      color:
        '#25241F',
    },

    statusSection: {
      marginTop: 65,
      gap: 8,
    },

    statusButton: {
      minHeight: 46,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.08)',
    },

    statusButtonText: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.4,
      color:
        'rgba(37,36,31,0.58)',
    },

    archiveButton: {
      marginTop: 14,
      borderColor:
        'rgba(126,55,55,0.10)',
    },

    archiveText: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.4,
      color:
        'rgba(126,55,55,0.60)',
    },
  });