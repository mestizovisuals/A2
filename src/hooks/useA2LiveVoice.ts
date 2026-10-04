import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  supabase,
} from '../lib/supabase';

export type A2LiveVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

type UseA2LiveVoiceOptions = {
  onAssistantTranscript?: (
    text: string
  ) => void;

  onError?: (
    message: string
  ) => void;
};

type RealtimeFunctionCall = {
  type:
    'function_call';

  name:
    string;

  call_id:
    string;

  arguments:
    string;
};

export function useA2LiveVoice({
  onAssistantTranscript,
  onError,
}: UseA2LiveVoiceOptions = {}) {
  const peerRef =
    useRef<any>(null);

  const dataChannelRef =
    useRef<any>(null);

  const microphoneStreamRef =
    useRef<any>(null);

  const audioElementRef =
    useRef<any>(null);

  const processedCallsRef =
    useRef<
      Set<string>
    >(
      new Set()
    );
    const pendingUserTranscriptRef =
  useRef('');

const partialUserTranscriptRef =
  useRef('');

const finalAssistantTranscriptRef =
  useRef('');

const partialAssistantTranscriptRef =
  useRef('');

  const [
    status,
    setStatus,
  ] =
    useState<A2LiveVoiceStatus>(
      'idle'
    );

  const [
    connected,
    setConnected,
  ] = useState(false);

  const [
    assistantTranscript,
    setAssistantTranscript,
  ] = useState('');

  // ==========================================================
  // ERROR
  // ==========================================================

  function reportError(
    message: string
  ) {
    console.error(
      'A2 live voice:',
      message
    );

    setStatus(
      'error'
    );

    onError?.(
      message
    );
  }

  // ==========================================================
  // SEND REALTIME EVENT
  // ==========================================================

  function sendEvent(
    event: Record<
      string,
      any
    >
  ) {
    const channel =
      dataChannelRef.current;

    if (
      !channel ||
      channel.readyState !==
        'open'
    ) {
      console.warn(
        'A2 realtime channel is not open.'
      );

      return false;
    }

    channel.send(
      JSON.stringify(
        event
      )
    );

    return true;
  }

  // ==========================================================
  // EXECUTE ONE PRIVATE A2 TOOL
  // ==========================================================

  async function executeToolCall(
    call:
      RealtimeFunctionCall
  ) {
    if (
      !call.call_id ||
      processedCallsRef.current.has(
        call.call_id
      )
    ) {
      return;
    }

    processedCallsRef.current.add(
      call.call_id
    );

    setStatus(
      'thinking'
    );

    let parsedArguments:
      Record<
        string,
        any
      > = {};

    try {
      if (
        call.arguments
      ) {
        parsedArguments =
          JSON.parse(
            call.arguments
          );
      }
    } catch (error) {
      console.error(
        'A2 realtime tool arguments parse error:',
        error
      );

      parsedArguments =
        {};
    }

    let toolOutput:
      Record<
        string,
        any
      >;

    try {
      const {
        data,
        error,
      } =
        await supabase
          .functions
          .invoke(
            'a2-live-tool',
            {
              body: {
                tool:
                  call.name,

                arguments:
                  parsedArguments,
              },
            }
          );

if (error) {
  let functionErrorBody:
    Record<string, any> | null =
    null;

  try {
    const errorContext =
      (error as any)
        ?.context;

    if (
      errorContext &&
      typeof errorContext.json ===
        'function'
    ) {
      const parsed =
        await errorContext
          .json();

      if (
        parsed &&
        typeof parsed ===
          'object'
      ) {
        functionErrorBody =
          parsed;
      }
    }
  } catch (
    parseError
  ) {
    console.warn(
      'A2 could not read live tool error response:',
      parseError
    );
  }

  // A 4xx response can be an expected tool outcome,
  // such as "project not found" or "needs clarification".
  // Do not treat that as an app crash.
  console.warn(
    'A2 live tool returned a non-success result:',
    functionErrorBody ??
      error
  );

  toolOutput =
    functionErrorBody ?? {
      success:
        false,

      error:
        'A2 could not complete that action.',
    };
} else {
  toolOutput =
    data ?? {
      success:
        false,

      error:
        'A2 received no result from that action.',
    };
}
    } catch (error) {
      console.error(
        'A2 live tool execution error:',
        error
      );

      toolOutput = {
        success:
          false,

        error:
          'A2 encountered an internal tool error.',
      };
    }

    // --------------------------------------------------------
    // RETURN TOOL RESULT TO REALTIME MODEL
    // --------------------------------------------------------

    sendEvent({
      type:
        'conversation.item.create',

      item: {
        type:
          'function_call_output',

        call_id:
          call.call_id,

        output:
          JSON.stringify(
            toolOutput
          ),
      },
    });
  }

  // ==========================================================
  // EXECUTE ALL TOOL CALLS IN A RESPONSE
  // ==========================================================

  async function handleToolCalls(
    calls:
      RealtimeFunctionCall[]
  ) {
    if (
      calls.length === 0
    ) {
      return;
    }

    setStatus(
      'thinking'
    );

    for (
      const call of
      calls
    ) {
      await executeToolCall(
        call
      );
    }

    // --------------------------------------------------------
    // ASK A2 TO CONTINUE USING TOOL RESULTS
    // --------------------------------------------------------

    sendEvent({
      type:
        'response.create',
    });
  }

// ==========================================================
// SAVE COMPLETED LIVE TURN TO A2 HISTORY
// ==========================================================

async function syncCompletedLiveTurn() {
  const userText =
    (
      pendingUserTranscriptRef
        .current ||
      partialUserTranscriptRef
        .current
    ).trim();

  const assistantText =
    (
      finalAssistantTranscriptRef
        .current ||
      partialAssistantTranscriptRef
        .current
    ).trim();

  if (
    !userText ||
    !assistantText
  ) {
    return false;
  }

  try {
    const {
      data,
      error,
    } =
      await supabase
        .functions
        .invoke(
          'a2-live-sync',
          {
            body: {
              user_text:
                userText,

              assistant_text:
                assistantText,
            },
          }
        );

    if (
      error
    ) {
      console.error(
        'A2 live conversation sync error:',
        error
      );

      return false;
    }

    if (
      data?.success ===
      false
    ) {
      console.error(
        'A2 live conversation sync rejected:',
        data
      );

      return false;
    }

    console.log(
      'A2 live conversation saved.'
    );

    pendingUserTranscriptRef.current =
      '';

    partialUserTranscriptRef.current =
      '';

    finalAssistantTranscriptRef.current =
      '';

    partialAssistantTranscriptRef.current =
      '';

    return true;
  } catch (error) {
    console.error(
      'A2 live conversation sync exception:',
      error
    );

    return false;
  }
}

  // ==========================================================
  // HANDLE OPENAI EVENTS
  // ==========================================================

  async function handleRealtimeEvent(
    rawData: string
  ) {
    try {
      const event =
        JSON.parse(
          rawData
        );

      switch (
        event.type
      ) {

case 'conversation.item.input_audio_transcription.delta': {
  const delta =
    typeof event.delta ===
      'string'
      ? event.delta
      : '';

  if (
    delta
  ) {
    partialUserTranscriptRef.current +=
      delta;
  }

  break;
}

case 'conversation.item.input_audio_transcription.completed': {
  const transcript =
    typeof event.transcript ===
      'string'
      ? event.transcript.trim()
      : '';

  const fallbackTranscript =
    partialUserTranscriptRef.current
      .trim();

  const finalUserText =
    transcript ||
    fallbackTranscript;

  if (
    finalUserText
  ) {
    pendingUserTranscriptRef.current =
      finalUserText;

    partialUserTranscriptRef.current =
      '';

    await syncCompletedLiveTurn();
  }

  break;
}
        
        case 'session.created':
        case 'session.updated':
          break;

        case 'input_audio_buffer.speech_started':
          setStatus(
            'listening'
          );
          break;

        case 'input_audio_buffer.speech_stopped':
          setStatus(
            'thinking'
          );
          break;

        case 'response.created':
          setStatus(
            'thinking'
          );

          partialAssistantTranscriptRef.current =
  '';

finalAssistantTranscriptRef.current =
  '';

          setAssistantTranscript(
            ''
          );
          break;

        case 'response.output_audio_transcript.delta': {
          const delta =
            typeof event.delta ===
              'string'
              ? event.delta
              : '';

          if (!delta) {
            break;
          }
          partialAssistantTranscriptRef.current +=
  delta;

          setStatus(
            'speaking'
          );

          setAssistantTranscript(
            (
              current
            ) => {
              const next =
                current +
                delta;

              onAssistantTranscript?.(
                next
              );

              return next;
            }
          );

          break;
        }

case 'response.output_audio_transcript.done': {
  const transcript =
    typeof event.transcript ===
      'string'
      ? event.transcript.trim()
      : '';

  if (
    transcript
  ) {
    finalAssistantTranscriptRef.current =
      transcript;

    setAssistantTranscript(
      transcript
    );

    onAssistantTranscript?.(
      transcript
    );

    await syncCompletedLiveTurn();
  }

  break;
}

        case 'response.done': {
          const output =
            Array.isArray(
              event
                ?.response
                ?.output
            )
              ? event.response
                  .output
              : [];

          const functionCalls =
            output.filter(
              (
                item: any
              ) =>
                item?.type ===
                  'function_call' &&
                typeof item
                  ?.name ===
                  'string' &&
                typeof item
                  ?.call_id ===
                  'string'
            ) as
              RealtimeFunctionCall[];

if (
  functionCalls.length >
  0
) {
  await handleToolCalls(
    functionCalls
  );

  break;
}

await syncCompletedLiveTurn();

setStatus(
  'ready'
);

break;
        }

        case 'response.cancelled':
          setStatus(
            'listening'
          );
          break;

        case 'error': {
          console.error(
            'OpenAI realtime error:',
            event
          );

          const message =
            event?.error
              ?.message ||
            event?.message ||
            'A2 encountered a realtime voice error.';

          reportError(
            message
          );

          break;
        }

        default:
          break;
      }
    } catch (error) {
      console.error(
        'A2 realtime event error:',
        error
      );
    }
  }

  // ==========================================================
  // CONNECT
  // ==========================================================

  async function connect() {
    if (
      connected ||
      status ===
        'connecting'
    ) {
      return;
    }

    setStatus(
      'connecting'
    );

    setAssistantTranscript(
      ''
    );

    processedCallsRef.current.clear();

    try {
      const PeerConnection =
        (
          globalThis as any
        )
          .RTCPeerConnection;

      const browserNavigator =
        (
          globalThis as any
        )
          .navigator;

      const browserDocument =
        (
          globalThis as any
        )
          .document;

      if (
        !PeerConnection ||
        !browserNavigator
          ?.mediaDevices
          ?.getUserMedia
      ) {
        throw new Error(
          'Live voice is not supported in this browser.'
        );
      }

      // ------------------------------------------------------
      // CURRENT LOCAL CONTEXT
      // ------------------------------------------------------

      const clientNow =
        new Date()
          .toString();

      const clientTimezone =
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone ||
        'UTC';

      // ------------------------------------------------------
      // GET SECURE EPHEMERAL KEY
      // ------------------------------------------------------

      const {
        data:
          sessionData,

        error:
          sessionError,
      } =
        await supabase
          .functions
          .invoke(
            'a2-realtime-session',
            {
              body: {
                client_now:
                  clientNow,

                client_timezone:
                  clientTimezone,
              },
            }
          );

      if (
        sessionError
      ) {
        console.error(
          'A2 realtime session function error:',
          sessionError
        );

        throw new Error(
          'A2 could not start a secure voice session.'
        );
      }

      const ephemeralKey =
        sessionData?.value;

      if (
        typeof ephemeralKey !==
          'string' ||
        !ephemeralKey
      ) {
        console.error(
          'Unexpected realtime session response:',
          sessionData
        );

        throw new Error(
          'A2 did not receive a valid realtime session key.'
        );
      }

      // ------------------------------------------------------
      // WEBRTC
      // ------------------------------------------------------

      const pc =
        new PeerConnection();

      peerRef.current =
        pc;

      // ------------------------------------------------------
      // REMOTE AUDIO
      // ------------------------------------------------------

      if (
        browserDocument
      ) {
        const audio =
          browserDocument
            .createElement(
              'audio'
            );

        audio.autoplay =
          true;

        audio.setAttribute(
          'playsinline',
          'true'
        );

        audioElementRef.current =
          audio;

        pc.ontrack =
          (
            event: any
          ) => {
            const remoteStream =
              event
                .streams?.[0];

            if (
              !remoteStream
            ) {
              return;
            }

            audio.srcObject =
              remoteStream;

            audio
              .play?.()
              .catch(
                (
                  error: any
                ) => {
                  console.warn(
                    'A2 remote audio autoplay:',
                    error
                  );
                }
              );
          };
      }

      // ------------------------------------------------------
      // MICROPHONE
      // ------------------------------------------------------

      const microphoneStream =
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

      microphoneStreamRef.current =
        microphoneStream;

      for (
        const track of
        microphoneStream
          .getAudioTracks()
      ) {
        pc.addTrack(
          track,
          microphoneStream
        );
      }

      // ------------------------------------------------------
      // REALTIME DATA CHANNEL
      // ------------------------------------------------------

      const dataChannel =
        pc.createDataChannel(
          'oai-events'
        );

      dataChannelRef.current =
        dataChannel;

      dataChannel.onopen =
        () => {
          console.log(
            'A2 realtime event channel open.'
          );

          setConnected(
            true
          );

          setStatus(
            'ready'
          );
        };
      dataChannel.onmessage =
        (
          event: any
        ) => {
          void handleRealtimeEvent(
            event.data
          );
        };

      dataChannel.onerror =
        (
          error: any
        ) => {
          console.error(
            'A2 realtime data channel error:',
            error
          );
        };

      dataChannel.onclose =
        () => {
          setConnected(
            false
          );

          setStatus(
            'idle'
          );
        };

      // ------------------------------------------------------
      // CONNECTION STATE
      // ------------------------------------------------------

      pc.onconnectionstatechange =
        () => {
          console.log(
            'A2 WebRTC state:',
            pc.connectionState
          );

          if (
            pc.connectionState ===
              'failed' ||
            pc.connectionState ===
              'closed'
          ) {
            setConnected(
              false
            );

            setStatus(
              'idle'
            );
          }
        };

      // ------------------------------------------------------
      // SDP OFFER
      // ------------------------------------------------------

      const offer =
        await pc.createOffer();

      await pc
        .setLocalDescription(
          offer
        );

      if (
        !offer.sdp
      ) {
        throw new Error(
          'A2 could not create the voice connection offer.'
        );
      }

      // ------------------------------------------------------
      // OPENAI SDP EXCHANGE
      // ------------------------------------------------------

      const sdpResponse =
        await fetch(
          'https://api.openai.com/v1/realtime/calls',
          {
            method:
              'POST',

            headers: {
              Authorization:
                `Bearer ${ephemeralKey}`,

              'Content-Type':
                'application/sdp',
            },

            body:
              offer.sdp,
          }
        );

      if (
        !sdpResponse.ok
      ) {
        const errorText =
          await sdpResponse
            .text();

        console.error(
          'OpenAI realtime SDP error:',
          errorText
        );

        throw new Error(
          'A2 could not establish the realtime voice connection.'
        );
      }

      const answerSdp =
        await sdpResponse
          .text();

      await pc
        .setRemoteDescription(
          {
            type:
              'answer',

            sdp:
              answerSdp,
          }
        );
    } catch (error) {
      console.error(
        'A2 live voice connection error:',
        error
      );

      await disconnect();

      reportError(
        error instanceof Error
          ? error.message
          : 'A2 could not start live voice.'
      );
    }
  }

  // ==========================================================
  // DISCONNECT
  // ==========================================================

async function disconnect() {
  await syncCompletedLiveTurn();

  try {
    const channel =
      dataChannelRef.current;

      if (channel) {
        channel.close();
      }
    } catch {
      // Ignore cleanup errors.
    }

    dataChannelRef.current =
      null;

    try {
      const pc =
        peerRef.current;

      if (pc) {
        pc.close();
      }
    } catch {
      // Ignore cleanup errors.
    }

    peerRef.current =
      null;

    const microphoneStream =
      microphoneStreamRef.current;

    if (
      microphoneStream
    ) {
      for (
        const track of
        microphoneStream
          .getTracks()
      ) {
        track.stop();
      }
    }

    microphoneStreamRef.current =
      null;

    const audio =
      audioElementRef.current;

    if (audio) {
      try {
        audio.pause?.();

        audio.srcObject =
          null;
      } catch {
        // Ignore cleanup errors.
      }
    }

audioElementRef.current =
  null;

processedCallsRef.current.clear();

pendingUserTranscriptRef.current =
  '';

partialUserTranscriptRef.current =
  '';

finalAssistantTranscriptRef.current =
  '';

partialAssistantTranscriptRef.current =
  '';

setConnected(
  false
);

setStatus(
  'idle'
);

setAssistantTranscript(
  ''
);
  }

  // ==========================================================
  // TOGGLE
  // ==========================================================

  async function toggle() {
    if (
      connected
    ) {
      await disconnect();
      return;
    }

    await connect();
  }

  // ==========================================================
  // CLEANUP
  // ==========================================================

useEffect(() => {
  return () => {
    void disconnect();
  };
}, []);

  return {
    connected,
    status,
    assistantTranscript,

    connect,
    disconnect,
    toggle,
  };
}