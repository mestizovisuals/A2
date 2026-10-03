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
  ) => void | Promise<void>;

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

  const [
    recording,
    setRecording,
  ] = useState(false);

  const [
    transcribing,
    setTranscribing,
  ] = useState(false);

  function reportError(
    message: string
  ) {
    console.error(
      'A2 voice error:',
      message
    );

    onError?.(message);
  }

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

  useEffect(() => {
    return () => {
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
        // Ignore cleanup errors.
      }

      stopStream();
    };
  }, []);

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
            audio: true,
          });

      streamRef.current =
        stream;

      chunksRef.current =
        [];

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
          reportError(
            'A2 encountered a microphone recording error.'
          );
        };

      recorder.onstop =
        async () => {
          await transcribeRecording(
            selectedMimeType ||
              recorder.mimeType ||
              'audio/webm'
          );
        };

      recorder.start();

      setRecording(true);
    } catch (error) {
      stopStream();

      setRecording(false);

      reportError(
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

    stopStream();
  }

  async function transcribeRecording(
    mimeType: string
  ) {
    setTranscribing(true);

    try {
      const blob =
        new Blob(
          chunksRef.current,
          {
            type:
              mimeType,
          }
        );

      if (
        blob.size === 0
      ) {
        throw new Error(
          'A2 did not receive any audio.'
        );
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

      const text =
        typeof data?.text ===
          'string'
          ? data.text.trim()
          : '';

      if (!text) {
        throw new Error(
          'A2 could not hear anything clearly.'
        );
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
      setTranscribing(false);

      recorderRef.current =
        null;

      chunksRef.current =
        [];
    }
  }

  async function toggleRecording() {
    if (transcribing) {
      return;
    }

    if (recording) {
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