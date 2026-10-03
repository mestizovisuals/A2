import {
    useRef,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    useRouter,
} from 'expo-router';

import {
    StatusBar,
} from 'expo-status-bar';

import {
    supabase,
} from '../lib/supabase';

export default function VoiceTestScreen() {
  const router =
    useRouter();

  const recorderRef =
    useRef<any>(null);

  const streamRef =
    useRef<any>(null);

  const chunksRef =
    useRef<Blob[]>([]);

  const [
    recording,
    setRecording,
  ] = useState(false);

  const [
    transcribing,
    setTranscribing,
  ] = useState(false);

  const [
    transcript,
    setTranscript,
  ] = useState('');

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  async function startRecording() {
    setErrorMessage('');
    setTranscript('');

    try {
      const browserNavigator =
        globalThis.navigator as any;

      const MediaRecorderClass =
        (globalThis as any)
          .MediaRecorder;

      if (
        !browserNavigator
          ?.mediaDevices
          ?.getUserMedia ||
        !MediaRecorderClass
      ) {
        throw new Error(
          'Voice recording is not supported in this browser.'
        );
      }

      const stream =
        await browserNavigator
          .mediaDevices
          .getUserMedia({
            audio: true,
          });

      streamRef.current =
        stream;

      chunksRef.current =
        [];

      let options:
        | Record<
            string,
            string
          >
        | undefined;

      if (
        MediaRecorderClass
          .isTypeSupported?.(
            'audio/webm;codecs=opus'
          )
      ) {
        options = {
          mimeType:
            'audio/webm;codecs=opus',
        };
      }

      const recorder =
        new MediaRecorderClass(
          stream,
          options
        );

      recorderRef.current =
        recorder;

      recorder.ondataavailable =
        (event: any) => {
          if (
            event.data &&
            event.data.size > 0
          ) {
            chunksRef.current.push(
              event.data
            );
          }
        };

      recorder.onstop =
        async () => {
          await transcribeRecording();
        };

      recorder.start();

      setRecording(true);
    } catch (error) {
      console.error(
        'A2 microphone error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not access the microphone.'
      );
    }
  }

  function stopRecording() {
    const recorder =
      recorderRef.current;

    if (
      !recorder ||
      recorder.state ===
        'inactive'
    ) {
      return;
    }

    setRecording(false);

    recorder.stop();

    const stream =
      streamRef.current;

    if (stream) {
      for (
        const track of
        stream.getTracks()
      ) {
        track.stop();
      }
    }
  }

  async function transcribeRecording() {
    setTranscribing(true);
    setErrorMessage('');

    try {
      const blob =
        new Blob(
          chunksRef.current,
          {
            type:
              'audio/webm',
          }
        );

      if (
        blob.size === 0
      ) {
        throw new Error(
          'The recording was empty.'
        );
      }

      const formData =
        new FormData();

      formData.append(
        'audio',
        blob,
        'a2-voice.webm'
      );

      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          'a2-transcribe',
          {
            body:
              formData,
          }
        );

      if (error) {
        console.error(
          'A2 transcription invoke error:',
          error
        );

        throw new Error(
          'A2 could not transcribe the recording.'
        );
      }

      if (
        typeof data?.text !==
          'string' ||
        !data.text.trim()
      ) {
        throw new Error(
          'A2 did not receive a usable transcript.'
        );
      }

      setTranscript(
        data.text.trim()
      );
    } catch (error) {
      console.error(
        'A2 transcription error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'A2 could not transcribe the recording.'
      );
    } finally {
      setTranscribing(
        false
      );

      recorderRef.current =
        null;

      streamRef.current =
        null;

      chunksRef.current =
        [];
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

      <View
        style={
          styles.content
        }
      >
        <Text
          style={
            styles.eyebrow
          }
        >
          VOICE TEST
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Speak to A2.
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Press once to record.
          Press again when you're
          finished.
        </Text>

        <Pressable
          onPress={
            recording
              ? stopRecording
              : startRecording
          }
          disabled={
            transcribing
          }
          style={[
            styles.orb,

            recording &&
              styles.orbRecording,
          ]}
        >
          {transcribing ? (
            <ActivityIndicator
              color="#F3F1EC"
            />
          ) : (
            <Text
              style={
                styles.orbText
              }
            >
              {recording
                ? 'STOP'
                : 'SPEAK'}
            </Text>
          )}
        </Pressable>

        <Text
          style={
            styles.status
          }
        >
          {recording
            ? 'Listening...'
            : transcribing
              ? 'Transcribing...'
              : 'Ready'}
        </Text>

        {transcript ? (
          <View
            style={
              styles.result
            }
          >
            <Text
              style={
                styles.resultLabel
              }
            >
              TRANSCRIPT
            </Text>

            <Text
              style={
                styles.resultText
              }
            >
              {transcript}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <Text
            style={
              styles.error
            }
          >
            {errorMessage}
          </Text>
        ) : null}
      </View>
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
      flex: 1,
      width: '100%',
      maxWidth: 720,
      alignSelf:
        'center',
      alignItems:
        'center',
      paddingHorizontal:
        26,
      paddingTop: 70,
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
      maxWidth: 360,
      textAlign:
        'center',
      fontSize: 14,
      lineHeight: 21,
      color:
        'rgba(37,36,31,0.46)',
    },

    orb: {
      width: 150,
      height: 150,
      marginTop: 60,
      borderRadius: 75,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#25241F',
    },

    orbRecording: {
      transform: [
        {
          scale: 1.06,
        },
      ],
    },

    orbText: {
      fontSize: 10,
      fontWeight:
        '600',
      letterSpacing: 2,
      color:
        '#F3F1EC',
    },

    status: {
      marginTop: 18,
      fontSize: 10,
      letterSpacing: 1,
      color:
        'rgba(37,36,31,0.4)',
    },

    result: {
      width: '100%',
      marginTop: 50,
      padding: 22,
      borderRadius: 22,
      borderWidth: 1,
      borderColor:
        'rgba(35,33,29,0.07)',
      backgroundColor:
        'rgba(255,255,255,0.42)',
    },

    resultLabel: {
      fontSize: 8,
      fontWeight:
        '600',
      letterSpacing: 1.7,
      color:
        'rgba(37,36,31,0.36)',
    },

    resultText: {
      marginTop: 12,
      fontSize: 17,
      lineHeight: 25,
      color:
        '#25241F',
    },

    error: {
      marginTop: 28,
      maxWidth: 500,
      textAlign:
        'center',
      fontSize: 13,
      lineHeight: 20,
      color:
        'rgba(110,35,35,0.75)',
    },
  });