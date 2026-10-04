import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  supabase,
} from '../lib/supabase';

type UseA2VoiceOptions = {
  onTranscript: (
    text: string
  ) =>
    | void
    | Promise<void>;

  onError?: (
    message: string
  ) => void;
};

export function useA2Voice({
  onTranscript,
  onError,
}: UseA2VoiceOptions) {
  const recorderRef =
    useRef<any>(null);

  const streamRef =
    useRef<any>(null);

  const chunksRef =
    useRef<Blob[]>([]);

  // ----------------------------------------------------------
  // SILENCE DETECTION
  // ----------------------------------------------------------

  const audioContextRef =
    useRef<any>(null);

  const analyserRef =
    useRef<any>(null);

  const speechMonitorRef =
    useRef<any>(null);

  const speechDetectedRef =
    useRef(false);

  const speechHitCountRef =
    useRef(0);

  const maxRmsRef =
    useRef(0);

  const recordingStartedAtRef =
    useRef(0);

  const skipTranscriptionRef =
    useRef(false);

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const [
    recording,
    setRecording,
  ] = useState(false);

  const [
    transcribing,
    setTranscribing,
  ] = useState(false);

  // ----------------------------------------------------------
  // ERROR
  // ----------------------------------------------------------

  function reportError(
    message: string
  ) {
    console.error(
      'A2 voice error:',
      message
    );

    onError?.(
      message
    );
  }

  // ----------------------------------------------------------
  // STOP MICROPHONE STREAM
  // ----------------------------------------------------------

  function stopStream() {
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

    streamRef.current =
      null;
  }

  // ----------------------------------------------------------
  // STOP SILENCE MONITOR
  // ----------------------------------------------------------

  function stopSpeechMonitor() {
    if (
      speechMonitorRef.current
    ) {
      clearInterval(
        speechMonitorRef.current
      );

      speechMonitorRef.current =
        null;
    }

    try {
      audioContextRef.current
        ?.close?.();
    } catch {
      // Ignore cleanup error.
    }

    audioContextRef.current =
      null;

    analyserRef.current =
      null;
  }

  // ----------------------------------------------------------
  // START SILENCE / SPEECH DETECTION
  // ----------------------------------------------------------

  function startSpeechMonitor(
    stream: any
  ) {
    speechDetectedRef.current =
      false;

    speechHitCountRef.current =
      0;

    maxRmsRef.current =
      0;

    const AudioContextClass =
      (globalThis as any)
        .AudioContext ||
      (globalThis as any)
        .webkitAudioContext;

    // If the browser does not support
    // Web Audio, allow normal transcription.
    if (
      !AudioContextClass
    ) {
      speechDetectedRef.current =
        true;

      return;
    }

    try {
      const context =
        new AudioContextClass();

      const analyser =
        context.createAnalyser();

      analyser.fftSize =
        512;

      analyser.smoothingTimeConstant =
        0.15;

      const source =
        context
          .createMediaStreamSource(
            stream
          );

      source.connect(
        analyser
      );

      audioContextRef.current =
        context;

      analyserRef.current =
        analyser;

      if (
        context.state ===
        'suspended'
      ) {
        void context
          .resume?.();
      }

      const samples =
        new Uint8Array(
          analyser.fftSize
        );

      speechMonitorRef.current =
        setInterval(
          () => {
            analyser
              .getByteTimeDomainData(
                samples
              );

            let sum =
              0;

            for (
              const sample of
              samples
            ) {
              const normalized =
                (
                  sample -
                  128
                ) /
                128;

              sum +=
                normalized *
                normalized;
            }

            const rms =
              Math.sqrt(
                sum /
                  samples.length
              );

            maxRmsRef.current =
              Math.max(
                maxRmsRef.current,
                rms
              );

            // Require meaningful volume
            // for multiple consecutive checks.
            if (
              rms >
              0.032
            ) {
              speechHitCountRef.current +=
                1;
            } else {
              speechHitCountRef.current =
                Math.max(
                  0,
                  speechHitCountRef.current -
                    1
                );
            }

            // Roughly 300ms of sustained sound.
            if (
              speechHitCountRef.current >=
              4
            ) {
              speechDetectedRef.current =
                true;
            }
          },
          75
        );
    } catch (error) {
      console.warn(
        'A2 local speech detector unavailable:',
        error
      );

      // Do not block real voice usage just
      // because Web Audio detection failed.
      speechDetectedRef.current =
        true;
    }
  }

  // ----------------------------------------------------------
  // CLEAN RECORDING RESOURCES
  // ----------------------------------------------------------

  function cleanupRecording() {
    stopSpeechMonitor();

    stopStream();

    recorderRef.current =
      null;

    chunksRef.current =
      [];

    recordingStartedAtRef.current =
      0;

    speechDetectedRef.current =
      false;

    speechHitCountRef.current =
      0;

    maxRmsRef.current =
      0;

    skipTranscriptionRef.current =
      false;
  }

  // ----------------------------------------------------------
  // COMPONENT CLEANUP
  // ----------------------------------------------------------

  useEffect(() => {
    return () => {
      skipTranscriptionRef.current =
        true;

      try {
        const recorder =
          recorderRef.current;

        if (
          recorder &&
          recorder.state !==
            'inactive'
        ) {
          recorder.stop();
        }
      } catch {
        // Ignore cleanup error.
      }

      stopSpeechMonitor();

      stopStream();
    };
  }, []);

  // ----------------------------------------------------------
  // START RECORDING
  // ----------------------------------------------------------

  async function startRecording() {
    if (
      recording ||
      transcribing
    ) {
      return;
    }

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
            audio: {
              echoCancellation:
                true,

              noiseSuppression:
                true,

              autoGainControl:
                true,
            },
          });

      streamRef.current =
        stream;

      chunksRef.current =
        [];

      skipTranscriptionRef.current =
        false;

      recordingStartedAtRef.current =
        Date.now();

      startSpeechMonitor(
        stream
      );

      // ------------------------------------------------------
      // PICK BEST BROWSER AUDIO FORMAT
      // ------------------------------------------------------

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];

      let selectedMimeType =
        '';

      for (
        const candidate of
        mimeCandidates
      ) {
        if (
          MediaRecorderClass
            .isTypeSupported?.(
              candidate
            )
        ) {
          selectedMimeType =
            candidate;

          break;
        }
      }

      const recorder =
        selectedMimeType
          ? new MediaRecorderClass(
              stream,
              {
                mimeType:
                  selectedMimeType,
              }
            )
          : new MediaRecorderClass(
              stream
            );

      recorderRef.current =
        recorder;

      // ------------------------------------------------------
      // RECORD CHUNKS
      // ------------------------------------------------------

      recorder.ondataavailable =
        (event: any) => {
          if (
            event.data &&
            event.data.size >
              0
          ) {
            chunksRef.current.push(
              event.data
            );
          }
        };

      recorder.onerror =
        () => {
          cleanupRecording();

          setRecording(
            false
          );

          reportError(
            'A2 encountered a microphone recording error.'
          );
        };

      // ------------------------------------------------------
      // RECORDING FINISHED
      // ------------------------------------------------------

      recorder.onstop =
        async () => {
          stopSpeechMonitor();

          stopStream();

          // Silence is intentional / harmless.
          if (
            skipTranscriptionRef.current
          ) {
            cleanupRecording();

            return;
          }

          await transcribeRecording(
            selectedMimeType ||
              recorder.mimeType ||
              'audio/webm'
          );
        };

      recorder.start();

      setRecording(
        true
      );
    } catch (error) {
      cleanupRecording();

      setRecording(
        false
      );

      reportError(
        error instanceof Error
          ? error.message
          : 'A2 could not access the microphone.'
      );
    }
  }

  // ----------------------------------------------------------
  // STOP RECORDING
  // ----------------------------------------------------------

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

    setRecording(
      false
    );

    const duration =
      Date.now() -
      recordingStartedAtRef.current;

    const tooShort =
      duration <
      450;

    const meaningfulSpeech =
      speechDetectedRef.current &&
      maxRmsRef.current >
        0.032;

    // --------------------------------------------------------
    // IMPORTANT:
    // Silence is not an error.
    // Simply skip transcription.
    // --------------------------------------------------------

    skipTranscriptionRef.current =
      tooShort ||
      !meaningfulSpeech;

    recorder.stop();
  }

  // ----------------------------------------------------------
  // TRANSCRIBE REAL SPEECH
  // ----------------------------------------------------------

  async function transcribeRecording(
    mimeType: string
  ) {
    setTranscribing(
      true
    );

    try {
      const blob =
        new Blob(
          chunksRef.current,
          {
            type:
              mimeType,
          }
        );

      // Empty recording = quietly do nothing.
      if (
        blob.size ===
        0
      ) {
        return;
      }

      const extension =
        mimeType.includes(
          'mp4'
        )
          ? 'm4a'
          : 'webm';

      const formData =
        new FormData();

      formData.append(
        'audio',
        blob,
        `a2-voice.${extension}`
      );

      const {
        data,
        error,
      } =
        await supabase
          .functions
          .invoke(
            'a2-transcribe',
            {
              body:
                formData,
            }
          );

      if (
        error
      ) {
        console.error(
          'A2 transcription invoke error:',
          error
        );

        throw new Error(
          'A2 could not transcribe the recording.'
        );
      }

      // Backend explicitly recognized silence.
      if (
        data?.no_speech ===
        true
      ) {
        return;
      }

      const text =
        typeof data?.text ===
          'string'
          ? data.text.trim()
          : '';

      // Empty transcription is also
      // treated as harmless silence.
      if (
        !text
      ) {
        return;
      }

      await onTranscript(
        text
      );
    } catch (error) {
      reportError(
        error instanceof Error
          ? error.message
          : 'A2 could not process the recording.'
      );
    } finally {
      setTranscribing(
        false
      );

      cleanupRecording();
    }
  }

  // ----------------------------------------------------------
  // TOGGLE
  // ----------------------------------------------------------

  async function toggleRecording() {
    if (
      transcribing
    ) {
      return;
    }

    if (
      recording
    ) {
      stopRecording();

      return;
    }

    await startRecording();
  }

  return {
    recording,
    transcribing,

    startRecording,
    stopRecording,
    toggleRecording,
  };
}