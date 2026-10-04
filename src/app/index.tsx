import type { Session } from '@supabase/supabase-js';
import {
  useFocusEffect,
  useRouter,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import AuthScreen from '../components/AuthScreen';
import { supabase } from '../lib/supabase';

import {
  useA2Voice,
} from '../hooks/useA2Voice';

import {
  useA2LiveVoice,
} from '../hooks/useA2LiveVoice';

type HomeTask = {
  id: string;
  title: string;
  status:
    | 'open'
    | 'in_progress'
    | 'completed'
    | 'cancelled';
  priority: number;
  due_at: string | null;
  project_id: string | null;
};

type HomeProject = {
  id: string;
  name: string;
  next_step: string | null;
  status: string;
  priority: number;
  last_activity_at: string;
};

type DailyIntelligence = {
  openTaskCount: number;
  overdueCount: number;
  dueTodayCount: number;
  activeProjectCount: number;

  priorityTask:
    HomeTask | null;

  priorityProject:
    HomeProject | null;
};

const EMPTY_DAILY_INTELLIGENCE:
  DailyIntelligence = {
  openTaskCount: 0,
  overdueCount: 0,
  dueTodayCount: 0,
  activeProjectCount: 0,

  priorityTask: null,
  priorityProject: null,
};

export default function HomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  // ------------------------------------------------------------
  // AUTHENTICATION
  // ------------------------------------------------------------

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ------------------------------------------------------------
  // A2 INTERFACE STATE
  // ------------------------------------------------------------

  const [draft, setDraft] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [thinking, setThinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [
  dailyIntelligence,
  setDailyIntelligence,
] =
  useState<DailyIntelligence>(
    EMPTY_DAILY_INTELLIGENCE
  );

const [
  dailyLoading,
  setDailyLoading,
] =
  useState(true);
  const [
  homeBrief,
  setHomeBrief,
] =
  useState('');

const [
  homeBriefLoading,
  setHomeBriefLoading,
] =
  useState(false);

const homeBriefSignatureRef =
  useRef<string | null>(
    null
  );

const homeBriefRequestRef =
  useRef(false);

  // ------------------------------------------------------------
  // A2 ANIMATION VALUES
  // ------------------------------------------------------------

  const drift = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  // ------------------------------------------------------------
  // RESTORE / WATCH SUPABASE SESSION
  // ------------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) {
        return;
      }

      if (error) {
        console.error('A2 session restore error:', error);
      }

      setSession(data.session);
      setAuthLoading(false);
    });

const {
  data: { subscription },
} = supabase.auth.onAuthStateChange(
  (_event, nextSession) => {
    setSession(
      nextSession
    );

    setAuthLoading(
      false
    );

    // Clear private Home intelligence
    // whenever the authenticated session ends.
    if (
      !nextSession
    ) {
      setHomeBrief('');

      setDailyIntelligence(
        EMPTY_DAILY_INTELLIGENCE
      );

      homeBriefSignatureRef.current =
        null;

      homeBriefRequestRef.current =
        false;
    }
  }
);

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------------------------
  // A2 CORE ANIMATION
  // ------------------------------------------------------------

  useEffect(() => {
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),

        Animated.timing(drift, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),

        Animated.timing(breathe, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );

    driftLoop.start();
    breatheLoop.start();

    return () => {
      driftLoop.stop();
      breatheLoop.stop();
    };
  }, [breathe, drift]);

  // ------------------------------------------------------------
  // GREETING
  // ------------------------------------------------------------

  const greeting = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) {
      return 'Good morning';
    }

    if (hour < 18) {
      return 'Good afternoon';
    }

    return 'Good evening';
  }, []);

// ------------------------------------------------------------
// DAILY INTELLIGENCE
// ------------------------------------------------------------

