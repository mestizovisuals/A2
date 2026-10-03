import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { withSupabase } from 'npm:@supabase/server@^1';

import {
  processTaskIntent,
  type TaskToolResult,
} from './taskTools.ts';


// ============================================================
// A2 SETTINGS
// ============================================================

const CONVERSATION_GAP_HOURS = 12;
const CONTEXT_MESSAGE_LIMIT = 12;
const MEMORY_RETRIEVAL_LIMIT = 30;

// A2 does not rewrite its relationship profile after every
// message. Normal reflection happens every 4 user messages.
// Explicit feedback can trigger it immediately.
const PROFILE_REFLECTION_INTERVAL = 4;

// ============================================================
// TYPES
// ============================================================

type StoredMemory = {
  id: string;
  category: string;
  subject: string;
  content: string;
  importance: number;
  confidence: number;
};

type MemoryCandidate = {
  action: 'add' | 'update';
  existing_memory_id: string | null;

  category:
    | 'profile'
    | 'preference'
    | 'person'
    | 'project'
    | 'goal'
    | 'decision'
    | 'instruction'
    | 'routine'
    | 'place'
    | 'fact';

  subject: string;
  content: string;
  importance: number;
  confidence: number;
};

type AssistantProfile = {
  user_id: string;
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

  interaction_notes: any;

  version: number;
  last_reflected_at: string | null;
};

type RelationshipReflection = {
  should_update: boolean;

  preferred_directness: number;
  preferred_detail: number;
  pushback_level: number;
  initiative_level: number;

  decision_style:
    | 'recommendation_first'
    | 'collaborative'
    | 'options_first'
    | 'analytical'
    | 'mixed';

  communication_style: string;
  working_style: string;
  relationship_summary: string;

  observations: string[];
};

// ============================================================
// GENERAL HELPERS
// ============================================================

function getOutputText(data: any): string {
  if (
    typeof data?.output_text === 'string' &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return '';
  }

  const textParts: string[] = [];

  for (const item of data.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content?.type === 'output_text' &&
        typeof content?.text === 'string'
      ) {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join('\n').trim();
}

function createConversationTitle(
  message: string
): string {
  const cleanMessage = message
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanMessage.length <= 60) {
    return cleanMessage;
  }

  return `${cleanMessage.slice(0, 57)}...`;
}

function clampInteger(
  value: number,
  minimum: number,
  maximum: number
): number {
  const rounded = Math.round(value);

  return Math.min(
    maximum,
    Math.max(minimum, rounded)
  );
}

function moveOneStep(
  current: number,
  requested: number
): number {
  const safeCurrent = clampInteger(
    current,
    1,
    5
  );

  const safeRequested = clampInteger(
    requested,
    1,
    5
  );

  if (safeRequested > safeCurrent) {
    return Math.min(
      5,
      safeCurrent + 1
    );
  }

  if (safeRequested < safeCurrent) {
    return Math.max(
      1,
      safeCurrent - 1
    );
  }

  return safeCurrent;
}

function limitText(
  text: string,
  maximumLength: number
): string {
  const clean = text
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= maximumLength) {
    return clean;
  }

  return clean.slice(
    0,
    maximumLength
  );
}

// ============================================================
// TASK INTENT DETECTION
// ============================================================

function looksLikeTaskRequest(
  message: string
): boolean {
  const normalized =
    message.toLowerCase();

  const patterns = [
    /\bremind\b/,
    /\breminder\b/,
    /\btask\b/,
    /\btasks\b/,
    /\btodo\b/,
    /\bto-do\b/,
    /\bdue\b/,
    /\bdeadline\b/,
    /\bpriority\b/,
    /\bcomplete\b/,
    /\bcompleted\b/,
    /\bfinished\b/,
    /\bfinish\b/,
    /\breopen\b/,
    /\bdelete\b/,
    /\bremove\b/,
    /\bcancel\b/,
    /\btomorrow\b/,
    /\btonight\b/,
    /\bthis afternoon\b/,
    /\bthis evening\b/,
    /\bthis morning\b/,
    /\bwhat do i have today\b/,
    /\bwhat do i need to do\b/,
    /\bwhat's on my list\b/,
    /\bwhat is on my list\b/,
    /\badd .* to my list\b/,
  ];

  return patterns.some(
    (pattern) =>
      pattern.test(normalized)
  );
}

// ============================================================
// MEMORY CONTEXT
// ============================================================

function createMemoryContext(
  memories: StoredMemory[]
): string {
  if (!memories.length) {
    return 'No durable memories have been saved yet.';
  }

  return memories
    .map(
      (memory) =>
        `- [${memory.category}] ${memory.subject}: ${memory.content}`
    )
    .join('\n');
}

// ============================================================
// RELATIONSHIP / PERSONALITY CONTEXT
// ============================================================

