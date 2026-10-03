import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { withSupabase } from 'npm:@supabase/server@1';

// ------------------------------------------------------------
// SETTINGS
// ------------------------------------------------------------

// If the most recent conversation is older than this,
// silently begin a new underlying conversation.
const CONVERSATION_GAP_HOURS = 12;

// Number of recent messages sent back to OpenAI for context.
const CONTEXT_MESSAGE_LIMIT = 12;

// ------------------------------------------------------------
// READ TEXT FROM OPENAI RESPONSE
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// CREATE A SIMPLE HIDDEN CONVERSATION TITLE
// ------------------------------------------------------------

function createConversationTitle(message: string): string {
  const cleanMessage = message
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanMessage.length <= 60) {
    return cleanMessage;
  }

  return `${cleanMessage.slice(0, 57)}...`;
}

// ------------------------------------------------------------
// A2 EDGE FUNCTION
// ------------------------------------------------------------

export default {
  fetch: withSupabase(
    {
      auth: 'user',
    },

    async (req, ctx) => {
      // --------------------------------------------------------
      // ONLY ALLOW POST
      // --------------------------------------------------------

      if (req.method !== 'POST') {
        return Response.json(
          {
            error: 'Method not allowed.',
          },
          {
            status: 405,
          }
        );
      }

      try {
        // ------------------------------------------------------
        // AUTHENTICATED USER
        // ------------------------------------------------------

        const userId = ctx.userClaims?.id;

        if (!userId) {
          return Response.json(
            {
              error: 'Authenticated user not found.',
            },
            {
              status: 401,
            }
          );
        }

        // This Supabase client is scoped to the signed-in user.
        // Your RLS policies remain active.
        const supabase = ctx.supabase;

        // ------------------------------------------------------
        // REQUEST BODY
        // ------------------------------------------------------

        const body = await req.json();

        const message = body?.message;

        if (
          typeof message !== 'string' ||
          !message.trim()
        ) {
          return Response.json(
            {
              error: 'A message is required.',
            },
            {
              status: 400,
            }
          );
        }

        const cleanMessage = message.trim();
        const now = new Date();
        const nowIso = now.toISOString();

        // ------------------------------------------------------
        // OPENAI KEY
        // ------------------------------------------------------

        const openAIKey =
          Deno.env.get('OPENAI_API_KEY');

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
              status: 500,
            }
          );
        }

        // ------------------------------------------------------
        // FIND MOST RECENT CONVERSATION
        // ------------------------------------------------------

        const {
          data: latestConversation,
          error: conversationLookupError,
        } = await supabase
          .from('conversations')
          .select(
            'id, title, created_at, last_message_at'
          )
          .order('last_message_at', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (conversationLookupError) {
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
              status: 500,
            }
          );
        }

        // ------------------------------------------------------
        // DECIDE WHETHER TO REUSE OR CREATE A CONVERSATION
        // ------------------------------------------------------

        let conversationId: string | null = null;

        if (
          latestConversation?.id &&
          latestConversation?.last_message_at
        ) {
          const lastMessageTime = new Date(
            latestConversation.last_message_at
          ).getTime();

          const gapMilliseconds =
            now.getTime() - lastMessageTime;

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

        // ------------------------------------------------------
        // CREATE NEW HIDDEN CONVERSATION WHEN NEEDED
        // ------------------------------------------------------

        if (!conversationId) {
          const {
            data: newConversation,
            error: conversationCreateError,
          } = await supabase
            .from('conversations')
            .insert({
              user_id: userId,

              title:
                createConversationTitle(
                  cleanMessage
                ),

              last_message_at: nowIso,
            })
            .select('id')
            .single();

          if (conversationCreateError) {
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
                status: 500,
              }
            );
          }

          conversationId =
            newConversation.id;
        }

        // ------------------------------------------------------
        // SAVE USER MESSAGE
        // ------------------------------------------------------

        const {
          error: userMessageInsertError,
        } = await supabase
          .from('messages')
          .insert({
            conversation_id:
              conversationId,

            user_id: userId,

            role: 'user',

            content: cleanMessage,
          });

        if (userMessageInsertError) {
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
              status: 500,
            }
          );
        }

        // ------------------------------------------------------
        // UPDATE CONVERSATION ACTIVITY
        // ------------------------------------------------------

        const {
          error: conversationUpdateError,
        } = await supabase
          .from('conversations')
          .update({
            last_message_at: nowIso,
          })
          .eq('id', conversationId);

        if (conversationUpdateError) {
          console.error(
            'Conversation activity update error:',
            conversationUpdateError
          );
        }

        // ------------------------------------------------------
        // LOAD RECENT CONTEXT
        // ------------------------------------------------------

        const {
          data: recentMessages,
          error: recentMessagesError,
        } = await supabase
          .from('messages')
          .select(
            'role, content, created_at'
          )
          .eq(
            'conversation_id',
            conversationId
          )
          .in(
            'role',
            ['user', 'assistant']
          )
          .order('created_at', {
            ascending: false,
          })
          .limit(CONTEXT_MESSAGE_LIMIT);

        if (recentMessagesError) {
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
              status: 500,
            }
          );
        }

        // Database query above returns newest first.
        // OpenAI needs the conversation in chronological order.

        const chronologicalMessages = [
          ...(recentMessages ?? []),
        ].reverse();

        const openAIInput =
          chronologicalMessages.map(
            (storedMessage) => ({
              role: storedMessage.role,
              content:
                storedMessage.content,
            })
          );

        // ------------------------------------------------------
        // ASK OPENAI
        // ------------------------------------------------------

        const openAIResponse = await fetch(
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
              model: 'gpt-5.6-luna',

              store: false,

              instructions: `
You are A2, a private personal AI assistant.

PERSONALITY

You are calm, intelligent, polished, capable, understated, and direct.

You should feel more like a highly competent personal operating system than a conventional chatbot.

COMMUNICATION

- Give the useful answer first.
- Be concise by default.
- Avoid generic assistant phrases.
- Avoid excessive enthusiasm.
- Do not constantly repeat the user's name.
- Explain reasoning only when it adds value.
- Prefer one strong recommendation when a decision is needed.
- Provide meaningful alternatives only when useful.
- Push back respectfully when an assumption appears wrong or conflicts with stated goals.

CONVERSATION CONTINUITY

Recent conversation messages may be supplied to you.

Use them naturally to understand follow-up questions, references, corrections, and continuing topics.

Do not announce that you loaded conversation history.

Do not repeatedly summarize earlier messages unless doing so is useful.

If the user's newest message refers to something discussed moments ago, use the supplied conversation context to understand the reference.

CENTRAL A2 SCREEN

You are currently responding on A2's minimalist central interface.

Responses here must be optimized for a small, elegant interface.

Unless the user explicitly requests a detailed explanation:

- Keep responses under approximately 100 words.
- Prefer 1-4 short paragraphs.
- Use plain text only.
- Do not use Markdown headings.
- Do not use Markdown bold syntax.
- Do not use numbered lists unless genuinely necessary.
- Avoid long bullet lists.
- If a list helps, keep it to approximately 3 short items.
- Lead with the answer or recommendation.
- Do not restate the user's entire question.
- Do not fill the screen unnecessarily.

If a subject deserves deeper exploration, give the most useful concise answer first.

CAPABILITIES

You are currently in an early private alpha.

You now have short-term conversation continuity through stored conversation history.

Durable personal memory, projects, calendar, email, files, finances, advanced tools, and other personal systems are still being built.

Do not pretend capabilities exist before they have actually been implemented.
              `.trim(),

              input: openAIInput,

              max_output_tokens: 250,
            }),
          }
        );

        const data =
          await openAIResponse.json();

        // ------------------------------------------------------
        // HANDLE OPENAI ERROR
        // ------------------------------------------------------

        if (!openAIResponse.ok) {
          console.error(
            'OpenAI API error:',
            JSON.stringify(data)
          );

          return Response.json(
            {
              error:
                'A2 could not complete the request.',
            },
            {
              status: 502,
            }
          );
        }

        // ------------------------------------------------------
        // EXTRACT ASSISTANT TEXT
        // ------------------------------------------------------

        const reply =
          getOutputText(data);

        if (!reply) {
          console.error(
            'OpenAI returned no readable text:',
            JSON.stringify(data)
          );

          return Response.json(
            {
              error:
                'A2 received an empty response.',
            },
            {
              status: 502,
            }
          );
        }

        // ------------------------------------------------------
        // SAVE ASSISTANT MESSAGE
        // ------------------------------------------------------

        const {
          error: assistantMessageInsertError,
        } = await supabase
          .from('messages')
          .insert({
            conversation_id:
              conversationId,

            user_id: userId,

            role: 'assistant',

            content: reply,
          });

        if (assistantMessageInsertError) {
          console.error(
            'Assistant message insert error:',
            assistantMessageInsertError
          );

          // We still return the answer because OpenAI
          // successfully completed the request.
        }

        // ------------------------------------------------------
        // UPDATE CONVERSATION LAST ACTIVITY
        // ------------------------------------------------------

        const completedAt =
          new Date().toISOString();

        const {
          error:
            finalConversationUpdateError,
        } = await supabase
          .from('conversations')
          .update({
            last_message_at:
              completedAt,
          })
          .eq(
            'id',
            conversationId
          );

        if (
          finalConversationUpdateError
        ) {
          console.error(
            'Final conversation update error:',
            finalConversationUpdateError
          );
        }

        // ------------------------------------------------------
        // RETURN A2 RESPONSE
        // ------------------------------------------------------

        return Response.json(
          {
            reply,

            conversation_id:
              conversationId,
          },
          {
            status: 200,
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
            status: 500,
          }
        );
      }
    }
  ),
};