const loadDailyIntelligence =
  useCallback(
    async () => {
      const userId =
        session?.user?.id;

      if (!userId) {
        setDailyIntelligence(
          EMPTY_DAILY_INTELLIGENCE
        );

        setDailyLoading(false);

        return;
      }

      setDailyLoading(true);

      try {
        const [
          taskResult,
          projectResult,
        ] =
          await Promise.all([
            supabase
              .from('tasks')
              .select(`
                id,
                title,
                status,
                priority,
                due_at,
                project_id
              `)
              .eq(
                'user_id',
                userId
              )
              .neq(
                'status',
                'completed'
              )
              .neq(
                'status',
                'cancelled'
              )
              .order(
                'priority',
                {
                  ascending:
                    false,
                }
              )
              .limit(100),

            supabase
              .from('projects')
              .select(`
                id,
                name,
                next_step,
                status,
                priority,
                last_activity_at
              `)
              .eq(
                'user_id',
                userId
              )
              .eq(
                'status',
                'active'
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
              )
              .limit(50),
          ]);

        if (
          taskResult.error
        ) {
          throw taskResult.error;
        }

        if (
          projectResult.error
        ) {
          throw projectResult.error;
        }

        const tasks =
          (
            taskResult.data ??
            []
          ) as HomeTask[];

        const projects =
          (
            projectResult.data ??
            []
          ) as HomeProject[];

        // ------------------------------------------------------
        // LOCAL TODAY WINDOW
        // ------------------------------------------------------

        const now =
          new Date();

        const startToday =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );

        const startTomorrow =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1
          );

        const startTodayTime =
          startToday.getTime();

        const startTomorrowTime =
          startTomorrow.getTime();

        // ------------------------------------------------------
        // TASK CLASSIFICATION
        // ------------------------------------------------------

        const overdueTasks =
          tasks.filter(
            (task) => {
              if (
                !task.due_at
              ) {
                return false;
              }

              const dueTime =
                new Date(
                  task.due_at
                ).getTime();

              return (
                Number.isFinite(
                  dueTime
                ) &&
                dueTime <
                  startTodayTime
              );
            }
          );

        const dueTodayTasks =
          tasks.filter(
            (task) => {
              if (
                !task.due_at
              ) {
                return false;
              }

              const dueTime =
                new Date(
                  task.due_at
                ).getTime();

              return (
                Number.isFinite(
                  dueTime
                ) &&
                dueTime >=
                  startTodayTime &&
                dueTime <
                  startTomorrowTime
              );
            }
          );

        // ------------------------------------------------------
        // CHOOSE MOST RELEVANT TASK
        //
        // Order:
        // 1. overdue
        // 2. due today
        // 3. upcoming due
        // 4. no due date
        //
        // Then priority 5 → 1.
        // ------------------------------------------------------

        function taskBucket(
          task: HomeTask
        ) {
          if (
            !task.due_at
          ) {
            return 3;
          }

          const dueTime =
            new Date(
              task.due_at
            ).getTime();

          if (
            !Number.isFinite(
              dueTime
            )
          ) {
            return 3;
          }

          if (
            dueTime <
            startTodayTime
          ) {
            return 0;
          }

          if (
            dueTime <
            startTomorrowTime
          ) {
            return 1;
          }

          return 2;
        }

        const rankedTasks =
          [...tasks].sort(
            (
              first,
              second
            ) => {
              const bucketDifference =
                taskBucket(
                  first
                ) -
                taskBucket(
                  second
                );

              if (
                bucketDifference !==
                0
              ) {
                return bucketDifference;
              }

              const priorityDifference =
                second.priority -
                first.priority;

              if (
                priorityDifference !==
                0
              ) {
                return priorityDifference;
              }

              const firstDue =
                first.due_at
                  ? new Date(
                      first.due_at
                    ).getTime()
                  : Number
                      .POSITIVE_INFINITY;

              const secondDue =
                second.due_at
                  ? new Date(
                      second.due_at
                    ).getTime()
                  : Number
                      .POSITIVE_INFINITY;

              return (
                firstDue -
                secondDue
              );
            }
          );

        setDailyIntelligence({
          openTaskCount:
            tasks.length,

          overdueCount:
            overdueTasks.length,

          dueTodayCount:
            dueTodayTasks.length,

          activeProjectCount:
            projects.length,

          priorityTask:
            rankedTasks[0] ??
            null,

          // Projects were already sorted by
          // priority and recent activity.
          priorityProject:
            projects[0] ??
            null,
        });
      } catch (error) {
        console.warn(
          'A2 home intelligence load error:',
          error
        );

        // Home intelligence should never
        // break the main A2 experience.
        setDailyIntelligence(
          EMPTY_DAILY_INTELLIGENCE
        );
      } finally {
        setDailyLoading(false);
      }
    },
    [
      session?.user?.id,
    ]
  );