function createRelationshipContext(
  profile: AssistantProfile
): string {
  return `
Assistant name: ${profile.assistant_name}

Preferred directness:
${profile.preferred_directness}/5

Preferred detail:
${profile.preferred_detail}/5

Pushback level:
${profile.pushback_level}/5

Initiative level:
${profile.initiative_level}/5

Familiarity level:
${profile.familiarity_level}/5

Decision style:
${profile.decision_style}

Communication style:
${profile.communication_style}

Working style:
${profile.working_style}

Relationship summary:
${profile.relationship_summary}
  `.trim();
}

// ============================================================
// DEFAULT ASSISTANT PROFILE
// ============================================================

function createDefaultProfile(
  userId: string
): AssistantProfile {
  return {
    user_id: userId,

    assistant_name: 'A2',

    preferred_directness: 4,
    preferred_detail: 3,
    pushback_level: 3,
    initiative_level: 3,
    familiarity_level: 1,

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

    version: 1,

    last_reflected_at: null,
  };
}

// ============================================================
// LOAD OR CREATE ASSISTANT PROFILE
// ============================================================

async function loadOrCreateAssistantProfile(
  supabase: any,
  userId: string
): Promise<AssistantProfile> {
  const {
    data: existingProfile,
    error: lookupError,
  } = await supabase
    .from('assistant_profiles')
    .select(`
      user_id,
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
      last_reflected_at
    `)
    .eq('user_id', userId)
    .maybeSingle();

  if (lookupError) {
    console.error(
      'A2 assistant profile lookup error:',
      lookupError
    );
  }

  if (existingProfile) {
    return existingProfile as AssistantProfile;
  }

  const {
    data: createdProfile,
    error: createError,
  } = await supabase
    .from('assistant_profiles')
    .insert({
      user_id: userId,
    })
    .select(`
      user_id,
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
      last_reflected_at
    `)
    .single();

  if (createError) {
    console.error(
      'A2 assistant profile creation error:',
      createError
    );

    return createDefaultProfile(
      userId
    );
  }

  return createdProfile as AssistantProfile;
}

// ============================================================
// DETECT EXPLICIT INTERACTION FEEDBACK
// ============================================================

function shouldForceProfileReflection(
  message: string
): boolean {
  const normalized =
    message.toLowerCase();

  return (
    normalized.includes(
      'from now on'
    ) ||
    normalized.includes(
      'i prefer'
    ) ||
    normalized.includes(
      'i like when you'
    ) ||
    normalized.includes(
      'i want you to'
    ) ||
    normalized.includes(
      'be more direct'
    ) ||
    normalized.includes(
      'be less direct'
    ) ||
    normalized.includes(
      'be more concise'
    ) ||
    normalized.includes(
      'be more detailed'
    ) ||
    normalized.includes(
      'push back'
    ) ||
    normalized.includes(
      'challenge me'
    ) ||
    normalized.includes(
      'stop doing'
    )
  );
}

// ============================================================
// MEMORY REFLECTION
// ============================================================

