import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';

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

export default function HomeScreen() {
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
  const [listening, setListening] = useState(false);
  const [reply, setReply] = useState('');
  const [thinking, setThinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

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
  // RESPONSIVE SIZE CALCULATIONS
  // ------------------------------------------------------------

  const orbSize = Math.min(Math.max(width * 0.38, 165), 300);

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
  // SEND MESSAGE TO CURRENT A2 BACKEND
  // ------------------------------------------------------------

  async function submitPrompt() {
    const message = draft.trim();

    if (!message || thinking) {
      return;
    }

    const apiUrl =
      process.env.EXPO_PUBLIC_A2_API_URL;

    if (!apiUrl) {
      setErrorMessage(
        'A2 API URL is not configured.'
      );
      return;
    }

    setLastPrompt(message);
    setDraft('');
    setReply('');
    setErrorMessage('');
    setThinking(true);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'A2 could not complete the request.'
        );
      }

      if (!data?.reply) {
        throw new Error(
          'A2 returned an empty response.'
        );
      }

      setReply(data.reply);
    } catch (error) {
      console.error(error);

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
      {/* FAINT LATITUDE / LONGITUDE BACKGROUND                  */}
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
          <Text style={styles.brand}>A2</Text>
        </View>

        {/* ---------------------------------------------------- */}
        {/* CENTER EXPERIENCE                                    */}
        {/* ---------------------------------------------------- */}

        <View style={styles.center}>
          <Text style={styles.greeting}>
            {greeting}, Tony.
          </Text>

          <Pressable
            onPress={() =>
              setListening((current) => !current)
            }
            style={styles.orbButton}
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
                  listening &&
                    styles.pixelListening,
                ]}
              />

              <View
                style={[
                  styles.pixel,
                  styles.pixelTwo,
                  listening &&
                    styles.pixelListening,
                ]}
              />

              <View
                style={[
                  styles.pixel,
                  styles.pixelThree,
                  listening &&
                    styles.pixelListening,
                ]}
              />

              <View
                style={[
                  styles.pixelTiny,
                  styles.pixelFour,
                  listening &&
                    styles.pixelListening,
                ]}
              />

              <View
                style={[
                  styles.pixelTiny,
                  styles.pixelFive,
                  listening &&
                    styles.pixelListening,
                ]}
              />
            </View>
          </Pressable>

          {/* -------------------------------------------------- */}
          {/* A2 STATE                                           */}
          {/* -------------------------------------------------- */}

          <Text style={styles.mode}>
            {thinking
              ? 'Thinking…'
              : listening
                ? 'Listening…'
                : 'Tap to speak'}
          </Text>

          {/* -------------------------------------------------- */}
          {/* RESPONSE AREA                                      */}
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
          ) : (
            <Text style={styles.question}>
              What do you need?
            </Text>
          )}
        </View>

        {/* ---------------------------------------------------- */}
        {/* INPUT                                                */}
        {/* ---------------------------------------------------- */}

        <View style={styles.composerArea}>
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submitPrompt}
              placeholder="Ask A2..."
              placeholderTextColor="rgba(28, 27, 24, 0.36)"
              style={styles.input}
              returnKeyType="send"
              autoCorrect
            />

            <Pressable
              onPress={submitPrompt}
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