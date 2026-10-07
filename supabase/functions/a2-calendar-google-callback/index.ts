import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import {
  withSupabase,
} from 'npm:@supabase/server@^1';


// ============================================================
// TYPES
// ============================================================

type GoogleTokenResponse = {
  access_token:
    string;

  expires_in:
    number;

  refresh_token?:
    string;

  scope?:
    string;

  token_type?:
    string;

  id_token?:
    string;
};


type GoogleUserInfo = {
  sub:
    string;

  email?:
    string;

  email_verified?:
    boolean;
};


type GoogleCalendarList = {
  items?:
    GoogleCalendar[];
};


type GoogleCalendar = {
  id:
    string;

  summary?:
    string;

  primary?:
    boolean;

  timeZone?:
    string;

  accessRole?:
    string;
};


// ============================================================
// HELPERS
// ============================================================

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


function successPage(
  calendarName:
    string
) {
  const safeName =
    calendarName
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      );

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  />
  <title>A2 Calendar</title>

  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #F3F1EC;
      color: #262520;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
    }

    .shell {
      width: min(520px, 100%);
      text-align: center;
    }

    .mark {
      margin-bottom: 56px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 6px;
    }

    .orb {
      width: 110px;
      height: 110px;
      margin: 0 auto 38px;
      border-radius: 999px;

      background:
        radial-gradient(
          circle at 38% 35%,
          rgba(75,75,71,.52),
          rgba(28,28,27,.86) 48%,
          rgba(12,12,12,.96)
        );

      box-shadow:
        0 30px 80px
        rgba(20,20,18,.11);
    }

    .label {
      margin-bottom: 12px;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 2.4px;
      color: rgba(38,37,32,.35);
    }

    h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 400;
      letter-spacing: -.7px;
    }

    p {
      margin: 14px auto 0;
      max-width: 380px;
      font-size: 14px;
      line-height: 1.7;
      color: rgba(38,37,32,.52);
    }

    .calendar {
      margin-top: 26px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(38,37,32,.46);
    }

    button {
      margin-top: 42px;
      border: 0;
      border-radius: 999px;
      padding: 13px 22px;

      background: #262520;
      color: #F3F1EC;

      font-size: 9px;
      font-weight: 600;
      letter-spacing: 1.5px;

      cursor: pointer;
    }
  </style>
</head>

<body>
  <main class="shell">
    <div class="mark">A2</div>

    <div class="orb"></div>

    <div class="label">
      CALENDAR CONNECTED
    </div>

    <h1>
      You're connected.
    </h1>

    <p>
      A2 can now securely access your primary
      calendar. You can return to A2.
    </p>

    <div class="calendar">
      ${safeName}
    </div>

    <button
      onclick="window.close()"
    >
      RETURN TO A2
    </button>
  </main>

  <script>
    if (window.opener) {
      setTimeout(
        () => window.close(),
        1800
      );
    }
  </script>
</body>
</html>`,
    {
      headers: {
        'Content-Type':
          'text/html; charset=utf-8',
      },
    }
  );
}


function errorPage(
  message:
    string
) {
  return new Response(
    `<!doctype html>
<html>
<body style="
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  background:#F3F1EC;
  color:#262520;
  font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;
">
  <div style="
    max-width:500px;
    padding:32px;
    text-align:center;
  ">
    <div style="
      font-size:12px;
      font-weight:600;
      letter-spacing:6px;
      margin-bottom:46px;
    ">
      A2
    </div>

    <div style="
      font-size:8px;
      font-weight:600;
      letter-spacing:2px;
      opacity:.4;
      margin-bottom:12px;
    ">
      CALENDAR CONNECTION
    </div>

    <div style="
      font-size:24px;
      margin-bottom:12px;
    ">
      Connection incomplete.
    </div>

    <div style="
      font-size:14px;
      line-height:1.7;
      opacity:.55;
    ">
      ${message}
    </div>
  </div>