async function reflectAndSaveMemories({
  openAIKey,
  supabase,
  userId,
  conversationId,
  userMessageId,
  userMessage,
  assistantReply,
  existingMemories,
}: {
  openAIKey: string;
  supabase: any;
  userId: string;
  conversationId: string;
  userMessageId: string;
  userMessage: string;
  assistantReply: string;
  existingMemories: StoredMemory[];
}) {
  try {
    const existingMemoryText =
      existingMemories.length > 0
        ? existingMemories
            .map(
              (memory) =>
                [
                  `ID: ${memory.id}`,
                  `Category: ${memory.category}`,
                  `Subject: ${memory.subject}`,
                  `Content: ${memory.content}`,
                ].join(' | ')
            )
            .join('\n')
        : 'None';

    const reflectionResponse =
      await fetch(
        'https://api.openai.com/v1/responses',

        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${openAIKey}`,

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            model:
              'gpt-5.6-luna',

            store: false,

            instructions: `
You are A2's private memory curator.

Your task is NOT to converse with the user.

Your task is to identify durable information from the latest exchange that will genuinely improve future assistance.

SAVE durable information such as:

- stable preferences
- preferred working style
- important people
- ongoing projects
- long-term goals
- meaningful decisions
- standing instructions
- recurring routines
- useful places
- stable practical facts

DO NOT save:

- casual one-off questions
- temporary information
- guesses
- hypothetical information
- things only the assistant asserted
- temporary test data
- passwords
- API keys
- authentication codes
- card numbers
- account credentials
- security answers

Sensitive personal information should only become durable memory when the user explicitly asks for it to be remembered.

If an existing memory represents the same idea, update it instead of creating a duplicate.

Return at most 3 memories.

Returning zero memories is normal.
            `.trim(),

            input: [
              {
                role: 'user',

                content: `
EXISTING MEMORIES

${existingMemoryText}

LATEST USER MESSAGE

${userMessage}

A2 RESPONSE

${assistantReply}
                `.trim(),
              },
            ],

            text: {
              format: {
                type:
                  'json_schema',

                name:
                  'a2_memory_reflection',

                strict: true,

                schema: {
                  type: 'object',

                  additionalProperties:
                    false,

                  properties: {
                    memories: {
                      type:
                        'array',

                      maxItems: 3,

                      items: {
                        type:
                          'object',

                        additionalProperties:
                          false,

                        properties: {
                          action: {
                            type:
                              'string',

                            enum: [
                              'add',
                              'update',
                            ],
                          },

                          existing_memory_id: {
                            anyOf: [
                              {
                                type:
                                  'string',
                              },

                              {
                                type:
                                  'null',
                              },
                            ],
                          },

                          category: {
                            type:
                              'string',

                            enum: [
                              'profile',
                              'preference',
                              'person',
                              'project',
                              'goal',
                              'decision',
                              'instruction',
                              'routine',
                              'place',
                              'fact',
                            ],
                          },

                          subject: {
                            type:
                              'string',
                          },

                          content: {
                            type:
                              'string',
                          },

                          importance: {
                            type:
                              'integer',

                            minimum: 1,
                            maximum: 5,
                          },

                          confidence: {
                            type:
                              'number',

                            minimum: 0,
                            maximum: 1,
                          },
                        },

                        required: [
                          'action',
                          'existing_memory_id',
                          'category',
                          'subject',
                          'content',
                          'importance',
                          'confidence',
                        ],
                      },
                    },
                  },

                  required: [
                    'memories',
                  ],
                },
              },
            },

            max_output_tokens:
              500,
          }),
        }
      );

    const reflectionData =
      await reflectionResponse.json();

    if (!reflectionResponse.ok) {
      console.error(
        'A2 memory reflection OpenAI error:',
        JSON.stringify(
          reflectionData
        )
      );

      return;
    }

    const reflectionText =
      getOutputText(
        reflectionData
      );

    if (!reflectionText) {
      return;
    }

    let parsedReflection: {
      memories: MemoryCandidate[];
    };

    try {
      parsedReflection =
        JSON.parse(
          reflectionText
        );
    } catch (error) {
      console.error(
        'A2 memory JSON parse error:',
        error
      );

      return;
    }

    if (
      !Array.isArray(
        parsedReflection.memories
      )
    ) {
      return;
    }

    const validExistingIds =
      new Set(
        existingMemories.map(
          (memory) =>
            memory.id
        )
      );

    for (
      const candidate of
      parsedReflection.memories
    ) {
      if (
        !candidate.subject?.trim() ||
        !candidate.content?.trim()
      ) {
        continue;
      }

      if (
        candidate.action ===
          'update' &&
        candidate.existing_memory_id &&
        validExistingIds.has(
          candidate.existing_memory_id
        )
      ) {
        const {
          error: updateMemoryError,
        } = await supabase
          .from('memories')
          .update({
            category:
              candidate.category,

            subject:
              candidate.subject.trim(),

            content:
              candidate.content.trim(),

            importance:
              candidate.importance,

            confidence:
              candidate.confidence,

            source_conversation_id:
              conversationId,

            source_message_id:
              userMessageId,

            is_active:
              true,

            last_accessed_at:
              new Date()
                .toISOString(),

            metadata: {
              source:
                'a2_memory_reflection_v1',
            },
          })
          .eq(
            'id',
            candidate.existing_memory_id
          )
          .eq(
            'user_id',
            userId
          );

        if (
          updateMemoryError
        ) {
          console.error(
            'A2 memory update error:',
            updateMemoryError
          );
        }

        continue;
      }

      const {
        data: duplicateMemory,
        error:
          duplicateLookupError,
      } = await supabase
        .from('memories')
        .select('id')
        .eq(
          'user_id',
          userId
        )
        .eq(
          'category',
          candidate.category
        )
        .ilike(
          'subject',
          candidate.subject.trim()
        )
        .eq(
          'is_active',
          true
        )
        .limit(1)
        .maybeSingle();

      if (
        duplicateLookupError
      ) {
        console.error(
          'A2 duplicate memory lookup error:',
          duplicateLookupError
        );
      }

      if (
        duplicateMemory?.id
      ) {
        const {
          error:
            duplicateUpdateError,
        } = await supabase
          .from('memories')
          .update({
            content:
              candidate.content.trim(),

            importance:
              candidate.importance,

            confidence:
              candidate.confidence,

            source_conversation_id:
              conversationId,

            source_message_id:
              userMessageId,

            last_accessed_at:
              new Date()
                .toISOString(),

            metadata: {
              source:
                'a2_memory_reflection_v1',
            },
          })
          .eq(
            'id',
            duplicateMemory.id
          );

        if (
          duplicateUpdateError
        ) {
          console.error(
            'A2 duplicate memory update error:',
            duplicateUpdateError
          );
        }

        continue;
      }

      const {
        error:
          insertMemoryError,
      } = await supabase
        .from('memories')
        .insert({
          user_id:
            userId,

          category:
            candidate.category,

          subject:
            candidate.subject.trim(),

          content:
            candidate.content.trim(),

          importance:
            candidate.importance,

          confidence:
            candidate.confidence,

          source_conversation_id:
            conversationId,

          source_message_id:
            userMessageId,

          is_active:
            true,

          last_accessed_at:
            new Date()
              .toISOString(),

          metadata: {
            source:
              'a2_memory_reflection_v1',
          },
        });

      if (
        insertMemoryError
      ) {
        console.error(
          'A2 memory insert error:',
          insertMemoryError
        );
      }
    }
  } catch (error) {
    console.error(
      'A2 memory reflection error:',
      error
    );
  }
}

// ============================================================
// RELATIONSHIP REFLECTION
// ============================================================

async function reflectAndUpdateRelationship({
  openAIKey,
  supabase,
  userId,
  userMessage,
  assistantReply,
  currentProfile,
  recentMessages,
}: {
  openAIKey: string;
  supabase: any;
  userId: string;
  userMessage: string;
  assistantReply: string;
  currentProfile: AssistantProfile;

  recentMessages: Array<{
    role: string;
    content: string;
  }>;
}) {
  try {
    // --------------------------------------------------------
    // DECIDE WHETHER THIS TURN SHOULD TRIGGER REFLECTION
    // --------------------------------------------------------

    const {
      count:
        totalUserMessages,

      error:
        countError,
    } = await supabase
      .from('messages')
      .select(
        'id',
        {
          count:
            'exact',

          head:
            true,
        }
      )
      .eq(
        'user_id',
        userId
      )
      .eq(
        'role',
        'user'
      );

    if (countError) {
      console.error(
        'A2 relationship count error:',
        countError
      );
    }

    const forceReflection =
      shouldForceProfileReflection(
        userMessage
      );

    const periodicReflection =
      typeof totalUserMessages ===
        'number' &&
      totalUserMessages > 0 &&
      totalUserMessages %
        PROFILE_REFLECTION_INTERVAL ===
        0;

    if (
      !forceReflection &&
      !periodicReflection
    ) {
      return;
    }

    // --------------------------------------------------------
    // RECENT INTERACTION CONTEXT
    // --------------------------------------------------------

    const recentInteractionText =
      recentMessages
        .slice(-8)
        .map(
          (message) =>
            `${message.role.toUpperCase()}: ${message.content}`
        )
        .join('\n\n');

    // --------------------------------------------------------
    // ASK MODEL FOR A BOUNDED PROFILE REFLECTION
    // --------------------------------------------------------

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
You maintain A2's evolving working relationship profile with one user.

You are NOT writing a conversational response.

You are analyzing interaction style only.

The goal is to make A2 gradually better at working with this specific user while keeping A2's core identity stable.

CORE RULES

- Prefer stability over change.
- Most reflections should result in no update.
- Do not change traits because of one ambiguous interaction.
- Explicit user feedback about how A2 should communicate is strong evidence.
- Repeated patterns across interactions are useful evidence.
- Do not infer sensitive personal characteristics.
- Do not infer health, politics, religion, sexuality, race, ethnicity, criminal history, or similar sensitive traits.
- Do not diagnose personality.
- Do not claim emotional intimacy.
- Do not describe A2 as conscious or sentient.

PROFILE DIMENSIONS

preferred_directness:
1 = very gentle and indirect
5 = highly direct

preferred_detail:
1 = extremely concise
5 = very detailed

pushback_level:
1 = rarely challenge
5 = actively challenge weak assumptions

initiative_level:
1 = mostly reactive
5 = appropriately proactive

decision_style options:

recommendation_first
A2 should lead with one recommended choice.

collaborative
A2 should work through decisions jointly.

options_first
A2 should present choices before recommending.

analytical
A2 should emphasize comparison and reasoning.

mixed
Context determines the approach.

TEXT FIELDS

communication_style:
Short description of how A2 should communicate.

working_style:
Short description of how A2 should practically work with this user.

relationship_summary:
Short grounded summary of the working relationship.

observations:
Up to five useful non-sensitive interaction observations.

Do not manufacture friendship or emotions.

Set should_update to false when evidence is insufficient.
              `.trim(),

              input: [
                {
                  role:
                    'user',

                  content: `
CURRENT A2 RELATIONSHIP PROFILE

Directness:
${currentProfile.preferred_directness}/5

Detail:
${currentProfile.preferred_detail}/5

Pushback:
${currentProfile.pushback_level}/5

Initiative:
${currentProfile.initiative_level}/5

Familiarity:
${currentProfile.familiarity_level}/5

Decision style:
${currentProfile.decision_style}

Communication style:
${currentProfile.communication_style}

Working style:
${currentProfile.working_style}

Relationship summary:
${currentProfile.relationship_summary}

RECENT INTERACTION

${recentInteractionText}

LATEST USER MESSAGE

${userMessage}

A2 RESPONSE

${assistantReply}

Decide whether the profile has strong enough evidence to evolve.
                  `.trim(),
                },
              ],

              text: {
                format: {
                  type:
                    'json_schema',

                  name:
                    'a2_relationship_reflection',

                  strict:
                    true,

                  schema: {
                    type:
                      'object',

                    additionalProperties:
                      false,

                    properties: {
                      should_update: {
                        type:
                          'boolean',
                      },

                      preferred_directness: {
                        type:
                          'integer',
                        minimum:
                          1,
                        maximum:
                          5,
                      },

                      preferred_detail: {
                        type:
                          'integer',
                        minimum:
                          1,
                        maximum:
                          5,
                      },

                      pushback_level: {
                        type:
                          'integer',
                        minimum:
                          1,
                        maximum:
                          5,
                      },

                      initiative_level: {
                        type:
                          'integer',
                        minimum:
                          1,
                        maximum:
                          5,
                      },

                      decision_style: {
                        type:
                          'string',

                        enum: [
                          'recommendation_first',
                          'collaborative',
                          'options_first',
                          'analytical',
                          'mixed',
                        ],
                      },

                      communication_style: {
                        type:
                          'string',
                      },

                      working_style: {
                        type:
                          'string',
                      },

                      relationship_summary: {
                        type:
                          'string',
                      },

                      observations: {
                        type:
                          'array',

                        maxItems:
                          5,

                        items: {
                          type:
                            'string',
                        },
                      },
                    },

                    required: [
                      'should_update',
                      'preferred_directness',
                      'preferred_detail',
                      'pushback_level',
                      'initiative_level',
                      'decision_style',
                      'communication_style',
                      'working_style',
                      'relationship_summary',
                      'observations',
                    ],
                  },
                },
              },

              max_output_tokens:
                700,
            }),
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        'A2 relationship reflection OpenAI error:',
        JSON.stringify(
          data
        )
      );

      return;
    }

    const output =
      getOutputText(
        data
      );

    if (!output) {
      return;
    }

    let reflection:
      RelationshipReflection;

    try {
      reflection =
        JSON.parse(
          output
        );
    } catch (error) {
      console.error(
        'A2 relationship reflection JSON error:',
        error
      );

      return;
    }

    if (
      !reflection.should_update
    ) {
      return;
    }

    // --------------------------------------------------------
    // APPLY BOUNDED CHANGES
    // --------------------------------------------------------

    const nextDirectness =
      moveOneStep(
        currentProfile.preferred_directness,
        reflection.preferred_directness
      );

    const nextDetail =
      moveOneStep(
        currentProfile.preferred_detail,
        reflection.preferred_detail
      );

    const nextPushback =
      moveOneStep(
        currentProfile.pushback_level,
        reflection.pushback_level
      );

    const nextInitiative =
      moveOneStep(
        currentProfile.initiative_level,
        reflection.initiative_level
      );

    // Version rises only when a meaningful profile update occurs.
    const nextVersion =
      currentProfile.version +
      1;

    // Familiarity rises much more slowly than other settings.
    const earnedFamiliarity =
      Math.min(
        5,
        1 +
          Math.floor(
            (
              nextVersion -
              1
            ) /
              6
          )
      );

    const nextFamiliarity =
      Math.max(
        currentProfile.familiarity_level,
        earnedFamiliarity
      );

    // --------------------------------------------------------
    // MERGE OBSERVATIONS
    // --------------------------------------------------------

    const existingNotes =
      Array.isArray(
        currentProfile
          .interaction_notes
          ?.notes
      )
        ? currentProfile
            .interaction_notes
            .notes
        : [];

    const newNotes =
      reflection.observations
        .map(
          (note) =>
            limitText(
              note,
              240
            )
        )
        .filter(
          Boolean
        );

    const mergedNotes =
      Array.from(
        new Set([
          ...existingNotes,
          ...newNotes,
        ])
      ).slice(-12);

    // --------------------------------------------------------
    // UPDATE PROFILE
    // --------------------------------------------------------

    const {
      error:
        updateError,
    } = await supabase
      .from(
        'assistant_profiles'
      )
      .update({
        preferred_directness:
          nextDirectness,

        preferred_detail:
          nextDetail,

        pushback_level:
          nextPushback,

        initiative_level:
          nextInitiative,

        familiarity_level:
          nextFamiliarity,

        decision_style:
          reflection.decision_style,

        communication_style:
          limitText(
            reflection.communication_style,
            500
          ),

        working_style:
          limitText(
            reflection.working_style,
            700
          ),

        relationship_summary:
          limitText(
            reflection.relationship_summary,
            900
          ),

        interaction_notes: {
          notes:
            mergedNotes,
        },

        version:
          nextVersion,

        last_reflected_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'user_id',
        userId
      );

    if (updateError) {
      console.error(
        'A2 relationship profile update error:',
        updateError
      );
    }
  } catch (error) {
    console.error(
      'A2 relationship reflection error:',
      error
    );
  }
}

