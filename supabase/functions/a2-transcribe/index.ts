import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { withSupabase } from 'npm:@supabase/server@^1';

const CONVERSATION_GAP_HOURS = 12;

function createConversationTitle(
  message: string
): string {
  const clean =
    message
      .replace(/\s+/g, ' ')
      .trim();

  if (clean.length <= 60) {
    return clean;
  }

  return `${clean.slice(0, 57)}...`;
}

export default {
  fetch: withSupabase(
    {
      auth: 'user',
    },

    async (req, ctx) => {
      if (req.method !== 'POST') {
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

        const body =
          await req.json();

        const userText =
          typeof body?.user_text ===
            'string'
            ? body.user_text.trim()
            : '';

        const assistantText =
          typeof body
            ?.assistant_text ===
            'string'
            ? body.assistant_text.trim()
            : '';

        if (
          !userText ||
          !assistantText
        ) {
          return Response.json(
            {
              error:
                'Both user and assistant transcripts are required.',
            },
            {
              status: 400,
            }
          );
        }

        const now =
          new Date();

        const nowIso =
          now.toISOString();

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
            'A2 live sync conversation lookup error:',
            conversationLookupError
          );

          return Response.json(
            {
              error:
                'Could not load conversation history.',
            },
            {
              status: 500,
            }
          );
        }

        // ----------------------------------------------------
        // REUSE OR CREATE CONVERSATION
        // ----------------------------------------------------

        let conversationId:
          | string
          | null = null;

        if (
          latestConversation?.id &&
          latestConversation
            ?.last_message_at
        ) {
          const previousTime =
            new Date(
              latestConversation
                .last_message_at
            ).getTime();

          const gap =
            now.getTime() -
            previousTime;

          const maximumGap =
            CONVERSATION_GAP_HOURS *
            60 *
            60 *
            1000;

          if (
            gap <=
            maximumGap
          ) {
            conversationId =
              latestConversation.id;
          }
        }

        if (!conversationId) {
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
                  userText
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
              'A2 live sync conversation create error:',
              conversationCreateError
            );

            return Response.json(
              {
                error:
                  'Could not create conversation.',
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
        // SAVE USER + A2 TURN
        // ----------------------------------------------------

        const {
          error:
            messageInsertError,
        } = await supabase
          .from(
            'messages'
          )
          .insert([
            {
              conversation_id:
                conversationId,

              user_id:
                userId,

              role:
                'user',

              content:
                userText,
            },

            {
              conversation_id:
                conversationId,

              user_id:
                userId,

              role:
                'assistant',

              content:
                assistantText,
            },
          ]);

        if (
          messageInsertError
        ) {
          console.error(
            'A2 live sync message insert error:',
            messageInsertError
          );

          return Response.json(
            {
              error:
                'Could not save live conversation.',
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
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            conversationId
          )
          .eq(
            'user_id',
            userId
          );

        return Response.json({
          success:
            true,

          conversation_id:
            conversationId,
        });
      } catch (error) {
        console.error(
          'A2 live sync error:',
          error
        );

        return Response.json(
          {
            error:
              'Unexpected live sync error.',
          },
          {
            status: 500,
          }
        );
      }
    }
  ),
};