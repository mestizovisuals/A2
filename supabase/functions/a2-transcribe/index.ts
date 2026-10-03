import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { withSupabase } from 'npm:@supabase/server@^1';

const MAX_AUDIO_BYTES =
  20 * 1024 * 1024;

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
                'A2 transcription is not configured.',
            },
            {
              status: 500,
            }
          );
        }

        const incomingForm =
          await req.formData();

        const audio =
          incomingForm.get(
            'audio'
          );

        if (
          !(audio instanceof File)
        ) {
          return Response.json(
            {
              error:
                'Audio file is required.',
            },
            {
              status: 400,
            }
          );
        }

        if (audio.size === 0) {
          return Response.json(
            {
              error:
                'The audio recording was empty.',
            },
            {
              status: 400,
            }
          );
        }

        if (
          audio.size >
          MAX_AUDIO_BYTES
        ) {
          return Response.json(
            {
              error:
                'The recording is too large.',
            },
            {
              status: 413,
            }
          );
        }

        const openAIForm =
          new FormData();

        openAIForm.append(
          'model',
          'gpt-transcribe'
        );

        openAIForm.append(
          'file',
          audio,
          audio.name ||
            'a2-voice.webm'
        );

        openAIForm.append(
          'prompt',
          'Accurately transcribe this message to the personal assistant A2. A2 is pronounced A-two. Preserve names, dates, times, numbers, and task instructions carefully.'
        );

        const response =
          await fetch(
            'https://api.openai.com/v1/audio/transcriptions',
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${openAIKey}`,
              },

              body:
                openAIForm,
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.error(
            'A2 transcription OpenAI error:',
            JSON.stringify(
              data
            )
          );

          return Response.json(
            {
              error:
                'A2 could not transcribe the recording.',
            },
            {
              status: 502,
            }
          );
        }

        const text =
          typeof data?.text ===
            'string'
            ? data.text.trim()
            : '';

        if (!text) {
          return Response.json(
            {
              error:
                'A2 could not hear anything clearly.',
            },
            {
              status: 422,
            }
          );
        }

        return Response.json(
          {
            text,
          },
          {
            status: 200,
          }
        );
      } catch (error) {
        console.error(
          'A2 transcription function error:',
          error
        );

        return Response.json(
          {
            error:
              'Unexpected A2 transcription error.',
          },
          {
            status: 500,
          }
        );
      }
    }
  ),
};