// ------------------------------------------------------------
// A2 HOME BRIEF
// ------------------------------------------------------------

const loadHomeBrief =
  useCallback(
    async () => {
      const userId =
        session?.user?.id;

      if (
        !userId ||
        homeBriefRequestRef.current
      ) {
        return;
      }

      homeBriefRequestRef.current =
        true;

      setHomeBriefLoading(
        true
      );

      try {
        const timezone =
          Intl
            .DateTimeFormat()
            .resolvedOptions()
            .timeZone ||
          'UTC';

        const {
          data,
          error,
        } =
          await supabase
            .functions
            .invoke(
              'a2-home-brief',
              {
                body: {
                  client_now:
                    new Date()
                      .toISOString(),

                  client_timezone:
                    timezone,

                  previous_signature:
                    homeBriefSignatureRef
                      .current,
                },
              }
            );

        if (
          error
        ) {
          console.warn(
            'A2 Home brief invoke error:',
            error
          );

          return;
        }

        if (
          typeof data
            ?.signature ===
            'string'
        ) {
          homeBriefSignatureRef.current =
            data.signature;
        }

        // Nothing changed since the last brief.
        // Keep the current sentence exactly as-is.
        if (
          data?.unchanged ===
          true
        ) {
          return;
        }

        const brief =
          typeof data?.brief ===
            'string'
            ? data.brief
                .replace(
                  /\s+/g,
                  ' '
                )
                .trim()
            : '';

        if (
          brief
        ) {
          setHomeBrief(
            brief
          );
        }
      } catch (
        error
      ) {
        console.warn(
          'A2 Home brief error:',
          error
        );
      } finally {
        homeBriefRequestRef.current =
          false;

        setHomeBriefLoading(
          false
        );
      }
    },
    [
      session?.user?.id,
    ]
  );
// Refresh whenever Home becomes active again.
useFocusEffect(
  useCallback(
    () => {
      void loadDailyIntelligence();

      void loadHomeBrief();
    },
    [
      loadDailyIntelligence,
      loadHomeBrief,
    ]
  )
);

  // ------------------------------------------------------------
  // RESPONSIVE SIZE CALCULATIONS
  // ------------------------------------------------------------

  const orbSize = Math.min(
    Math.max(width * 0.38, 165),
    300
  );

  const gridSize = Math.min(
    Math.max(width * 1.05, 600),
    1100
  );

  // ------------------------------------------------------------
  // ANIMATION INTERPOLATION
  // ------------------------------------------------------------

  const layerOneTranslateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-7, 9],
  });

  const layerOneTranslateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [5, -8],
  });

  const layerTwoTranslateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [10, -10],
  });

  const layerTwoTranslateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 7],
  });

  const layerOneScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.07],
  });

  const layerTwoScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1.06, 0.93],
  });

  const layerThreeScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.05],
  });

  // ------------------------------------------------------------
  // SEND AUTHENTICATED MESSAGE TO A2 BACKEND
  // ------------------------------------------------------------

  async function submitPrompt(
    explicitMessage?: string
  ) {
    const message = (
      explicitMessage ??
      draft
    ).trim();

    if (!message || thinking) {
      return;
    }

    setLastPrompt(message);
    setDraft('');
    setReply('');
    setErrorMessage('');
    setThinking(true);

    try {
      const clientNow =
        new Date().toString();

      const clientTimezone =
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone || 'UTC';

      const { data, error } =
        await supabase.functions.invoke(
          'a2-chat',
          {
            body: {
              message,
              client_now: clientNow,
              client_timezone:
                clientTimezone,
            },
          }
        );

      if (error) {
        console.error(
          'A2 function invocation error:',
          error
        );

        throw new Error(
          'A2 could not complete the request.'
        );
      }

      if (!data?.reply) {
        throw new Error(
          'A2 returned an empty response.'
        );
      }

      setReply(
  data.reply
);

// A2 may have changed a task or project.
void loadDailyIntelligence();

void loadHomeBrief();
    } catch (error) {
      console.error(
        'A2 request error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not reach the server.'
      );
    } finally {
      setThinking(false);
    }
  }

  // ------------------------------------------------------------
  // VOICE INPUT
  // ------------------------------------------------------------

  const {
    recording: listening,
    transcribing:
      voiceTranscribing,
    toggleRecording,
  } = useA2Voice({
    onTranscript:
      async (text) => {
        setErrorMessage('');

        setDraft(text);

        await submitPrompt(
          text
        );
      },

    onError:
      (message) => {
        setErrorMessage(
          message
        );
      },
  });
    // ------------------------------------------------------------
  // LIVE REALTIME VOICE
  // ------------------------------------------------------------

  const {
    connected:
      liveVoiceConnected,

    status:
      liveVoiceStatus,

    connect:
      connectLiveVoice,

    disconnect:
      disconnectLiveVoice,
  } = useA2LiveVoice({
    onAssistantTranscript:
      (text) => {
        setErrorMessage('');

        setReply(text);
      },

    onError:
      (message) => {
        setErrorMessage(
          message
        );
      },
  });