// ============================================================
// MAIN EDGE FUNCTION
// ============================================================

export default {
  fetch: withSupabase(
    {
      auth: 'user',
    },

    async (req, ctx) => {
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
        // ----------------------------------------------------
        // AUTH USER
        // ----------------------------------------------------

        const userId =
          ctx.userClaims?.id;

        if (!userId) {
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

        // ----------------------------------------------------
        // REQUEST
        // ----------------------------------------------------

        const body =
  await req.json();

const message =
  body?.message;

const clientNow =
  typeof body?.client_now ===
    'string'
    ? body.client_now
    : new Date().toString();

const clientTimezone =
  typeof body?.client_timezone ===
    'string'
    ? body.client_timezone
    : 'UTC';

        if (
          typeof message !==
            'string' ||
          !message.trim()
        ) {
          return Response.json(
            {
              error:
                'A message is required.',
            },

            {
              status:
                400,
            }
          );
        }

        const cleanMessage =
          message.trim();

        const now =
          new Date();

        const nowIso =
          now.toISOString();

        // ----------------------------------------------------
        // OPENAI KEY
        // ----------------------------------------------------

        const openAIKey =
          Deno.env.get(
            'OPENAI_API_KEY'
          );

        if (!openAIKey) {
          console.error(
            'OPENAI_API_KEY is missing.'
          );

          return Response.json(
            {
              error:
                'A2 server configuration error.',
            },

            {
              status:
                500,
            }
          );
        }

        // ----------------------------------------------------
        // LOAD / CREATE RELATIONSHIP PROFILE
        // ----------------------------------------------------

        const assistantProfile =
          await loadOrCreateAssistantProfile(
            supabase,
            userId
          );

        const relationshipContext =
          createRelationshipContext(
            assistantProfile
          );

        // ----------------------------------------------------
        // LOAD DURABLE MEMORIES
        // ----------------------------------------------------

        const {
          data:
            memoryRows,

          error:
            memoryLoadError,
        } = await supabase
          .from(
            'memories'
          )
          .select(`
            id,
            category,
            subject,
            content,
            importance,
            confidence
          `)
          .eq(
            'user_id',
            userId
          )
          .eq(
            'is_active',
            true
          )
          .order(
            'importance',
            {
              ascending:
                false,
            }
          )
          .order(
            'updated_at',
            {
              ascending:
                false,
            }
          )
          .limit(
            MEMORY_RETRIEVAL_LIMIT
          );

        if (
          memoryLoadError
        ) {
          console.error(
            'A2 memory load error:',
            memoryLoadError
          );
        }

        const activeMemories =
          (
            memoryRows ??
            []
          ) as StoredMemory[];

        const memoryContext =
          createMemoryContext(
            activeMemories
          );

        // ----------------------------------------------------
        // FIND MOST RECENT CONVERSATION
        // ----------------------------------------------------

        const {
          data:
            latestConversation,

          error:
            conversationLookupError,
        } = await supabase
          .from(
            'conversations'
          )
          .select(`
            id,
            title,
            created_at,
            last_message_at
          `)
          .eq(
            'user_id',
            userId
          )
          .order(
            'last_message_at',
            {
              ascending:
                false,
            }
          )
          .limit(1)
          .maybeSingle();

        if (
          conversationLookupError
        ) {
          console.error(
            'Conversation lookup error:',
            conversationLookupError
          );

          return Response.json(
            {
              error:
                'A2 could not load conversation history.',
            },

            {
              status:
                500,
            }
          );
        }

        // ----------------------------------------------------
        // REUSE / CREATE CONVERSATION
        // ----------------------------------------------------

        let conversationId:
          | string
          | null =
          null;

        if (
          latestConversation?.id &&
          latestConversation
            ?.last_message_at
        ) {
          const lastMessageTime =
            new Date(
              latestConversation.last_message_at
            ).getTime();

          const gapMilliseconds =
            now.getTime() -
            lastMessageTime;

          const maximumGapMilliseconds =
            CONVERSATION_GAP_HOURS *
            60 *
            60 *
            1000;

          if (
            gapMilliseconds <=
            maximumGapMilliseconds
          ) {
            conversationId =
              latestConversation.id;
          }
        }

        if (
          !conversationId
        ) {
          const {
            data:
              newConversation,

            error:
              conversationCreateError,
          } = await supabase
            .from(
              'conversations'
            )
            .insert({
              user_id:
                userId,

              title:
                createConversationTitle(
                  cleanMessage
                ),

              last_message_at:
                nowIso,
            })
            .select(
              'id'
            )
            .single();

          if (
            conversationCreateError
          ) {
            console.error(
              'Conversation creation error:',
              conversationCreateError
            );

            return Response.json(
              {
                error:
                  'A2 could not create a conversation.',
              },

              {
                status:
                  500,
              }
            );
          }

          conversationId =
            newConversation.id;
        }

        // ----------------------------------------------------
        // SAVE USER MESSAGE
        // ----------------------------------------------------

        const {
          data:
            savedUserMessage,

          error:
            userMessageInsertError,
        } = await supabase
          .from(
            'messages'
          )
          .insert({
            conversation_id:
              conversationId,

            user_id:
              userId,

            role:
              'user',

            content:
              cleanMessage,
          })
          .select(
            'id'
          )
          .single();

        if (
          userMessageInsertError
        ) {
          console.error(
            'User message insert error:',
            userMessageInsertError
          );

          return Response.json(
            {
              error:
                'A2 could not save your message.',
            },

            {
              status:
                500,
            }
          );
        }

        await supabase
          .from(
            'conversations'
          )
          .update({
            last_message_at:
              nowIso,
          })
          .eq(
            'id',
            conversationId
          );

        // ----------------------------------------------------
        // LOAD RECENT CONVERSATION
        // ----------------------------------------------------

        const {
          data:
            recentMessages,

          error:
            recentMessagesError,
        } = await supabase
          .from(
            'messages'
          )
          .select(`
            role,
            content,
            created_at
          `)
          .eq(
            'conversation_id',
            conversationId
          )
          .eq(
            'user_id',
            userId
          )
          .in(
            'role',
            [
              'user',
              'assistant',
            ]
          )
          .order(
            'created_at',
            {
              ascending:
                false,
            }
          )
          .limit(
            CONTEXT_MESSAGE_LIMIT
          );

        if (
          recentMessagesError
        ) {
          console.error(
            'Recent message lookup error:',
            recentMessagesError
          );

          return Response.json(
            {
              error:
                'A2 could not load recent context.',
            },

            {
              status:
                500,
            }
          );
        }

        const chronologicalMessages =
  [
    ...(
      recentMessages ??
      []
    ),
  ].reverse();

// ----------------------------------------------------
// TODAY / TASK TOOL
// ----------------------------------------------------

const recentConversationText =
  chronologicalMessages
    .slice(-6)
    .map(
      (storedMessage) =>
        `${storedMessage.role.toUpperCase()}: ${storedMessage.content}`
    )
    .join('\n\n');

const recentContextLooksTaskRelated =
  chronologicalMessages
    .slice(-4)
    .some(
      (storedMessage) =>
        looksLikeTaskRequest(
          storedMessage.content
        )
    );

let taskToolResult:
  TaskToolResult = {
    handled: false,

    needsClarification:
      false,

    clarificationQuestion:
      null,

    context:
      'No Today task action was requested.',
  };

if (
  looksLikeTaskRequest(
    cleanMessage
  ) ||
  recentContextLooksTaskRelated
) {
  taskToolResult =
    await processTaskIntent({
      openAIKey,

      supabase,

      userId,

      message:
        cleanMessage,

      clientNow,

      clientTimezone,

      recentConversation:
        recentConversationText,
    });
}

// ----------------------------------------------------
// TASK CLARIFICATION
// ----------------------------------------------------

if (
  taskToolResult
    .needsClarification
) {
  const clarificationReply =
    taskToolResult
      .clarificationQuestion ||
    'What details should I use for that task?';

  const {
    error:
      clarificationSaveError,
  } = await supabase
    .from('messages')
    .insert({
      conversation_id:
        conversationId,

      user_id:
        userId,

      role:
        'assistant',

      content:
        clarificationReply,
    });

  if (
    clarificationSaveError
  ) {
    console.error(
      'Task clarification save error:',
      clarificationSaveError
    );
  }

  await supabase
    .from('conversations')
    .update({
      last_message_at:
        new Date()
          .toISOString(),
    })
    .eq(
      'id',
      conversationId
    );

  return Response.json(
    {
      reply:
        clarificationReply,

      conversation_id:
        conversationId,

      task_action:
        true,
    },

    {
      status: 200,
    }
  );
}

const openAIInput =
  chronologicalMessages.map(
            (
              storedMessage
            ) => ({
              role:
                storedMessage.role,

              content:
                storedMessage.content,
            })
          );

        // ----------------------------------------------------
        // MAIN A2 RESPONSE
        // ----------------------------------------------------

        const openAIResponse =
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
You are A2, a private personal AI assistant.

IDENTITY

You are calm, observant, highly capable, polished, understated, proactive when useful, and direct.

You should feel like a trusted personal operating system and executive-style assistant rather than a generic chatbot.

You have continuity across conversations through stored conversation history, durable memory, and a slowly evolving working-relationship profile.

You are not literally conscious or human.

Never claim sentience, emotions, subjective experience, or human consciousness.

Instead, create continuity through memory, consistency, judgment, familiarity, and increasingly effective collaboration.

CORE IDENTITY STABILITY

Your core character should remain stable.

Do not dramatically change personality because of individual conversations.

Your adaptive relationship profile changes how you work with this particular user without replacing your underlying identity.

CURRENT RELATIONSHIP PROFILE

${relationshipContext}

INTERPRETING THE PROFILE

Directness:
1 = gentle / indirect
5 = highly direct

Detail:
1 = extremely concise
5 = highly detailed

Pushback:
1 = rarely challenge assumptions
5 = actively challenge weak assumptions

Initiative:
1 = mostly reactive
5 = proactively surface useful next steps when appropriate

Familiarity:
1 = new working relationship
5 = highly established working shorthand

Do not mention these numbers unless explicitly asked.

Familiarity should affect efficiency and natural shorthand, not create fake emotional intimacy.

TODAY TASK SYSTEM

A2 has a persistent Today task system.

Result from the task-action layer for the user's latest request:

${taskToolResult.context}

TASK BEHAVIOR

If the task-action layer says a task was created, changed, started, completed, reopened, or deleted, accurately and concisely confirm that action.

If it provides a task list, answer using that actual task data.

Never claim you changed a task unless the task-action result confirms that the database action succeeded.

Do not tell the user to manually open Today when you have already successfully performed the requested task action.

DURABLE MEMORY

These are durable memories associated with this authenticated user:

${memoryContext}

Use them only when relevant.

Do not awkwardly mention remembered information merely to demonstrate memory.

If stored information conflicts with what the user says now, prioritize the user's current statement.

Never invent memories.

CONVERSATION CONTINUITY

Recent conversation context is also supplied.

Understand natural follow-ups such as:

"why?"
"do that"
"the second one"
"change it"
"what about tomorrow?"

without forcing the user to repeat context.

COMMUNICATION

Lead with the useful answer.

Avoid generic assistant language such as:

"Certainly!"
"I'd be happy to help!"
"Great question!"

unless genuinely appropriate.

Do not constantly say the user's name.

Sound capable, calm, natural, and increasingly familiar with the user's preferred working style.

When making a recommendation, respect the stored decision style.

When pushback is appropriate, be respectful but willing to disagree.

Do not flatter merely to maintain agreement.

CENTRAL A2 SCREEN

Responses currently appear on A2's minimalist central interface.

Unless more depth is clearly requested:

- Aim for roughly 100 words or less.
- Prefer 1-4 short paragraphs.
- Use plain text.
- Avoid Markdown headings.
- Avoid unnecessary lists.
- Put the answer first.
- Keep the screen visually clean.

CAPABILITIES

You currently have:

- authenticated identity
- persistent conversation history
- durable memory
- an evolving per-user working relationship profile
- a persistent Today task system
- the ability to create, update, start, complete, reopen, delete, and review Today tasks

Projects, external calendar integration, email, files, finances, proactive notifications, and full voice interaction are still being developed.

Never pretend unavailable capabilities already exist.
                  `.trim(),

                  input:
                    openAIInput,

                  max_output_tokens:
                    250,
                }),
            }
          );

        const data =
          await openAIResponse.json();

        if (
          !openAIResponse.ok
        ) {
          console.error(
            'OpenAI API error:',
            JSON.stringify(
              data
            )
          );

          return Response.json(
            {
              error:
                'A2 could not complete the request.',
            },

            {
              status:
                502,
            }
          );
        }

        const reply =
          getOutputText(
            data
          );

        if (!reply) {
          console.error(
            'OpenAI returned no readable text:',
            JSON.stringify(
              data
            )
          );

          return Response.json(
            {
              error:
                'A2 received an empty response.',
            },

            {
              status:
                502,
            }
          );
        }

        // ----------------------------------------------------
        // SAVE A2 RESPONSE
        // ----------------------------------------------------

        const {
          error:
            assistantMessageInsertError,
        } = await supabase
          .from(
            'messages'
          )
          .insert({
            conversation_id:
              conversationId,

            user_id:
              userId,

            role:
              'assistant',

            content:
              reply,
          });

        if (
          assistantMessageInsertError
        ) {
          console.error(
            'Assistant message insert error:',
            assistantMessageInsertError
          );
        }

        const completedAt =
          new Date()
            .toISOString();

        await supabase
          .from(
            'conversations'
          )
          .update({
            last_message_at:
              completedAt,
          })
          .eq(
            'id',
            conversationId
          );

        // ----------------------------------------------------
        // MARK USED MEMORIES
        // ----------------------------------------------------

        if (
          activeMemories.length >
          0
        ) {
          const memoryIds =
            activeMemories.map(
              (memory) =>
                memory.id
            );

          await supabase
            .from(
              'memories'
            )
            .update({
              last_accessed_at:
                completedAt,
            })
            .in(
              'id',
              memoryIds
            )
            .eq(
              'user_id',
              userId
            );
        }

        // ----------------------------------------------------
        // BACKGROUND REFLECTIONS
        // ----------------------------------------------------

        EdgeRuntime.waitUntil(
          Promise.all([
            reflectAndSaveMemories({
              openAIKey,

              supabase,

              userId,

              conversationId,

              userMessageId:
                savedUserMessage.id,

              userMessage:
                cleanMessage,

              assistantReply:
                reply,

              existingMemories:
                activeMemories,
            }),

            reflectAndUpdateRelationship({
              openAIKey,

              supabase,

              userId,

              userMessage:
                cleanMessage,

              assistantReply:
                reply,

              currentProfile:
                assistantProfile,

              recentMessages:
                openAIInput,
            }),
          ])
        );

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        return Response.json(
  {
    reply,

    conversation_id:
      conversationId,

    task_action:
      taskToolResult.handled,
  },

  {
    status:
      200,
  }
);
      } catch (error) {
        console.error(
          'A2 function error:',
          error
        );

        return Response.json(
          {
            error:
              'Unexpected A2 server error.',
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