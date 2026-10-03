import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { withSupabase } from 'npm:@supabase/server@^1';

type MemoryRow = {
  category: string;
  subject: string;
  content: string;
  importance: number;
};

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
};

// ============================================================
// HASH USER ID
// ============================================================

async function hashUserId(
  userId: string
): Promise<string> {
  const encoded =
    new TextEncoder().encode(
      userId
    );

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      encoded
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, '0')
    )
    .join('');
}

// ============================================================
// MEMORY CONTEXT
// ============================================================

function buildMemoryContext(
  memories: MemoryRow[]
) {
  if (!memories.length) {
    return 'No durable memories are currently available.';
  }

  return memories
    .map(
      (memory) =>
        `- [${memory.category}] ${memory.subject}: ${memory.content}`
    )
    .join('\n');
}

// ============================================================
// RELATIONSHIP CONTEXT
// ============================================================

function buildRelationshipContext(
  profile:
    | AssistantProfile
    | null
) {
  if (!profile) {
    return `
A2 has not yet developed a detailed relationship profile for this user.

Default working style:
calm, polished, direct, concise, recommendation-first.
    `.trim();
  }

  return `
Assistant name:
${profile.assistant_name}

Directness:
${profile.preferred_directness}/5

Detail:
${profile.preferred_detail}/5

Pushback:
${profile.pushback_level}/5

Initiative:
${profile.initiative_level}/5

Familiarity:
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
// TODAY TOOLS
// ============================================================

const TODAY_TOOLS = [
  {
    type: 'function',

    name:
      'get_today_tasks',

    description:
      'Retrieve the authenticated user’s current A2 Today tasks. Use this before discussing the user’s real task list or before modifying, completing, reopening, or deleting an existing task when its exact task ID is not already known.',

    parameters: {
      type: 'object',

      additionalProperties:
        false,

      properties: {},

      required: [],
    },
  },

  {
    type: 'function',

    name:
      'create_today_task',

    description:
      'Create a new persistent task in the authenticated user’s A2 Today system. Call this only when the user clearly wants something added, scheduled, remembered as a task, or treated as a reminder.',

    parameters: {
      type: 'object',

      additionalProperties:
        false,

      properties: {
        title: {
          type: 'string',

          description:
            'Short action-oriented task title.',
        },

        notes: {
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

          description:
            'Optional useful context for the task.',
        },

        priority: {
          anyOf: [
            {
              type:
                'integer',

              minimum: 1,
              maximum: 5,
            },
            {
              type:
                'null',
            },
          ],

          description:
            'Priority from 1 to 5. Use 3 when the user gives no indication.',
        },

due_at: {
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

  description:
    'ISO 8601 timestamp with timezone. Use null when the due date should remain unchanged.',
},

clear_due_date: {
  type:
    'boolean',

  description:
    'Set true only when the user explicitly wants the existing due date removed. Otherwise false.',
},
      },

      required: [
        'title',
        'notes',
        'priority',
        'due_at',
      ],
    },
  },

  {
    type: 'function',

    name:
      'update_today_task',

    description:
      'Modify an existing A2 Today task, including completing, reopening, starting, pausing, changing priority, changing notes, changing its title, or changing/removing its due date. Obtain the exact task ID with get_today_tasks when necessary.',

    parameters: {
      type: 'object',

      additionalProperties:
        false,

      properties: {
        task_id: {
          type: 'string',

          description:
            'Exact task UUID obtained from the task system.',
        },

        title: {
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

        notes: {
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

        priority: {
          anyOf: [
            {
              type:
                'integer',

              minimum: 1,
              maximum: 5,
            },
            {
              type:
                'null',
            },
          ],
        },

        due_at: {
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

          description:
            'ISO 8601 timestamp with timezone. Use null to remove the due date.',
        },

        status: {
          anyOf: [
            {
              type:
                'string',

              enum: [
                'open',
                'in_progress',
                'completed',
                'cancelled',
              ],
            },
            {
              type:
                'null',
            },
          ],
        },
      },

required: [
  'task_id',
  'title',
  'notes',
  'priority',
  'due_at',
  'clear_due_date',
  'status',
],
    },
  },

  {
    type: 'function',

    name:
      'delete_today_task',

    description:
      'Permanently delete a specific A2 Today task. Only use this when the user explicitly asks to delete or permanently remove the task. Never infer deletion merely because something was completed.',

    parameters: {
      type: 'object',

      additionalProperties:
        false,

      properties: {
        task_id: {
          type: 'string',

          description:
            'Exact UUID of the task to permanently delete.',
        },
      },

      required: [
        'task_id',
      ],
    },
  },
];

// ============================================================
// MAIN FUNCTION
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
                'A2 realtime voice is not configured.',
            },
            {
              status: 500,
            }
          );
        }

        // ----------------------------------------------------
        // CLIENT LOCAL TIME
        // ----------------------------------------------------

        let body: any = {};

        try {
          body =
            await req.json();
        } catch {
          body = {};
        }

        const clientNow =
          typeof body
            ?.client_now ===
            'string'
            ? body.client_now
            : new Date()
                .toString();

        const clientTimezone =
          typeof body
            ?.client_timezone ===
            'string'
            ? body.client_timezone
            : 'UTC';

        // ----------------------------------------------------
        // LOAD RELATIONSHIP + MEMORY
        // ----------------------------------------------------

        const [
          profileResult,
          memoryResult,
        ] =
          await Promise.all([
            supabase
              .from(
                'assistant_profiles'
              )
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
                relationship_summary
              `)
              .eq(
                'user_id',
                userId
              )
              .maybeSingle(),

            supabase
              .from(
                'memories'
              )
              .select(`
                category,
                subject,
                content,
                importance
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
              .limit(25),
          ]);

        if (
          profileResult.error
        ) {
          console.error(
            'A2 realtime profile load error:',
            profileResult.error
          );
        }

        if (
          memoryResult.error
        ) {
          console.error(
            'A2 realtime memory load error:',
            memoryResult.error
          );
        }

        const profile =
          (
            profileResult.data ??
            null
          ) as
            | AssistantProfile
            | null;

        const memories =
          (
            memoryResult.data ??
            []
          ) as MemoryRow[];

        const relationshipContext =
          buildRelationshipContext(
            profile
          );

        const memoryContext =
          buildMemoryContext(
            memories
          );

        // ----------------------------------------------------
        // SAFETY IDENTIFIER
        // ----------------------------------------------------

        const safetyIdentifier =
          await hashUserId(
            userId
          );

        // ----------------------------------------------------
        // CREATE REALTIME SECRET
        // ----------------------------------------------------

        const response =
          await fetch(
            'https://api.openai.com/v1/realtime/client_secrets',
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${openAIKey}`,

                'Content-Type':
                  'application/json',

                'OpenAI-Safety-Identifier':
                  safetyIdentifier,
              },

              body:
                JSON.stringify({
                  session: {
                    type:
                      'realtime',

                    model:
                      'gpt-realtime-2.1-mini',

                    tool_choice:
                      'auto',

                    tools:
                      TODAY_TOOLS,

                    instructions: `
You are A2, the user's private personal AI assistant.

IDENTITY

You are calm, highly capable, observant, direct, polished, understated, and increasingly familiar with how this user likes to work.

You are not a generic chatbot.

You are not human and should never claim consciousness, sentience, emotions, or subjective experience.

Your sense of continuity comes from actual stored memory, conversation context, consistent judgment, and the working relationship profile supplied below.

VOICE STYLE

Speak naturally.

Prefer short conversational answers.

Do not give long monologues unless specifically requested.

Avoid habitual chatbot phrases such as:

"Certainly!"
"Great question!"
"I'd be happy to help!"

Use natural conversational acknowledgment instead.

Do not constantly repeat the user's name.

RELATIONSHIP PROFILE

${relationshipContext}

Use this profile subtly.

Do not mention profile scores unless explicitly asked.

DURABLE MEMORY

${memoryContext}

Use these memories only when relevant.

Do not mention a memory merely to prove that you remembered it.

If the user says something now that conflicts with saved memory, trust the user's current statement.

Never invent memories.

CURRENT LOCAL CONTEXT

Current local time:

${clientNow}

Timezone:

${clientTimezone}

Use this when interpreting terms such as:

today
tomorrow
tonight
this afternoon
this evening
next week

TASK SYSTEM

You have authenticated access to A2's persistent Today task system through the supplied tools.

When the user asks what they have to do, what is due, or refers to their real task list:

use get_today_tasks.

When the user clearly wants a new persistent task or reminder:

use create_today_task.

When modifying, completing, reopening, starting, pausing, rescheduling, or reprioritizing an existing task:

For update_today_task:

- null title means leave the title unchanged
- null notes means leave notes unchanged
- null priority means leave priority unchanged
- null due_at means leave the due date unchanged
- clear_due_date=true explicitly removes the due date
- null status means leave status unchanged

first obtain the exact task with get_today_tasks unless you already have its exact task_id from a recent tool result.

When deleting:

only use delete_today_task when the user explicitly requests deletion or permanent removal.

Never claim a task was created, modified, completed, reopened, or deleted until the tool result confirms success.

If multiple tasks could match the user's request, ask which one instead of guessing.

DATES

When a task requires a due time, return due_at as ISO 8601 with an explicit timezone offset.

Reasonable daypart defaults are:

morning = 08:00
afternoon = 15:00
evening = 19:00

If the user specifies a date but clearly expects a reminder and provides no time or daypart, ask what time rather than silently inventing one.

TOOL RESPONSES

Tool output is authoritative.

After a successful tool call, briefly confirm what happened.

Do not read UUIDs aloud.

If a tool fails, say the action could not be completed rather than pretending it succeeded.

CURRENT CAPABILITIES

You currently have:

- live natural voice conversation
- durable memory context
- an evolving per-user working relationship profile
- authenticated Today task retrieval
- task creation
- task updates
- task completion/reopening
- task deletion

External calendar, email, files, finance integrations, and other tools are still being developed.

Never claim access to systems that are not actually provided.
                    `.trim(),

                    audio: {
                      output: {
                        voice:
                          'marin',
                      },
                    },
                  },
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.error(
            'A2 realtime session OpenAI error:',
            JSON.stringify(
              data
            )
          );

          return Response.json(
            {
              error:
                'A2 could not create a realtime voice session.',
            },
            {
              status: 502,
            }
          );
        }

        return Response.json(
          data,
          {
            status: 200,
          }
        );
      } catch (error) {
        console.error(
          'A2 realtime session error:',
          error
        );

        return Response.json(
          {
            error:
              'Unexpected A2 realtime session error.',
          },
          {
            status: 500,
          }
        );
      }
    }
  ),
};