// Refresh Home after a completed
// Live Voice response.
// This also captures Live task/project changes.

useEffect(() => {
  if (
    liveVoiceConnected &&
    liveVoiceStatus ===
      'ready'
  ) {
    void loadDailyIntelligence();

    void loadHomeBrief();
  }
}, [
  liveVoiceConnected,
  liveVoiceStatus,
  loadDailyIntelligence,
  loadHomeBrief,
]);
    // ------------------------------------------------------------
  // ORB VOICE CONTROLS
  // ------------------------------------------------------------

  const orbVoiceActive =
    listening ||
    liveVoiceConnected ||
    liveVoiceStatus ===
      'connecting';

      // ------------------------------------------------------------
// HOME INTELLIGENCE DISPLAY
// ------------------------------------------------------------

const todayHeadline =
  dailyLoading
    ? 'SYNCING'
    : dailyIntelligence
          .overdueCount >
        0
      ? `${dailyIntelligence.overdueCount} OVERDUE · ${dailyIntelligence.dueTodayCount} TODAY`
      : dailyIntelligence
            .dueTodayCount >
          0
        ? `${dailyIntelligence.dueTodayCount} DUE TODAY`
        : dailyIntelligence
              .openTaskCount >
            0
          ? `${dailyIntelligence.openTaskCount} OPEN`
          : 'CLEAR';

const todayDetail =
  dailyLoading
    ? 'Checking priorities…'
    : dailyIntelligence
          .priorityTask
        ?.title ??
      'Nothing pressing';

const projectsHeadline =
  dailyLoading
    ? 'SYNCING'
    : dailyIntelligence
          .activeProjectCount >
        0
      ? `${dailyIntelligence.activeProjectCount} ACTIVE`
      : 'NO ACTIVE PROJECTS';

