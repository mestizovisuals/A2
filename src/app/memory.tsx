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

type AssistantProfile = {
  assistant_name: string;
  preferred_directness: number;
  preferred_detail: number;
  pushback_level: number;
  initiative_level: number;
  familiarity_level: number;
  decision_style: string;
  communication_style: string;
  working_style: string;
  relationship_summary: string;
  interaction_notes: {
    notes?: string[];
  } | null;
  version: number;
  updated_at: string;
  last_reflected_at: string | null;
};

type Memory = {
  id: string;
  category: string;
  subject: string;
  content: string;
  importance: number;
  confidence: number;
  is_active: boolean;
  updated_at: string;
};

export default function MemoryScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [profile, setProfile] =
    useState<AssistantProfile | null>(null);

  const [memories, setMemories] =
    useState<Memory[]>([]);

  const [errorMessage, setErrorMessage] =
    useState('');

  const [editingMemoryId, setEditingMemoryId] =
    useState<string | null>(null);

  const [editSubject, setEditSubject] =
    useState('');

  const [editContent, setEditContent] =
    useState('');

  const [editImportance, setEditImportance] =
    useState(3);

  const [busyMemoryId, setBusyMemoryId] =
    useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] =
    useState<string | null>(null);

  const [
    confirmProfileReset,
    setConfirmProfileReset,
  ] = useState(false);

  const [
    resettingProfile,
    setResettingProfile,
  ] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMessage('');

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        router.replace('/');
        return;
      }

      const userId =
        session.user.id;

      const [
        profileResult,
        memoryResult,
      ] = await Promise.all([
        supabase
          .from('assistant_profiles')
          .select(`
            assistant_name,
            preferred_directness,
            preferred_detail,
            pushback_level,
            initiative_level,
            familiarity_level,
            decision_style,
            communication_style,
            working_style,
            relationship_summary,
            interaction_notes,
            version,
            updated_at,
            last_reflected_at
          `)
          .eq('user_id', userId)
          .maybeSingle(),

        supabase
          .from('memories')
          .select(`
            id,
            category,
            subject,
            content,
            importance,
            confidence,
            is_active,
            updated_at
          `)
          .eq('user_id', userId)
          .order('is_active', {
            ascending: false,
          })
          .order('importance', {
            ascending: false,
          })
          .order('updated_at', {
            ascending: false,
          }),
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }

      if (memoryResult.error) {
        throw memoryResult.error;
      }

      setProfile(
        profileResult.data as
          | AssistantProfile
          | null
      );

      setMemories(
        (memoryResult.data ?? []) as Memory[]
      );
    } catch (error) {
      console.error(
        'A2 Memory screen error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not load memory.'
      );
    } finally {
      setLoading(false);
    }
  }

  const activeMemories =
    useMemo(
      () =>
        memories.filter(
          (memory) =>
            memory.is_active
        ),
      [memories]
    );

  const inactiveMemories =
    useMemo(
      () =>
        memories.filter(
          (memory) =>
            !memory.is_active
        ),
      [memories]
    );

  const memoryCounts =
    useMemo(() => {
      const counts: Record<
        string,
        number
      > = {};

      for (
        const memory of
        activeMemories
      ) {
        counts[memory.category] =
          (counts[
            memory.category
          ] ?? 0) + 1;
      }

      return counts;
    }, [activeMemories]);

  function formatDecisionStyle(
    value?: string
  ) {
    if (!value) {
      return 'Not learned yet';
    }

    return value
      .replaceAll('_', ' ')
      .replace(
        /\b\w/g,
        (letter) =>
          letter.toUpperCase()
      );
  }

  function percentage(
    value: number
  ) {
    return `${Math.round(
      value * 100
    )}%`;
  }

  function beginEdit(
    memory: Memory
  ) {
    setConfirmDeleteId(null);

    setEditingMemoryId(
      memory.id
    );

    setEditSubject(
      memory.subject
    );

    setEditContent(
      memory.content
    );

    setEditImportance(
      memory.importance
    );
  }

  function cancelEdit() {
    setEditingMemoryId(null);
    setEditSubject('');
    setEditContent('');
    setEditImportance(3);
  }

  async function saveMemory(
    memory: Memory
  ) {
    const cleanSubject =
      editSubject.trim();

    const cleanContent =
      editContent.trim();

    if (
      !cleanSubject ||
      !cleanContent
    ) {
      return;
    }

    setBusyMemoryId(
      memory.id
    );

    try {
      const {
        error,
      } = await supabase
        .from('memories')
        .update({
          subject:
            cleanSubject,

          content:
            cleanContent,

          importance:
            editImportance,

          confidence:
            1,
        })
        .eq(
          'id',
          memory.id
        );

      if (error) {
        throw error;
      }

      cancelEdit();
      await loadData();
    } catch (error) {
      console.error(
        'A2 memory save error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not save the memory.'
      );
    } finally {
      setBusyMemoryId(null);
    }
  }

  async function toggleMemory(
    memory: Memory
  ) {
    setBusyMemoryId(
      memory.id
    );

    setConfirmDeleteId(
      null
    );

    try {
      const {
        error,
      } = await supabase
        .from('memories')
        .update({
          is_active:
            !memory.is_active,
        })
        .eq(
          'id',
          memory.id
        );

      if (error) {
        throw error;
      }

      await loadData();
    } catch (error) {
      console.error(
        'A2 memory toggle error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not update the memory.'
      );
    } finally {
      setBusyMemoryId(null);
    }
  }

  async function deleteMemory(
    memory: Memory
  ) {
    setBusyMemoryId(
      memory.id
    );

    try {
      const {
        error,
      } = await supabase
        .from('memories')
        .delete()
        .eq(
          'id',
          memory.id
        );

      if (error) {
        throw error;
      }

      if (
        editingMemoryId ===
        memory.id
      ) {
        cancelEdit();
      }

      setConfirmDeleteId(
        null
      );

      await loadData();
    } catch (error) {
      console.error(
        'A2 memory delete error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not delete the memory.'
      );
    } finally {
      setBusyMemoryId(null);
    }
  }

  async function resetRelationshipProfile() {
    setResettingProfile(
      true
    );

    try {
      const {
        data: { session },
        error:
          sessionError,
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
        error,
      } = await supabase
        .from(
          'assistant_profiles'
        )
        .update({
          preferred_directness:
            4,

          preferred_detail:
            3,

          pushback_level:
            3,

          initiative_level:
            3,

          familiarity_level:
            1,

          decision_style:
            'recommendation_first',

          communication_style:
            'Calm, polished, understated, direct, concise by default.',

          working_style:
            'Give the useful result first. Explain reasoning when it adds value.',

          relationship_summary:
            'A2 is beginning to learn how to work effectively with this user.',

          interaction_notes: {
            notes: [],
          },

          version:
            1,

          last_reflected_at:
            null,
        })
        .eq(
          'user_id',
          session.user.id
        );

      if (error) {
        throw error;
      }

      setConfirmProfileReset(
        false
      );

      await loadData();
    } catch (error) {
      console.error(
        'A2 profile reset error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not reset its learned profile.'
      );
    } finally {
      setResettingProfile(
        false
      );
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.replace('/')
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

        <Text style={styles.brand}>
          A2
        </Text>

        <Pressable
          onPress={loadData}
          style={
            styles.refreshButton
          }
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
            Loading A2...
          </Text>
        </View>
      ) : errorMessage ? (
        <View
          style={
            styles.loading
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
            onPress={() => {
              setErrorMessage('');
              loadData();
            }}
            style={
              styles.retryButton
            }
          >
            <Text
              style={
                styles.retryText
              }
            >
              Retry
            </Text>
          </Pressable>
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
            MEMORY + IDENTITY
          </Text>

          <Text
            style={
              styles.title
            }
          >
            What A2 knows.
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            A transparent view of
            what A2 remembers and
            how its working style is
            evolving with you.
          </Text>

          <View
            style={
              styles.divider
            }
          />

          <Text
            style={
              styles.sectionLabel
            }
          >
            A2 IDENTITY
          </Text>

          {profile ? (
            <View
              style={
                styles.profileCard
              }
            >
              <View
                style={
                  styles.profileTop
                }
              >
                <View>
                  <Text
                    style={
                      styles.profileName
                    }
                  >
                    {
                      profile.assistant_name
                    }
                  </Text>

                  <Text
                    style={
                      styles.profileVersion
                    }
                  >
                    RELATIONSHIP MODEL V
                    {profile.version}
                  </Text>
                </View>

                <View
                  style={
                    styles.statusDot
                  }
                />
              </View>

              <View
                style={
                  styles.metrics
                }
              >
                <Metric
                  label="Directness"
                  value={
                    profile.preferred_directness
                  }
                />

                <Metric
                  label="Detail"
                  value={
                    profile.preferred_detail
                  }
                />

                <Metric
                  label="Pushback"
                  value={
                    profile.pushback_level
                  }
                />

                <Metric
                  label="Initiative"
                  value={
                    profile.initiative_level
                  }
                />

                <Metric
                  label="Familiarity"
                  value={
                    profile.familiarity_level
                  }
                />
              </View>

              <View
                style={
                  styles.profileDivider
                }
              />

              <ProfileField
                label="Decision style"
                value={
                  formatDecisionStyle(
                    profile.decision_style
                  )
                }
              />

              <ProfileField
                label="Communication"
                value={
                  profile.communication_style
                }
              />

              <ProfileField
                label="Working style"
                value={
                  profile.working_style
                }
              />

              <ProfileField
                label="Relationship"
                value={
                  profile.relationship_summary
                }
              />

              {Array.isArray(
                profile
                  .interaction_notes
                  ?.notes
              ) &&
                profile
                  .interaction_notes!
                  .notes!.length >
                  0 && (
                  <View
                    style={
                      styles.notesSection
                    }
                  >
                    <Text
                      style={
                        styles.fieldLabel
                      }
                    >
                      LEARNED PATTERNS
                    </Text>

                    {profile
                      .interaction_notes!
                      .notes!.map(
                        (
                          note,
                          index
                        ) => (
                          <Text
                            key={`${note}-${index}`}
                            style={
                              styles.note
                            }
                          >
                            {note}
                          </Text>
                        )
                      )}
                  </View>
                )}

              <View
                style={
                  styles.profileControlDivider
                }
              />

              {!confirmProfileReset ? (
                <Pressable
                  onPress={() =>
                    setConfirmProfileReset(
                      true
                    )
                  }
                >
                  <Text
                    style={
                      styles.resetLink
                    }
                  >
                    Reset learned relationship profile
                  </Text>
                </Pressable>
              ) : (
                <View
                  style={
                    styles.confirmReset
                  }
                >
                  <Text
                    style={
                      styles.confirmText
                    }
                  >
                    Reset A2's learned
                    working style? Memories
                    and conversations will
                    remain untouched.
                  </Text>

                  <View
                    style={
                      styles.confirmActions
                    }
                  >
                    <Pressable
                      onPress={() =>
                        setConfirmProfileReset(
                          false
                        )
                      }
                      style={
                        styles.smallButton
                      }
                    >
                      <Text
                        style={
                          styles.smallButtonText
                        }
                      >
                        Cancel
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={
                        resetRelationshipProfile
                      }
                      disabled={
                        resettingProfile
                      }
                      style={
                        styles.dangerButton
                      }
                    >
                      <Text
                        style={
                          styles.dangerButtonText
                        }
                      >
                        {resettingProfile
                          ? 'Resetting...'
                          : 'Confirm reset'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.emptyTitle
                }
              >
                Relationship profile
                not initialized yet.
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Talk with A2 once,
                then refresh this
                screen.
              </Text>
            </View>
          )}

          <View
            style={
              styles.sectionGap
            }
          />

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
              DURABLE MEMORY
            </Text>

            <Text
              style={
                styles.count
              }
            >
              {
                activeMemories.length
              }{' '}
              ACTIVE
            </Text>
          </View>

          {Object.keys(
            memoryCounts
          ).length > 0 && (
            <View
              style={
                styles.categories
              }
            >
              {Object.entries(
                memoryCounts
              ).map(
                ([
                  category,
                  count,
                ]) => (
                  <View
                    key={
                      category
                    }
                    style={
                      styles.categoryChip
                    }
                  >
                    <Text
                      style={
                        styles.categoryText
                      }
                    >
                      {category.toUpperCase()}
                      {'  '}
                      {count}
                    </Text>
                  </View>
                )
              )}
            </View>
          )}

          {activeMemories.length ===
          0 ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.emptyTitle
                }
              >
                No active durable
                memories.
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Useful long-term
                information A2 learns
                will appear here.
              </Text>
            </View>
          ) : (
            <View
              style={
                styles.memoryList
              }
            >
              {activeMemories.map(
                (memory) => (
                  <MemoryCard
                    key={
                      memory.id
                    }
                    memory={
                      memory
                    }
                    editing={
                      editingMemoryId ===
                      memory.id
                    }
                    busy={
                      busyMemoryId ===
                      memory.id
                    }
                    confirmingDelete={
                      confirmDeleteId ===
                      memory.id
                    }
                    editSubject={
                      editSubject
                    }
                    editContent={
                      editContent
                    }
                    editImportance={
                      editImportance
                    }
                    onEdit={() =>
                      beginEdit(
                        memory
                      )
                    }
                    onCancelEdit={
                      cancelEdit
                    }
                    onSave={() =>
                      saveMemory(
                        memory
                      )
                    }
                    onToggle={() =>
                      toggleMemory(
                        memory
                      )
                    }
                    onDeleteRequest={() =>
                      setConfirmDeleteId(
                        memory.id
                      )
                    }
                    onDeleteCancel={() =>
                      setConfirmDeleteId(
                        null
                      )
                    }
                    onDeleteConfirm={() =>
                      deleteMemory(
                        memory
                      )
                    }
                    onSubjectChange={
                      setEditSubject
                    }
                    onContentChange={
                      setEditContent
                    }
                    onImportanceChange={
                      setEditImportance
                    }
                    percentage={
                      percentage
                    }
                  />
                )
              )}
            </View>
          )}

          {inactiveMemories.length >
            0 && (
            <>
              <View
                style={
                  styles.inactiveSection
                }
              />

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
                  INACTIVE MEMORY
                </Text>

                <Text
                  style={
                    styles.count
                  }
                >
                  {
                    inactiveMemories.length
                  }
                </Text>
              </View>

              <Text
                style={
                  styles.inactiveExplanation
                }
              >
                A2 will not use these
                memories unless you
                reactivate them.
              </Text>

              <View
                style={
                  styles.memoryList
                }
              >
                {inactiveMemories.map(
                  (memory) => (
                    <MemoryCard
                      key={
                        memory.id
                      }
                      memory={
                        memory
                      }
                      editing={
                        editingMemoryId ===
                        memory.id
                      }
                      busy={
                        busyMemoryId ===
                        memory.id
                      }
                      confirmingDelete={
                        confirmDeleteId ===
                        memory.id
                      }
                      editSubject={
                        editSubject
                      }
                      editContent={
                        editContent
                      }
                      editImportance={
                        editImportance
                      }
                      onEdit={() =>
                        beginEdit(
                          memory
                        )
                      }
                      onCancelEdit={
                        cancelEdit
                      }
                      onSave={() =>
                        saveMemory(
                          memory
                        )
                      }
                      onToggle={() =>
                        toggleMemory(
                          memory
                        )
                      }
                      onDeleteRequest={() =>
                        setConfirmDeleteId(
                          memory.id
                        )
                      }
                      onDeleteCancel={() =>
                        setConfirmDeleteId(
                          null
                        )
                      }
                      onDeleteConfirm={() =>
                        deleteMemory(
                          memory
                        )
                      }
                      onSubjectChange={
                        setEditSubject
                      }
                      onContentChange={
                        setEditContent
                      }
                      onImportanceChange={
                        setEditImportance
                      }
                      percentage={
                        percentage
                      }
                    />
                  )
                )}
              </View>
            </>
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

function MemoryCard({
  memory,
  editing,
  busy,
  confirmingDelete,
  editSubject,
  editContent,
  editImportance,
  onEdit,
  onCancelEdit,
  onSave,
  onToggle,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
  onSubjectChange,
  onContentChange,
  onImportanceChange,
  percentage,
}: {
  memory: Memory;
  editing: boolean;
  busy: boolean;
  confirmingDelete: boolean;
  editSubject: string;
  editContent: string;
  editImportance: number;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onToggle: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onSubjectChange: (
    value: string
  ) => void;
  onContentChange: (
    value: string
  ) => void;
  onImportanceChange: (
    value: number
  ) => void;
  percentage: (
    value: number
  ) => string;
}) {
  return (
    <View
      style={[
        styles.memoryCard,

        !memory.is_active &&
          styles.memoryCardInactive,
      ]}
    >
      <View
        style={
          styles.memoryTop
        }
      >
        <View
          style={
            styles.memoryStatusRow
          }
        >
          <Text
            style={
              styles.memoryCategory
            }
          >
            {memory.category}
          </Text>

          {!memory.is_active && (
            <Text
              style={
                styles.inactiveBadge
              }
            >
              INACTIVE
            </Text>
          )}
        </View>

        <Text
          style={
            styles.memoryImportance
          }
        >
          {memory.importance}/5
        </Text>
      </View>

      {editing ? (
        <>
          <Text
            style={
              styles.editLabel
            }
          >
            SUBJECT
          </Text>

          <TextInput
            value={
              editSubject
            }
            onChangeText={
              onSubjectChange
            }
            style={
              styles.editInput
            }
            placeholder="Memory subject"
          />

          <Text
            style={
              styles.editLabel
            }
          >
            MEMORY
          </Text>

          <TextInput
            value={
              editContent
            }
            onChangeText={
              onContentChange
            }
            style={[
              styles.editInput,
              styles.editContentInput,
            ]}
            placeholder="What should A2 remember?"
            multiline
          />

          <Text
            style={
              styles.editLabel
            }
          >
            IMPORTANCE
          </Text>

          <View
            style={
              styles.importanceRow
            }
          >
            {[1, 2, 3, 4, 5].map(
              (value) => (
                <Pressable
                  key={value}
                  onPress={() =>
                    onImportanceChange(
                      value
                    )
                  }
                  style={[
                    styles.importanceButton,

                    editImportance ===
                      value &&
                      styles.importanceButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.importanceButtonText,

                      editImportance ===
                        value &&
                        styles.importanceButtonTextActive,
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
              styles.editActions
            }
          >
            <Pressable
              onPress={
                onCancelEdit
              }
              style={
                styles.smallButton
              }
            >
              <Text
                style={
                  styles.smallButtonText
                }
              >
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={onSave}
              disabled={
                busy ||
                !editSubject.trim() ||
                !editContent.trim()
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
                {busy
                  ? 'Saving...'
                  : 'Save'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text
            style={
              styles.memorySubject
            }
          >
            {memory.subject}
          </Text>

          <Text
            style={
              styles.memoryContent
            }
          >
            {memory.content}
          </Text>

          <Text
            style={
              styles.memoryMeta
            }
          >
            Confidence{' '}
            {percentage(
              memory.confidence
            )}
          </Text>

          <View
            style={
              styles.memoryControls
            }
          >
            <Pressable
              onPress={onEdit}
              disabled={busy}
            >
              <Text
                style={
                  styles.controlText
                }
              >
                EDIT
              </Text>
            </Pressable>

            <Pressable
              onPress={
                onToggle
              }
              disabled={busy}
            >
              <Text
                style={
                  styles.controlText
                }
              >
                {memory.is_active
                  ? 'DISABLE'
                  : 'ACTIVATE'}
              </Text>
            </Pressable>

            {!confirmingDelete ? (
              <Pressable
                onPress={
                  onDeleteRequest
                }
                disabled={
                  busy
                }
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
              <View
                style={
                  styles.inlineDeleteConfirm
                }
              >
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
                    onDeleteConfirm
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
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View
      style={
        styles.metric
      }
    >
      <Text
        style={
          styles.metricValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.metricLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.profileField
      }
    >
      <Text
        style={
          styles.fieldLabel
        }
      >
        {label.toUpperCase()}
      </Text>

      <Text
        style={
          styles.fieldValue
        }
      >
        {value}
      </Text>
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

    brand: {
      fontSize: 14,
      fontWeight:
        '600',
      letterSpacing: 5,
      color:
        '#22211E',
    },

    backButton: {
      width: 44,
      height: 44,
      justifyContent:
        'center',
    },

    backText: {
      fontSize: 23,
      color:
        '#25241F',
    },

    refreshButton: {
      width: 44,
      height: 44,
      alignItems:
        'flex-end',
      justifyContent:
        'center',
    },

    refreshText: {
      fontSize: 20,
      color:
        'rgba(37, 36, 31, 0.5)',
    },

    loading: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal:
        30,
    },

    loadingText: {
      marginTop: 14,
      fontSize: 12,
      letterSpacing: 1,
      color:
        'rgba(37, 36, 31, 0.42)',
    },

    errorText: {
      maxWidth: 460,
      textAlign:
        'center',
      fontSize: 15,
      lineHeight: 23,
      color:
        '#25241F',
    },

    retryButton: {
      marginTop: 20,
      paddingHorizontal:
        22,
      paddingVertical:
        12,
      borderRadius:
        18,
      backgroundColor:
        '#22211E',
    },

    retryText: {
      color:
        '#F3F1EC',
      fontSize: 13,
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
      letterSpacing:
        2.4,
      color:
        'rgba(37, 36, 31, 0.38)',
      marginBottom: 16,
    },

    title: {
      fontSize: 35,
      lineHeight: 40,
      letterSpacing:
        -1.2,
      fontWeight:
        '400',
      color:
        '#25241F',
    },

    subtitle: {
      marginTop: 13,
      maxWidth: 520,
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
      marginBottom: 38,
    },

    sectionLabel: {
      fontSize: 9,
      fontWeight:
        '600',
      letterSpacing:
        2.2,
      color:
        'rgba(37, 36, 31, 0.4)',
    },

    profileCard: {
      marginTop: 15,
      padding: 24,
      borderRadius: 25,
      backgroundColor:
        'rgba(255, 255, 255, 0.48)',
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.07)',
    },

    profileTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    profileName: {
      fontSize: 23,
      fontWeight:
        '500',
      color:
        '#25241F',
    },

    profileVersion: {
      marginTop: 5,
      fontSize: 8,
      letterSpacing:
        1.8,
      color:
        'rgba(37, 36, 31, 0.35)',
    },

    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor:
        'rgba(37, 36, 31, 0.56)',
    },

    metrics: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      marginTop: 28,
      gap: 12,
    },

    metric: {
      minWidth: 105,
      flexGrow: 1,
      paddingVertical:
        16,
      paddingHorizontal:
        15,
      borderRadius: 18,
      backgroundColor:
        'rgba(35, 33, 29, 0.035)',
    },

    metricValue: {
      fontSize: 22,
      color:
        '#25241F',
    },

    metricLabel: {
      marginTop: 6,
      fontSize: 9,
      letterSpacing:
        0.8,
      textTransform:
        'uppercase',
      color:
        'rgba(37, 36, 31, 0.38)',
    },

    profileDivider: {
      height: 1,
      marginVertical:
        25,
      backgroundColor:
        'rgba(35, 33, 29, 0.06)',
    },

    profileField: {
      marginBottom:
        22,
    },

    fieldLabel: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing:
        1.6,
      color:
        'rgba(37, 36, 31, 0.36)',
      marginBottom: 7,
    },

    fieldValue: {
      maxWidth: 700,
      fontSize: 14,
      lineHeight: 21,
      color:
        'rgba(37, 36, 31, 0.78)',
    },

    notesSection: {
      marginTop: 6,
    },

    note: {
      marginTop: 7,
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(37, 36, 31, 0.62)',
    },

    profileControlDivider: {
      height: 1,
      marginTop: 12,
      marginBottom:
        18,
      backgroundColor:
        'rgba(35, 33, 29, 0.06)',
    },

    resetLink: {
      fontSize: 11,
      letterSpacing:
        0.4,
      color:
        'rgba(37, 36, 31, 0.42)',
    },

    confirmReset: {
      gap: 14,
    },

    confirmText: {
      maxWidth: 520,
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(37, 36, 31, 0.62)',
    },

    confirmActions: {
      flexDirection:
        'row',
      gap: 9,
    },

    sectionGap: {
      height: 52,
    },

    sectionHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    count: {
      fontSize: 9,
      letterSpacing: 1,
      color:
        'rgba(37, 36, 31, 0.42)',
    },

    categories: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      gap: 7,
      marginTop: 15,
      marginBottom: 8,
    },

    categoryChip: {
      borderRadius: 999,
      paddingHorizontal:
        11,
      paddingVertical:
        7,
      backgroundColor:
        'rgba(35, 33, 29, 0.045)',
    },

    categoryText: {
      fontSize: 8,
      letterSpacing:
        1.1,
      color:
        'rgba(37, 36, 31, 0.48)',
    },

    memoryList: {
      marginTop: 10,
      gap: 10,
    },

    memoryCard: {
      padding: 20,
      borderRadius: 21,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.07)',
      backgroundColor:
        'rgba(255, 255, 255, 0.36)',
    },

    memoryCardInactive: {
      opacity: 0.58,
    },

    memoryTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    memoryStatusRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
    },

    memoryCategory: {
      fontSize: 8,
      letterSpacing:
        1.6,
      textTransform:
        'uppercase',
      color:
        'rgba(37, 36, 31, 0.38)',
    },

    inactiveBadge: {
      fontSize: 7,
      letterSpacing:
        1,
      color:
        'rgba(37, 36, 31, 0.3)',
    },

    memoryImportance: {
      fontSize: 10,
      color:
        'rgba(37, 36, 31, 0.36)',
    },

    memorySubject: {
      marginTop: 13,
      fontSize: 18,
      fontWeight:
        '500',
      letterSpacing:
        -0.3,
      color:
        '#25241F',
    },

    memoryContent: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 21,
      color:
        'rgba(37, 36, 31, 0.68)',
    },

    memoryMeta: {
      marginTop: 15,
      fontSize: 9,
      letterSpacing:
        0.8,
      color:
        'rgba(37, 36, 31, 0.3)',
    },

    memoryControls: {
      marginTop: 18,
      paddingTop: 14,
      borderTopWidth:
        1,
      borderTopColor:
        'rgba(35, 33, 29, 0.05)',
      flexDirection:
        'row',
      alignItems:
        'center',
      flexWrap:
        'wrap',
      gap: 18,
    },

    controlText: {
      fontSize: 8,
      letterSpacing:
        1.3,
      color:
        'rgba(37, 36, 31, 0.45)',
    },

    deleteText: {
      fontSize: 8,
      letterSpacing:
        1.3,
      color:
        'rgba(90, 40, 40, 0.52)',
    },

    inlineDeleteConfirm: {
      flexDirection:
        'row',
      gap: 18,
      alignItems:
        'center',
    },

    confirmDeleteText: {
      fontSize: 8,
      letterSpacing:
        1.2,
      color:
        'rgba(115, 35, 35, 0.72)',
    },

    editLabel: {
      marginTop: 17,
      marginBottom: 7,
      fontSize: 8,
      letterSpacing:
        1.4,
      color:
        'rgba(37, 36, 31, 0.36)',
    },

    editInput: {
      width: '100%',
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.08)',
      paddingHorizontal:
        13,
      paddingVertical:
        10,
      fontSize: 14,
      color:
        '#25241F',
      backgroundColor:
        'rgba(255, 255, 255, 0.55)',
    },

    editContentInput: {
      minHeight: 90,
      textAlignVertical:
        'top',
    },

    importanceRow: {
      flexDirection:
        'row',
      gap: 7,
    },

    importanceButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(35, 33, 29, 0.045)',
    },

    importanceButtonActive: {
      backgroundColor:
        '#25241F',
    },

    importanceButtonText: {
      fontSize: 11,
      color:
        'rgba(37, 36, 31, 0.55)',
    },

    importanceButtonTextActive: {
      color:
        '#F3F1EC',
    },

    editActions: {
      marginTop: 18,
      flexDirection:
        'row',
      gap: 9,
    },

    smallButton: {
      paddingHorizontal:
        15,
      paddingVertical:
        10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.08)',
    },

    smallButtonText: {
      fontSize: 10,
      color:
        'rgba(37, 36, 31, 0.58)',
    },

    saveButton: {
      paddingHorizontal:
        18,
      paddingVertical:
        10,
      borderRadius: 14,
      backgroundColor:
        '#25241F',
    },

    saveButtonText: {
      fontSize: 10,
      color:
        '#F3F1EC',
    },

    dangerButton: {
      paddingHorizontal:
        15,
      paddingVertical:
        10,
      borderRadius: 14,
      backgroundColor:
        'rgba(90, 35, 35, 0.08)',
    },

    dangerButtonText: {
      fontSize: 10,
      color:
        'rgba(100, 35, 35, 0.75)',
    },

    inactiveSection: {
      height: 1,
      marginTop: 52,
      marginBottom: 34,
      backgroundColor:
        'rgba(35, 33, 29, 0.07)',
    },

    inactiveExplanation: {
      marginTop: 9,
      marginBottom: 10,
      fontSize: 12,
      lineHeight: 18,
      color:
        'rgba(37, 36, 31, 0.4)',
    },

    emptyCard: {
      marginTop: 15,
      padding: 23,
      borderRadius: 22,
      borderWidth: 1,
      borderColor:
        'rgba(35, 33, 29, 0.07)',
      backgroundColor:
        'rgba(255, 255, 255, 0.36)',
    },

    emptyTitle: {
      fontSize: 16,
      color:
        '#25241F',
    },

    emptyText: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(37, 36, 31, 0.48)',
    },

    footerSpace: {
      height: 80,
    },
  });