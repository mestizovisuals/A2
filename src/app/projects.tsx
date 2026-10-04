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
    useRouter,
} from 'expo-router';

import {
    supabase,
} from '../lib/supabase';

type ProjectStatus =
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'archived';

type Project = {
  id: string;
  user_id: string;
  name: string;
  summary: string | null;
  objective: string | null;
  next_step: string | null;
  status: ProjectStatus;
  priority: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

export default function ProjectsScreen() {
  const router =
    useRouter();

  const [
    projects,
    setProjects,
  ] =
    useState<Project[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    creating,
    setCreating,
  ] =
    useState(false);

  const [
    showCreate,
    setShowCreate,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const [
    name,
    setName,
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
    priority,
    setPriority,
  ] =
    useState(3);

  // ==========================================================
  // LOAD PROJECTS
  // ==========================================================

  const loadProjects =
    useCallback(
      async () => {
        setErrorMessage('');

        try {
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
                user_id,
                name,
                summary,
                objective,
                next_step,
                status,
                priority,
                created_at,
                updated_at,
                last_activity_at
              `)
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
            throw error;
          }

          setProjects(
            (
              data ??
              []
            ) as Project[]
          );
        } catch (error) {
          console.error(
            'A2 project load error:',
            error
          );

          setErrorMessage(
            'A2 could not load projects.'
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // ==========================================================
  // CREATE PROJECT
  // ==========================================================

  async function createProject() {
    const cleanName =
      name.trim();

    if (
      !cleanName ||
      creating
    ) {
      return;
    }

    setCreating(true);
    setErrorMessage('');

    try {
      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase
          .auth
          .getUser();

      if (
        userError ||
        !user
      ) {
        throw new Error(
          'User session unavailable.'
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
              user.id,

            name:
              cleanName,

            summary:
              summary.trim() ||
              null,

            objective:
              objective.trim() ||
              null,

            priority,

            status:
              'active',
          })
          .select(`
            id,
            user_id,
            name,
            summary,
            objective,
            next_step,
            status,
            priority,
            created_at,
            updated_at,
            last_activity_at
          `)
          .single();

      if (error) {
        throw error;
      }

      setName('');
      setSummary('');
      setObjective('');
      setPriority(3);
      setShowCreate(false);

      await loadProjects();

      if (
        data?.id
      ) {
        router.push(
          `/projects/${data.id}` as any
        );
      }
    } catch (error: any) {
      console.error(
        'A2 project create error:',
        error
      );

      const message =
        typeof error?.message ===
          'string'
          ? error.message
          : '';

      if (
        message
          .toLowerCase()
          .includes(
            'duplicate'
          )
      ) {
        setErrorMessage(
          'A project with that name already exists.'
        );
      } else {
        setErrorMessage(
          'A2 could not create the project.'
        );
      }
    } finally {
      setCreating(
        false
      );
    }
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  function statusLabel(
    status:
      ProjectStatus
  ) {
    switch (
      status
    ) {
      case 'on_hold':
        return 'ON HOLD';

      case 'completed':
        return 'COMPLETED';

      default:
        return 'ACTIVE';
    }
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
          PROJECTS
        </Text>

        <Pressable
          onPress={() =>
            setShowCreate(
              (
                current
              ) =>
                !current
            )
          }
          style={[
            styles.headerSide,
            styles.headerSideRight,
          ]}
        >
          <Text
            style={
              styles.add
            }
          >
            +
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.hero
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            A2 WORKSPACE
          </Text>

          <Text
            style={
              styles.title
            }
          >
            Projects
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Ongoing work,
            objectives and
            next actions.
          </Text>
        </View>

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

        {showCreate ? (
          <View
            style={
              styles.createCard
            }
          >
            <Text
              style={
                styles.cardLabel
              }
            >
              NEW PROJECT
            </Text>

            <TextInput
              value={
                name
              }
              onChangeText={
                setName
              }
              placeholder="Project name"
              placeholderTextColor="rgba(37,36,31,0.30)"
              style={
                styles.input
              }
            />

            <TextInput
              value={
                summary
              }
              onChangeText={
                setSummary
              }
              placeholder="Short summary"
              placeholderTextColor="rgba(37,36,31,0.30)"
              style={
                styles.input
              }
            />

            <TextInput
              value={
                objective
              }
              onChangeText={
                setObjective
              }
              placeholder="Main objective"
              placeholderTextColor="rgba(37,36,31,0.30)"
              multiline
              style={[
                styles.input,
                styles.textArea,
              ]}
            />

            <Text
              style={
                styles.fieldLabel
              }
            >
              PRIORITY
            </Text>

            <View
              style={
                styles.priorityRow
              }
            >
              {[
                1,
                2,
                3,
                4,
                5,
              ].map(
                (
                  value
                ) => (
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
                        styles.priorityText,

                        priority ===
                          value &&
                          styles.priorityTextActive,
                      ]}
                    >
                      {
                        value
                      }
                    </Text>
                  </Pressable>
                )
              )}
            </View>

            <Pressable
              onPress={
                createProject
              }
              disabled={
                !name.trim() ||
                creating
              }
              style={[
                styles.primaryButton,

                (
                  !name.trim() ||
                  creating
                ) &&
                  styles.primaryButtonDisabled,
              ]}
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                {creating
                  ? 'CREATING'
                  : 'CREATE PROJECT'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator
            style={
              styles.loader
            }
          />
        ) : null}

        {!loading &&
        projects.length ===
          0 ? (
          <View
            style={
              styles.empty
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              No projects yet.
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Create your
              first ongoing
              workspace with
              the + button.
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.projectList
          }
        >
          {projects.map(
            (
              project
            ) => (
              <Pressable
                key={
                  project.id
                }
                onPress={() =>
                  router.push(
                    `/projects/${project.id}` as any
                  )
                }
                style={
                  styles.projectCard
                }
              >
                <View
                  style={
                    styles.projectTop
                  }
                >
                  <View
                    style={
                      styles.projectTopText
                    }
                  >
                    <Text
                      style={
                        styles.projectName
                      }
                    >
                      {
                        project.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.projectMeta
                      }
                    >
                      {
                        statusLabel(
                          project.status
                        )
                      }
                      {'  •  '}
                      P{
                        project.priority
                      }
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.arrow
                    }
                  >
                    →
                  </Text>
                </View>

                {project.summary ? (
                  <Text
                    style={
                      styles.projectSummary
                    }
                    numberOfLines={
                      2
                    }
                  >
                    {
                      project.summary
                    }
                  </Text>
                ) : null}

                {project.next_step ? (
                  <View
                    style={
                      styles.nextStep
                    }
                  >
                    <Text
                      style={
                        styles.nextStepLabel
                      }
                    >
                      NEXT
                    </Text>

                    <Text
                      style={
                        styles.nextStepText
                      }
                      numberOfLines={
                        2
                      }
                    >
                      {
                        project.next_step
                      }
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )
          )}
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

    headerSideRight: {
      alignItems:
        'flex-end',
    },

    back: {
      fontSize: 22,
      color:
        '#25241F',
    },

    add: {
      fontSize: 28,
      fontWeight:
        '300',
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
        22,
      paddingTop: 44,
      paddingBottom: 90,
    },

    hero: {
      marginBottom: 34,
    },

    eyebrow: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        2.2,
      color:
        'rgba(37,36,31,0.33)',
    },

    title: {
      marginTop: 12,
      fontSize: 34,
      letterSpacing:
        -1.1,
      color:
        '#25241F',
    },

    subtitle: {
      marginTop: 9,
      maxWidth: 330,
      fontSize: 14,
      lineHeight: 21,
      color:
        'rgba(37,36,31,0.46)',
    },

    error: {
      marginBottom: 20,
      padding: 14,
      borderRadius: 15,
      fontSize: 13,
      color:
        '#7E3737',
      backgroundColor:
        'rgba(126,55,55,0.06)',
    },

    createCard: {
      marginBottom: 28,
      padding: 22,
      borderRadius: 24,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.07)',
      backgroundColor:
        'rgba(255,255,255,0.38)',
    },

    cardLabel: {
      marginBottom: 18,
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.8,
      color:
        'rgba(37,36,31,0.37)',
    },

    input: {
      width: '100%',
      minHeight: 48,
      marginBottom: 10,
      paddingHorizontal:
        15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.075)',
      backgroundColor:
        'rgba(255,255,255,0.42)',
      color:
        '#25241F',
      fontSize: 14,
    },

    textArea: {
      minHeight: 85,
      paddingTop: 14,
      textAlignVertical:
        'top',
    },

    fieldLabel: {
      marginTop: 7,
      marginBottom: 9,
      fontSize: 8,
      letterSpacing:
        1.6,
      color:
        'rgba(37,36,31,0.34)',
    },

    priorityRow: {
      flexDirection:
        'row',
      gap: 8,
    },

    priorityButton: {
      width: 37,
      height: 37,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius: 19,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.08)',
    },

    priorityButtonActive: {
      backgroundColor:
        '#25241F',
    },

    priorityText: {
      fontSize: 11,
      color:
        'rgba(37,36,31,0.54)',
    },

    priorityTextActive: {
      color:
        '#F3F1EC',
    },

    primaryButton: {
      minHeight: 46,
      marginTop: 20,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius: 16,
      backgroundColor:
        '#25241F',
    },

    primaryButtonDisabled: {
      opacity: 0.18,
    },

    primaryButtonText: {
      fontSize: 9,
      fontWeight:
        '600',
      letterSpacing:
        1.7,
      color:
        '#F3F1EC',
    },

    loader: {
      marginTop: 60,
    },

    empty: {
      alignItems:
        'center',
      paddingVertical:
        70,
    },

    emptyTitle: {
      fontSize: 19,
      color:
        '#25241F',
    },

    emptyText: {
      marginTop: 8,
      maxWidth: 250,
      textAlign:
        'center',
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(37,36,31,0.39)',
    },

    projectList: {
      gap: 13,
    },

    projectCard: {
      padding: 22,
      borderRadius: 23,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.07)',
      backgroundColor:
        'rgba(255,255,255,0.36)',
    },

    projectTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
    },

    projectTopText: {
      flex: 1,
      paddingRight: 16,
    },

    projectName: {
      fontSize: 20,
      fontWeight:
        '500',
      letterSpacing:
        -0.45,
      color:
        '#25241F',
    },

    projectMeta: {
      marginTop: 7,
      fontSize: 8,
      letterSpacing:
        1.4,
      color:
        'rgba(37,36,31,0.34)',
    },

    arrow: {
      fontSize: 18,
      color:
        'rgba(37,36,31,0.40)',
    },

    projectSummary: {
      marginTop: 16,
      fontSize: 14,
      lineHeight: 21,
      color:
        'rgba(37,36,31,0.59)',
    },

    nextStep: {
      marginTop: 18,
      paddingTop: 15,
      borderTopWidth: 1,
      borderTopColor:
        'rgba(35,33,29,0.055)',
    },

    nextStepLabel: {
      fontSize: 7,
      fontWeight:
        '600',
      letterSpacing:
        1.5,
      color:
        'rgba(37,36,31,0.28)',
    },

    nextStepText: {
      marginTop: 7,
      fontSize: 13,
      lineHeight: 19,
      color:
        '#25241F',
    },
  });