const projectsDetail =
  dailyLoading
    ? 'Checking projects…'
    : dailyIntelligence
          .priorityProject
      ? dailyIntelligence
          .priorityProject
          .next_step
        ? `${dailyIntelligence.priorityProject.name} · ${dailyIntelligence.priorityProject.next_step}`
        : `${dailyIntelligence.priorityProject.name} · Next step not set`
      : 'No project needs attention';

  async function handleOrbPress() {
    // If Live A2 is running,
    // one tap ends the live session.
    if (
      liveVoiceConnected
    ) {
      disconnectLiveVoice();
      return;
    }

    // Do not trigger quick voice
    // while Live is still connecting.
    if (
      liveVoiceStatus ===
      'connecting'
    ) {
      return;
    }

    await toggleRecording();
  }

  async function handleOrbLongPress() {
    // Ignore long presses if
    // another voice operation is active.
    if (
      listening ||
      voiceTranscribing ||
      thinking ||
      liveVoiceConnected ||
      liveVoiceStatus ===
        'connecting'
    ) {
      return;
    }

    setErrorMessage('');
    setReply('');
    setDraft('');

    await connectLiveVoice();
  }
  // ------------------------------------------------------------
  // AUTH LOADING SCREEN
  // ------------------------------------------------------------

  if (authLoading) {
    return (
      <View style={styles.authLoadingScreen}>
        <StatusBar style="dark" />
      </View>
    );
  }

  // ------------------------------------------------------------
  // PRIVATE AUTH SCREEN
  // ------------------------------------------------------------

  if (!session) {
    return <AuthScreen />;
  }

  // ------------------------------------------------------------
  // MAIN A2 INTERFACE
  // ------------------------------------------------------------

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {/* ------------------------------------------------------ */}
      {/* FAINT LATITUDE / LONGITUDE BACKGROUND                 */}
      {/* ------------------------------------------------------ */}

      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <View
          style={[
            styles.globeGrid,
            {
              width: gridSize,
              height: gridSize,
              left: width / 2 - gridSize / 2,
              top: height / 2 - gridSize / 2,
            },
          ]}
        >
          <View style={styles.outerGlobe} />

          <View
            style={[
              styles.longitude,
              {
                transform: [{ scaleX: 0.28 }],
              },
            ]}
          />

          <View
            style={[
              styles.longitude,
              {
                transform: [{ scaleX: 0.52 }],
              },
            ]}
          />

          <View
            style={[
              styles.longitude,
              {
                transform: [{ scaleX: 0.76 }],
              },
            ]}
          />

          <View
            style={[
              styles.latitude,
              { top: '22%' },
            ]}
          />

          <View
            style={[
              styles.latitude,
              { top: '36%' },
            ]}
          />

          <View
            style={[
              styles.latitude,
              { top: '50%' },
            ]}
          />

          <View
            style={[
              styles.latitude,
              { top: '64%' },
            ]}
          />

          <View
            style={[
              styles.latitude,
              { top: '78%' },
            ]}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.interface}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        {/* ---------------------------------------------------- */}
        {/* HEADER                                               */}
        {/* ---------------------------------------------------- */}

        <View style={styles.header}>
  <Pressable
    onPress={() => router.push('/memory')}
    style={styles.brandButton}
    accessibilityRole="button"
    accessibilityLabel="Open A2 Memory and Identity"
  >
    <Text style={styles.brand}>A2</Text>
  </Pressable>
</View>

        {/* ---------------------------------------------------- */}
        {/* CENTER EXPERIENCE                                   */}
        {/* ---------------------------------------------------- */}

        <View style={styles.center}>
          <Text style={styles.greeting}>
            {greeting}, Tony.
          </Text>

<Pressable
  onPress={
    handleOrbPress
  }

  onLongPress={
    handleOrbLongPress
  }

  delayLongPress={
    650
  }

  disabled={
    voiceTranscribing ||
    (
      thinking &&
      !liveVoiceConnected
    )
  }

  style={
    styles.orbButton
  }
