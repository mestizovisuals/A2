import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import {
  withSupabase,
} from 'npm:@supabase/server@^1';


// ============================================================
// HELPERS
// ============================================================

function randomState() {
  const bytes =
    new Uint8Array(
      32
    );

  crypto
    .getRandomValues(
      bytes
    );

  return Array
    .from(
      bytes
    )
    .map(
      (
        byte
      ) =>
        byte
          .toString(16)
          .padStart(
            2,
            '0'
          )
    )
    .join('');
}


async function sha256Hex(
  value:
    string
) {
  const bytes =
    new TextEncoder()
      .encode(
        value
      );

  const digest =
    await crypto
      .subtle
      .digest(
        'SHA-256',
        bytes
      );

  return Array
    .from(
      new Uint8Array(
        digest
      )
    )
    .map(
      (
        byte
      ) =>
        byte
          .toString(16)
          .padStart(
            2,
            '0'
          )
    )
    .join('');
}


// ============================================================
// MAIN
// ============================================================

export default {
  fetch: withSupabase(
    {
      auth:
        'user',
    },

    async (
      _req,
      ctx
    ) => {
      try {
        const userId =
          ctx.userClaims
            ?.sub;

        if (
          !userId
        ) {
          return Response.json(
            {
              success:
                false,

              error:
                'A2 user session is unavailable.',
            },
            {
              status:
                401,
            }
          );
        }

        const clientId =
          Deno.env.get(
            'A2_GOOGLE_CALENDAR_CLIENT_ID'
          );

        const redirectUri =
          Deno.env.get(
            'A2_GOOGLE_CALENDAR_REDIRECT_URI'
          );

        if (
          !clientId ||
          !redirectUri
        ) {
          return Response.json(
            {
              success:
                false,

              error:
                'Google Calendar OAuth is not configured.',
            },
            {
              status:
                500,
            }
          );
        }

        const state =
          randomState();

        const stateHash =
          await sha256Hex(
            state
          );

        const expiresAt =
          new Date(
            Date.now() +
              10 *
                60 *
                1000
          )
            .toISOString();

        // Remove abandoned OAuth handshakes.
        await ctx
          .supabaseAdmin
          .from(
            'calendar_oauth_states'
          )
          .delete()
          .lt(
            'expires_at',
            new Date()
              .toISOString()
          );

        const {
          error:
            stateError,
        } =
          await ctx
            .supabaseAdmin
            .from(
              'calendar_oauth_states'
            )
            .insert({
              state_hash:
                stateHash,

              user_id:
                userId,

              provider:
                'google',

              expires_at:
                expiresAt,
            });

        if (
          stateError
        ) {
          throw stateError;
        }

        const scopes = [
          'openid',
          'email',

          'https://www.googleapis.com/auth/calendar.events',

          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',

          'https://www.googleapis.com/auth/calendar.freebusy',
        ];

        const params =
          new URLSearchParams({
            client_id:
              clientId,

            redirect_uri:
              redirectUri,

            response_type:
              'code',

            access_type:
              'offline',

            prompt:
              'consent',

            include_granted_scopes:
              'true',

            scope:
              scopes
                .join(
                  ' '
                ),

            state,
          });

        const authorizationUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        return Response.json({
          success:
            true,

          authorization_url:
            authorizationUrl,
        });
      } catch (
        error
      ) {
        console.error(
          'A2 Google Calendar connect error:',
          error
        );

        return Response.json(
          {
            success:
              false,

            error:
              'A2 could not begin Google Calendar authorization.',
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