</body>
</html>`,
    {
      status:
        400,

      headers: {
        'Content-Type':
          'text/html; charset=utf-8',
      },
    }
  );
}


// ============================================================
// MAIN
// ============================================================

export default {
  fetch: withSupabase(
    {
      auth:
        'none',
    },

    async (
      req,
      ctx
    ) => {
      try {
        const url =
          new URL(
            req.url
          );

        const googleError =
          url.searchParams
            .get(
              'error'
            );

        if (
          googleError
        ) {
          return errorPage(
            'Google authorization was cancelled or denied.'
          );
        }

        const code =
          url.searchParams
            .get(
              'code'
            );

        const state =
          url.searchParams
            .get(
              'state'
            );

        if (
          !code ||
          !state
        ) {
          return errorPage(
            'The Google authorization response was incomplete.'
          );
        }

        const stateHash =
          await sha256Hex(
            state
          );

        const {
          data:
            stateRow,

          error:
            stateError,
        } =
          await ctx
            .supabaseAdmin
            .from(
              'calendar_oauth_states'
            )
            .select(`
              state_hash,
              user_id,
              provider,
              expires_at
            `)
            .eq(
              'state_hash',
              stateHash
            )
            .eq(
              'provider',
              'google'
            )
            .maybeSingle();

        if (
          stateError
        ) {
          throw stateError;
        }

        if (
          !stateRow
        ) {
          return errorPage(
            'This Calendar connection request is no longer valid.'
          );
        }

        // State is single-use.
        await ctx
          .supabaseAdmin
          .from(
            'calendar_oauth_states'
          )
          .delete()
          .eq(
            'state_hash',
            stateHash
          );

        if (
          new Date(
            stateRow
              .expires_at
          )
            .getTime() <
          Date.now()
        ) {
          return errorPage(
            'This Calendar connection request expired. Please begin again from A2.'
          );
        }

        const clientId =
          Deno.env.get(
            'A2_GOOGLE_CALENDAR_CLIENT_ID'
          );

        const clientSecret =
          Deno.env.get(
            'A2_GOOGLE_CALENDAR_CLIENT_SECRET'
          );

        const redirectUri =
          Deno.env.get(
            'A2_GOOGLE_CALENDAR_REDIRECT_URI'
          );

        if (
          !clientId ||
          !clientSecret ||
          !redirectUri
        ) {
          throw new Error(
            'Google OAuth secrets are unavailable.'
          );
        }

        // ------------------------------------------------------
        // EXCHANGE AUTHORIZATION CODE
        // ------------------------------------------------------

        const tokenResponse =
          await fetch(
            'https://oauth2.googleapis.com/token',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded',
              },

              body:
                new URLSearchParams({
                  client_id:
                    clientId,

                  client_secret:
                    clientSecret,

                  code,

                  grant_type:
                    'authorization_code',

                  redirect_uri:
                    redirectUri,
                }),
            }
          );

        if (
          !tokenResponse.ok
        ) {
          const body =
            await tokenResponse
              .text();

          console.error(
            'Google token exchange failed:',
            body
          );

          return errorPage(
            'Google did not complete the secure token exchange.'
          );
        }

        const tokens =
          (
            await tokenResponse
              .json()
          ) as GoogleTokenResponse;

        if (
          !tokens
            .access_token
        ) {
          return errorPage(
            'Google did not return an access token.'
          );
        }

        // ------------------------------------------------------
        // GOOGLE IDENTITY
        // ------------------------------------------------------

        const userInfoResponse =
          await fetch(
            'https://openidconnect.googleapis.com/v1/userinfo',
            {
              headers: {
                Authorization:
                  `Bearer ${tokens.access_token}`,
              },
            }
          );

        if (
          !userInfoResponse.ok
        ) {
          throw new Error(
            'Google user information could not be read.'
          );
        }

        const googleUser =
          (
            await userInfoResponse
              .json()
          ) as GoogleUserInfo;

        // ------------------------------------------------------
        // FIND PRIMARY CALENDAR
        // ------------------------------------------------------

        const calendarResponse =
          await fetch(
            'https://www.googleapis.com/calendar/v3/users/me/calendarList?showHidden=false',
            {
              headers: {
                Authorization:
                  `Bearer ${tokens.access_token}`,
              },
            }
          );

        if (
          !calendarResponse.ok
        ) {
          const body =
            await calendarResponse
              .text();

          console.error(
            'Google Calendar list error:',
            body
          );

          return errorPage(
            'A2 received Google authorization but could not read your Calendar list.'
          );
        }

        const calendarList =
          (
            await calendarResponse
              .json()
          ) as GoogleCalendarList;

        const primaryCalendar =
          calendarList
            .items
            ?.find(
              (
                calendar
              ) =>
                calendar.primary ===
                true
            );

        if (
          !primaryCalendar
        ) {
          return errorPage(
            'A2 could not identify a primary Google Calendar.'
          );
        }

        const userId =
          stateRow
            .user_id;

        // ------------------------------------------------------
        // FIND OR CREATE A2 CONNECTION
        // ------------------------------------------------------

        const {
          data:
            existingConnection,

          error:
            existingError,
        } =
          await ctx
            .supabaseAdmin
            .from(
              'calendar_connections'
            )
            .select(
              'id'
            )
            .eq(
              'user_id',
              userId
            )
            .eq(
              'provider',
              'google'
            )
            .eq(
              'provider_account_id',
              googleUser.sub
            )
            .maybeSingle();

        if (
          existingError
        ) {
          throw existingError;
        }

        let connectionId:
          string;

        if (
          existingConnection
        ) {
          connectionId =
            existingConnection.id;

          const {
            error:
              updateError,
          } =
            await ctx
              .supabaseAdmin
              .from(
                'calendar_connections'
              )
              .update({
                provider_account_email:
                  googleUser
                    .email ??
                  null,

                calendar_id:
                  primaryCalendar.id,

                calendar_name:
                  primaryCalendar
                    .summary ??
                  'Calendar',

                is_primary:
                  true,

                is_active:
                  true,

                connection_status:
                  'connected',

                provider_metadata: {
                  timezone:
                    primaryCalendar
                      .timeZone ??
                    null,

                  access_role:
                    primaryCalendar
                      .accessRole ??
                    null,
                },
              })
              .eq(
                'id',
                connectionId
              );

          if (
            updateError
          ) {
            throw updateError;
          }
        } else {
          // Single-calendar mode:
          // deactivate any older primary connection.
          await ctx
            .supabaseAdmin
            .from(
              'calendar_connections'
            )
            .update({
              is_primary:
                false,
            })
            .eq(
              'user_id',
              userId
            );

          const {
            data:
              newConnection,

            error:
              insertError,
          } =
            await ctx
              .supabaseAdmin
              .from(
                'calendar_connections'
              )
              .insert({
                user_id:
                  userId,

                provider:
                  'google',

                provider_account_id:
                  googleUser.sub,

                provider_account_email:
                  googleUser
                    .email ??
                  null,

                calendar_id:
                  primaryCalendar.id,

                calendar_name:
                  primaryCalendar
                    .summary ??
                  'Calendar',

                is_primary:
                  true,

                is_active:
                  true,

                connection_status:
                  'connected',

                provider_metadata: {
                  timezone:
                    primaryCalendar
                      .timeZone ??
                    null,

                  access_role:
                    primaryCalendar
                      .accessRole ??
                    null,
                },
              })
              .select(
                'id'
              )
              .single();

          if (
            insertError ||
            !newConnection
          ) {
            throw (
              insertError ??
              new Error(
                'Calendar connection could not be created.'
              )
            );
          }

          connectionId =
            newConnection.id;
        }

        // ------------------------------------------------------
        // STORE REFRESH TOKEN
        // ------------------------------------------------------

        const existingCredential =
          await ctx
            .supabaseAdmin
            .from(
              'calendar_credentials'
            )
            .select(
              'refresh_token'
            )
            .eq(
              'connection_id',
              connectionId
            )
            .maybeSingle();

        const refreshToken =
          tokens
            .refresh_token ??
          existingCredential
            .data
            ?.refresh_token ??
          null;

        if (
          !refreshToken
        ) {
          return errorPage(
            'Google connected, but A2 did not receive offline access. Reconnect and approve Calendar access again.'
          );
        }

        const grantedScopes =
          tokens.scope
            ? tokens.scope
                .split(
                  ' '
                )
                .filter(
                  Boolean
                )
            : [];

        const {
          error:
            credentialError,
        } =
          await ctx
            .supabaseAdmin
            .from(
              'calendar_credentials'
            )
            .upsert(
              {
                connection_id:
                  connectionId,

                refresh_token:
                  refreshToken,

                token_type:
                  tokens
                    .token_type ??
                  null,

                granted_scopes:
                  grantedScopes,
              },
              {
                onConflict:
                  'connection_id',
              }
            );

        if (
          credentialError
        ) {
          throw credentialError;
        }

        await ctx
          .supabaseAdmin
          .from(
            'calendar_sync_state'
          )
          .upsert(
            {
              connection_id:
                connectionId,

              last_error:
                null,
            },
            {
              onConflict:
                'connection_id',
            }
          );

        return successPage(
          primaryCalendar
            .summary ??
          'Google Calendar'
        );
      } catch (
        error
      ) {
        console.error(
          'A2 Google Calendar callback error:',
          error
        );

        return errorPage(
          'A2 could not finish connecting Google Calendar.'
        );
      }
    }
  ),
};