>
            <View
              style={[
                styles.orbFrame,
                {
                  width: orbSize,
                  height: orbSize,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.blobLarge,
                  {
                    transform: [
                      {
                        translateX:
                          layerOneTranslateX,
                      },
                      {
                        translateY:
                          layerOneTranslateY,
                      },
                      {
                        scale: layerOneScale,
                      },
                      {
                        rotate: '-9deg',
                      },
                    ],
                  },
                ]}
              />

              <Animated.View
                style={[
                  styles.blobMedium,
                  {
                    transform: [
                      {
                        translateX:
                          layerTwoTranslateX,
                      },
                      {
                        translateY:
                          layerTwoTranslateY,
                      },
                      {
                        scale: layerTwoScale,
                      },
                      {
                        rotate: '13deg',
                      },
                    ],
                  },
                ]}
              />

              <Animated.View
                style={[
                  styles.blobSmall,
                  {
                    transform: [
                      {
                        scale:
                          layerThreeScale,
                      },
                    ],
                  },
                ]}
              />

              <View
                style={[
                  styles.pixel,
                  styles.pixelOne,
orbVoiceActive &&
  styles.pixelListening
                ]}
              />

              <View
                style={[
                  styles.pixel,
                  styles.pixelTwo,
orbVoiceActive &&
  styles.pixelListening
                ]}
              />

              <View
                style={[
                  styles.pixel,
                  styles.pixelThree,
orbVoiceActive &&
  styles.pixelListening
                ]}
              />

              <View
                style={[
                  styles.pixelTiny,
                  styles.pixelFour,
orbVoiceActive &&
  styles.pixelListening
                ]}
              />

              <View
                style={[
                  styles.pixelTiny,
                  styles.pixelFive,
orbVoiceActive &&
  styles.pixelListening
                ]}
              />
            </View>
          </Pressable>

          {/* -------------------------------------------------- */}
          {/* A2 STATE                                          */}
          {/* -------------------------------------------------- */}

          <Text style={styles.mode}>
{liveVoiceStatus ===
  'connecting'
  ? 'Starting Live A2…'

  : liveVoiceStatus ===
      'listening'
    ? 'Live • Listening…'

  : liveVoiceStatus ===
      'thinking'
    ? 'Live • Thinking…'

  : liveVoiceStatus ===
      'speaking'
    ? 'Live • A2 speaking…'

  : liveVoiceConnected
    ? 'Live • Speak naturally'

  : thinking
    ? 'Thinking…'

  : voiceTranscribing
    ? 'Processing voice…'

  : listening
    ? 'Listening… tap to send'

  : 'Tap to speak • hold for live'}
          </Text>
          {liveVoiceConnected && (
  <Text
    style={
      styles.liveDisclosure
    }
  >
    LIVE VOICE • AI-GENERATED
  </Text>
)}

          {/* -------------------------------------------------- */}
          {/* RESPONSE AREA                                     */}
          {/* -------------------------------------------------- */}

          {thinking ? (
            <Text style={styles.question}>
              Working on it.
            </Text>
          ) : errorMessage ? (
            <Text style={styles.lastPrompt}>
              {errorMessage}
            </Text>
          ) : reply ? (
            <View style={styles.replyShell}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={
                  styles.replyContent
                }
              >
                <Text style={styles.replyText}>
                  {reply}
                </Text>
              </ScrollView>
            </View>
) : lastPrompt ? (
  <Text
    style={styles.lastPrompt}
    numberOfLines={2}
  >
    {lastPrompt}
  </Text>
) : homeBrief ? (
  <View
    style={
      styles.homeBriefShell
    }
  >
    <Text
      style={
        styles.homeBriefLabel
      }
    >
      A2 BRIEF
    </Text>

    <Text
      style={
        styles.homeBriefText
      }
    >
      {
        homeBrief
      }
    </Text>
  </View>
) : homeBriefLoading ? (
  <Text
    style={
      styles.homeBriefLoading
    }
  >
    Checking your day…
  </Text>
) : (
  <Text
    style={
      styles.question
    }
  >
    What do you need?
  </Text>
)}
        </View>

        {/* ---------------------------------------------------- */}
        {/* DAILY INTELLIGENCE                                   */}
        {/* ---------------------------------------------------- */}

        <View
          style={
            styles.intelligenceBar
          }
        >
          <Pressable
            onPress={() =>
              router.push(
                '/today'
              )
            }
            style={
              styles.intelligenceCard
            }
            accessibilityRole="button"
            accessibilityLabel="Open Today"
          >
            <View
              style={
                styles.intelligenceTop
              }
            >
              <Text
                style={
                  styles.intelligenceLabel
                }
              >
                TODAY
              </Text>

              <Text
                style={
                  styles.intelligenceArrow
                }
              >
                →
              </Text>
            </View>

            <Text
              style={
                styles.intelligenceHeadline
              }
              numberOfLines={1}
            >
              {
                todayHeadline
              }
            </Text>

            <Text
              style={
                styles.intelligenceDetail
              }
              numberOfLines={1}
            >
              {
                todayDetail
              }
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push(
                '/projects'
              )
            }
            style={
              styles.intelligenceCard
            }
            accessibilityRole="button"
            accessibilityLabel="Open Projects"
          >
            <View
              style={
                styles.intelligenceTop
              }
            >
              <Text
                style={
                  styles.intelligenceLabel
                }
              >
                PROJECTS
              </Text>

              <Text
                style={
                  styles.intelligenceArrow
                }
              >
                →
              </Text>
            </View>

            <Text
              style={
                styles.intelligenceHeadline
              }
              numberOfLines={1}
            >
              {
                projectsHeadline
              }
            </Text>

            <Text
              style={
                styles.intelligenceDetail
              }
              numberOfLines={1}
            >
              {
                projectsDetail
              }
            </Text>
          </Pressable>
        </View>

        {/* ---------------------------------------------------- */}
        {/* INPUT                                                */}
        {/* ---------------------------------------------------- */}

        <View style={styles.composerArea}>
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
onSubmitEditing={() =>
  submitPrompt()
}
              placeholder="Ask A2..."
              placeholderTextColor="rgba(28, 27, 24, 0.36)"
              style={styles.input}
              returnKeyType="send"
              autoCorrect
            />

            <Pressable
