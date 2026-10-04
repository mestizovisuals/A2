import {
    Platform,
} from 'react-native';

import {
    useCallback,
    useEffect,
    useState,
} from 'react';

import {
    supabase,
} from '../lib/supabase';

type PushPermission =
  | 'default'
  | 'granted'
  | 'denied'
  | 'unsupported';

function urlBase64ToUint8Array(
  base64String: string
) {
  const padding =
    '='.repeat(
      (
        4 -
        (
          base64String.length %
          4
        )
      ) %
        4
    );

  const base64 =
    (
      base64String +
      padding
    )
      .replace(
        /-/g,
        '+'
      )
      .replace(
        /_/g,
        '/'
      );

  const browser =
    globalThis as any;

  const rawData =
    browser.atob(
      base64
    );

  return Uint8Array.from(
    rawData,
    (
      character:
        string
    ) =>
      character
        .charCodeAt(
          0
        )
  );
}

export function useA2Push() {
  const [
    supported,
    setSupported,
  ] =
    useState(false);

  const [
    subscribed,
    setSubscribed,
  ] =
    useState(false);

  const [
    permission,
    setPermission,
  ] =
    useState<PushPermission>(
      'default'
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const checkStatus =
    useCallback(
      async () => {
        if (
          Platform.OS !==
          'web'
        ) {
          setSupported(
            false
          );

          setPermission(
            'unsupported'
          );

          return;
        }

        const browser =
          globalThis as any;

        const hasSupport =
          Boolean(
            browser
              ?.navigator
              ?.serviceWorker
          ) &&
          Boolean(
            browser
              ?.PushManager
          ) &&
          Boolean(
            browser
              ?.Notification
          );

        setSupported(
          hasSupport
        );

        if (
          !hasSupport
        ) {
          setPermission(
            'unsupported'
          );

          return;
        }

        setPermission(
          browser
            .Notification
            .permission as
            PushPermission
        );

        try {
          const registration =
            await browser
              .navigator
              .serviceWorker
              .register(
                '/a2-sw.js'
              );

          const existing =
            await registration
              .pushManager
              .getSubscription();

          setSubscribed(
            Boolean(
              existing
            )
          );
        } catch (
          error
        ) {
          console.warn(
            'A2 push status error:',
            error
          );
        }
      },
      []
    );

  useEffect(() => {
    void checkStatus();
  }, [
    checkStatus,
  ]);

  const enablePush =
    useCallback(
      async () => {
        setErrorMessage('');

        if (
          Platform.OS !==
          'web'
        ) {
          setErrorMessage(
            'Web Push is only available in the web version of A2.'
          );

          return false;
        }

        const browser =
          globalThis as any;

        if (
          !supported
        ) {
          setErrorMessage(
            'This browser does not support Web Push.'
          );

          return false;
        }

        const publicKey =
          process.env
            .EXPO_PUBLIC_A2_VAPID_PUBLIC_KEY;

        if (
          !publicKey
        ) {
          setErrorMessage(
            'A2 Push is missing its public VAPID key.'
          );

          return false;
        }

        setLoading(
          true
        );

        try {
          const permissionResult =
            await browser
              .Notification
              .requestPermission();

          setPermission(
            permissionResult
          );

          if (
            permissionResult !==
            'granted'
          ) {
            setErrorMessage(
              'Notification permission was not granted.'
            );

            return false;
          }

          const registration =
            await browser
              .navigator
              .serviceWorker
              .register(
                '/a2-sw.js'
              );

          await browser
            .navigator
            .serviceWorker
            .ready;

          let subscription =
            await registration
              .pushManager
              .getSubscription();

          if (
            !subscription
          ) {
            subscription =
              await registration
                .pushManager
                .subscribe({
                  userVisibleOnly:
                    true,

                  applicationServerKey:
                    urlBase64ToUint8Array(
                      publicKey
                    ),
                });
          }

          const json =
            subscription
              .toJSON();

          const endpoint =
            json.endpoint;

          const p256dh =
            json.keys
              ?.p256dh;

          const auth =
            json.keys
              ?.auth;

          if (
            !endpoint ||
            !p256dh ||
            !auth
          ) {
            throw new Error(
              'Browser returned an incomplete Push subscription.'
            );
          }

          const {
            data:
              sessionData,

            error:
              sessionError,
          } =
            await supabase
              .auth
              .getSession();

          if (
            sessionError
          ) {
            throw sessionError;
          }

          const userId =
            sessionData
              .session
              ?.user
              ?.id;

          if (
            !userId
          ) {
            throw new Error(
              'A2 user session is unavailable.'
            );
          }

          const {
            error:
              subscriptionError,
          } =
            await supabase
              .from(
                'push_subscriptions'
              )
              .upsert(
                {
                  user_id:
                    userId,

                  endpoint,

                  p256dh,

                  auth,

                  platform:
                    'web',

                  user_agent:
                    browser
                      .navigator
                      .userAgent ??
                    null,

                  is_active:
                    true,

                  last_seen_at:
                    new Date()
                      .toISOString(),
                },
                {
                  onConflict:
                    'endpoint',
                }
              );

          if (
            subscriptionError
          ) {
            throw subscriptionError;
          }

          const {
            error:
              preferenceError,
          } =
            await supabase
              .from(
                'notification_preferences'
              )
              .upsert(
                {
                  user_id:
                    userId,

                  push_enabled:
                    true,
                },
                {
                  onConflict:
                    'user_id',
                }
              );

          if (
            preferenceError
          ) {
            console.warn(
              'A2 push preference update error:',
              preferenceError
            );
          }

          setSubscribed(
            true
          );

          return true;
        } catch (
          error
        ) {
          console.warn(
            'A2 enable push error:',
            error
          );

          setErrorMessage(
            error instanceof
              Error
              ? error.message
              : 'A2 could not enable Push notifications.'
          );

          return false;
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        supported,
      ]
    );

  const disablePush =
    useCallback(
      async () => {
        setErrorMessage('');

        if (
          Platform.OS !==
          'web'
        ) {
          return false;
        }

        const browser =
          globalThis as any;

        setLoading(
          true
        );

        try {
          const registration =
            await browser
              .navigator
              .serviceWorker
              .getRegistration(
                '/a2-sw.js'
              );

          const subscription =
            await registration
              ?.pushManager
              ?.getSubscription();

          const endpoint =
            subscription
              ?.endpoint ??
            null;

          if (
            subscription
          ) {
            await subscription
              .unsubscribe();
          }

          if (
            endpoint
          ) {
            const {
              error,
            } =
              await supabase
                .from(
                  'push_subscriptions'
                )
                .update({
                  is_active:
                    false,
                })
                .eq(
                  'endpoint',
                  endpoint
                );

            if (
              error
            ) {
              throw error;
            }
          }

          const {
            data:
              sessionData,
          } =
            await supabase
              .auth
              .getSession();

          const userId =
            sessionData
              .session
              ?.user
              ?.id;

          if (
            userId
          ) {
            await supabase
              .from(
                'notification_preferences'
              )
              .update({
                push_enabled:
                  false,
              })
              .eq(
                'user_id',
                userId
              );
          }

          setSubscribed(
            false
          );

          return true;
        } catch (
          error
        ) {
          console.warn(
            'A2 disable push error:',
            error
          );

          setErrorMessage(
            'A2 could not disable Push notifications.'
          );

          return false;
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  return {
    supported,
    subscribed,
    permission,
    loading,
    errorMessage,
    enablePush,
    disablePush,
    refresh:
      checkStatus,
  };
}