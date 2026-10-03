import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    StatusBar,
} from 'expo-status-bar';

import {
    useRouter,
} from 'expo-router';

import {
    useA2LiveVoice,
} from '../hooks/useA2LiveVoice';

export default function LiveVoiceTestScreen() {
  const router =
    useRouter();

  const {
    connected,
    status,
    assistantTranscript,
    toggle,
  } =
    useA2LiveVoice();

  function statusLabel() {
    switch (
      status
    ) {
      case 'connecting':
        return 'CONNECTING';

      case 'ready':
        return 'READY — SPEAK';

      case 'listening':
        return 'LISTENING';

      case 'thinking':
        return 'THINKING';

      case 'speaking':
        return 'A2 SPEAKING';

      case 'error':
        return 'VOICE ERROR';

      default:
        return 'OFFLINE';
    }
  }

  return (
    <View
      style={
        styles.screen
      }
    >
      <StatusBar
        style="dark"
      />

      <View
        style={
          styles.header
        }
      >
        <Pressable
          onPress={() =>
            router.replace('/')
          }
          style={
            styles.headerButton
          }
        >
          <Text
            style={
              styles.back
            }
          >
            ←
          </Text>
        </Pressable>

        <Text
          style={
            styles.brand
          }
        >
          A2
        </Text>

        <View
          style={
            styles.headerButton
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
      >
        <Text
          style={
            styles.eyebrow
          }
        >
          LIVE VOICE
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Talk naturally.
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Start the session,
          then simply speak.
          A2 detects when you
          finish and answers
          out loud.
        </Text>

        <Pressable
          onPress={toggle}
          style={[
            styles.orb,

            connected &&
              styles.orbActive,
          ]}
        >
          <Text
            style={
              styles.orbText
            }
          >
            {connected
              ? 'END'
              : 'START'}
          </Text>
        </Pressable>

        <Text
          style={
            styles.status
          }
        >
          {statusLabel()}
        </Text>

        <Text
          style={
            styles.disclosure
          }
        >
          A2 uses an
          AI-generated voice.
        </Text>

        {assistantTranscript ? (
          <View
            style={
              styles.transcriptCard
            }
          >
            <Text
              style={
                styles.transcriptLabel
              }
            >
              A2
            </Text>

            <Text
              style={
                styles.transcript
              }
            >
              {
                assistantTranscript
              }
            </Text>
          </View>
        ) : null}

        <View
          style={
            styles.instructions
          }
        >
          <Text
            style={
              styles.instructionLabel
            }
          >
            TEST
          </Text>

          <Text
            style={
              styles.instruction
            }
          >
            Say: “A2, tell me
            in one sentence what
            you are.”
          </Text>

          <Text
            style={
              styles.instruction
            }
          >
            Then, while A2 is
            speaking, interrupt
            it by saying:
            “Actually, stop.”
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        '#F3F1EC',
    },

    header: {
      height: 78,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      paddingHorizontal:
        22,
      borderBottomWidth:
        1,
      borderBottomColor:
        'rgba(35,33,29,0.06)',
    },

    headerButton: {
      width: 44,
      height: 44,
      justifyContent:
        'center',
    },

    back: {
      fontSize: 23,
      color:
        '#25241F',
    },

    brand: {
      fontSize: 14,
      fontWeight:
        '600',
      letterSpacing: 5,
      color:
        '#22211E',
    },

    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf:
        'center',
      alignItems:
        'center',
      paddingHorizontal:
        26,
      paddingTop: 70,
      paddingBottom: 80,
    },

    eyebrow: {
      fontSize: 9,
      fontWeight:
        '600',
      letterSpacing:
        2.3,
      color:
        'rgba(37,36,31,0.38)',
    },

    title: {
      marginTop: 18,
      fontSize: 36,
      letterSpacing:
        -1.2,
      color:
        '#25241F',
    },

    subtitle: {
      marginTop: 12,
      maxWidth: 390,
      textAlign:
        'center',
      fontSize: 14,
      lineHeight: 21,
      color:
        'rgba(37,36,31,0.46)',
    },

    orb: {
      width: 160,
      height: 160,
      marginTop: 55,
      borderRadius: 80,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(37,36,31,0.22)',
    },

    orbActive: {
      backgroundColor:
        '#25241F',
    },

    orbText: {
      color:
        '#F3F1EC',
      fontSize: 10,
      fontWeight:
        '600',
      letterSpacing: 2,
    },

    status: {
      marginTop: 20,
      fontSize: 9,
      letterSpacing: 1.7,
      color:
        'rgba(37,36,31,0.48)',
    },

    disclosure: {
      marginTop: 10,
      fontSize: 9,
      color:
        'rgba(37,36,31,0.3)',
    },

    transcriptCard: {
      width: '100%',
      marginTop: 44,
      padding: 22,
      borderRadius: 22,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.07)',
      backgroundColor:
        'rgba(255,255,255,0.42)',
    },

    transcriptLabel: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing: 1.7,
      color:
        'rgba(37,36,31,0.36)',
    },

    transcript: {
      marginTop: 12,
      fontSize: 17,
      lineHeight: 25,
      color:
        '#25241F',
    },

    instructions: {
      width: '100%',
      marginTop: 44,
      paddingTop: 25,
      borderTopWidth: 1,
      borderTopColor:
        'rgba(35,33,29,0.07)',
    },

    instructionLabel: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing: 1.6,
      color:
        'rgba(37,36,31,0.36)',
    },

    instruction: {
      marginTop: 12,
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(37,36,31,0.58)',
    },
  });