onPress={() =>
  submitPrompt()
}
              disabled={
                !draft.trim() || thinking
              }
              style={[
                styles.sendButton,

                (!draft.trim() ||
                  thinking) &&
                  styles.sendButtonDisabled,
              ]}
            >
              <Text style={styles.sendArrow}>
                ↑
              </Text>
            </Pressable>
          </View>

          <Text style={styles.alpha}>
            A2 • PRIVATE ALPHA
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  authLoadingScreen: {
    flex: 1,
    backgroundColor: '#F3F1EC',
  },

  screen: {
    flex: 1,
    backgroundColor: '#F3F1EC',
    overflow: 'hidden',
  },

  interface: {
    flex: 1,
  },

header: {
  height: 80,
  alignItems: 'center',
  justifyContent: 'center',
},

brandButton: {
  minWidth: 60,
  minHeight: 44,
  alignItems: 'center',
  justifyContent: 'center',
},

brand: {
  fontSize: 15,
  fontWeight: '600',
  letterSpacing: 5,
  color: '#22211E',
},

  globeGrid: {
    position: 'absolute',
    opacity: 1,
  },

  outerGlobe: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 10000,
    borderWidth: 1,
    borderColor:
      'rgba(38, 36, 32, 0.035)',
  },

  longitude: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 10000,
    borderWidth: 1,
    borderColor:
      'rgba(38, 36, 32, 0.034)',
  },

  latitude: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    height: 1,
    backgroundColor:
      'rgba(38, 36, 32, 0.028)',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: -35,
  },

  greeting: {
    color: '#262520',
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.2,
    marginBottom: 30,
  },

  orbButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  orbFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  blobLarge: {
    position: 'absolute',
    width: '68%',
    height: '68%',
    borderRadius: 1000,
    backgroundColor:
      'rgba(38, 38, 36, 0.72)',
  },

  blobMedium: {
    position: 'absolute',
    width: '58%',
    height: '72%',
    borderRadius: 1000,
    backgroundColor:
      'rgba(76, 76, 72, 0.28)',
  },

  blobSmall: {
    position: 'absolute',
    width: '46%',
    height: '49%',
    borderRadius: 1000,
    backgroundColor:
      'rgba(17, 17, 16, 0.32)',
  },

  pixel: {
    position: 'absolute',
    width: 8,
    height: 8,
    backgroundColor:
      'rgba(42, 42, 39, 0.42)',
  },

  pixelTiny: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor:
      'rgba(42, 42, 39, 0.34)',
  },

  pixelListening: {
    backgroundColor:
      'rgba(20, 20, 18, 0.7)',
  },

  pixelOne: {
    left: '17%',
    top: '30%',
  },

  pixelTwo: {
    right: '18%',
    top: '58%',
  },

  pixelThree: {
    right: '26%',
    top: '20%',
  },

  pixelFour: {
    left: '24%',
    bottom: '24%',
  },

  pixelFive: {
    right: '14%',
    top: '40%',
  },

  mode: {
    marginTop: 20,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    color:
      'rgba(36, 35, 32, 0.42)',
  },

  liveDisclosure: {
  marginTop: 8,

  fontSize: 8,

  letterSpacing: 1.4,

  color:
    'rgba(36, 35, 32, 0.28)',
},

  question: {
    marginTop: 25,
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.55,
    color: '#25241F',
  },

  replyShell: {
    width: '100%',
    maxWidth: 600,
    maxHeight: 230,
    marginTop: 25,
  },

  replyContent: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  replyText: {
    color: '#25241F',
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '400',
    letterSpacing: -0.25,
    textAlign: 'center',
  },

  homeBriefShell: {
  width: '100%',
  maxWidth: 620,

  alignItems: 'center',

  paddingHorizontal: 20,
},

homeBriefLabel: {
  marginBottom: 9,

  fontSize: 7,
  fontWeight: '600',

  letterSpacing: 2,

  color:
    'rgba(36, 35, 32, 0.28)',
},

homeBriefText: {
  maxWidth: 600,

  textAlign: 'center',

  fontSize: 17,
  lineHeight: 25,

  fontWeight: '400',

  letterSpacing: -0.2,

  color:
    'rgba(36, 35, 32, 0.82)',
},

homeBriefLoading: {
  textAlign: 'center',

  fontSize: 13,

  color:
    'rgba(36, 35, 32, 0.34)',
},

  lastPrompt: {
    maxWidth: 520,
    marginTop: 25,
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '400',
    letterSpacing: -0.4,
    color: '#25241F',
  },

  intelligenceBar: {
  width: '100%',
  maxWidth: 640,
  alignSelf: 'center',

  flexDirection: 'row',
  gap: 10,

  paddingHorizontal: 20,
  marginBottom: 12,
},

intelligenceCard: {
  flex: 1,
  minWidth: 0,
  minHeight: 72,

  paddingHorizontal: 14,
  paddingVertical: 11,

  borderRadius: 18,
  borderWidth: 1,

  borderColor:
    'rgba(35, 33, 29, 0.065)',

  backgroundColor:
    'rgba(255, 255, 255, 0.28)',
},

intelligenceTop: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent:
    'space-between',
},

intelligenceLabel: {
  fontSize: 7,
  fontWeight: '600',

  letterSpacing: 1.6,

  color:
    'rgba(36, 35, 32, 0.32)',
},

intelligenceArrow: {
  fontSize: 12,

  color:
    'rgba(36, 35, 32, 0.26)',
},

intelligenceHeadline: {
  marginTop: 7,

  fontSize: 10,
  fontWeight: '600',

  letterSpacing: 0.8,

  color:
    'rgba(36, 35, 32, 0.72)',
},

intelligenceDetail: {
  marginTop: 5,

  fontSize: 11,
  lineHeight: 15,

  color:
    'rgba(36, 35, 32, 0.43)',
},
  
  composerArea: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  composer: {
    width: '100%',
    maxWidth: 600,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor:
      'rgba(35, 33, 29, 0.09)',
    backgroundColor:
      'rgba(255, 255, 255, 0.42)',
    paddingLeft: 20,
    paddingRight: 8,
  },

  input: {
    flex: 1,
    minHeight: 56,
    color: '#22211E',
    fontSize: 16,
  },

  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22211E',
  },

  sendButtonDisabled: {
    opacity: 0.14,
  },

  sendArrow: {
    color: '#F5F3ED',
    fontSize: 21,
    lineHeight: 23,
    fontWeight: '400',
  },

  alpha: {
    marginTop: 12,
    color:
      'rgba(40, 38, 34, 0.27)',
    fontSize: 8,
    letterSpacing: 2,
  },
});