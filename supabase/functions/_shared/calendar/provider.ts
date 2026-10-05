import type {
    CalendarAvailabilityInput,
    CalendarAvailabilityResult,
    CalendarEventDraft,
    CalendarEventPatch,
    CalendarListInput,
    CalendarListResult,
    CalendarProviderName,
    NormalizedCalendarEvent,
    ProviderCalendar,
} from './types.ts';


// ============================================================
// CALENDAR PROVIDER CONTRACT
//
// A2 talks to this interface.
// It should not care whether the provider is:
// Google
// Apple/EventKit
// iCloud
// or something we add later.
// ============================================================

export interface CalendarProvider {
  readonly provider:
    CalendarProviderName;


  listCalendars():
    Promise<
      ProviderCalendar[]
    >;


  listEvents(
    input:
      CalendarListInput
  ):
    Promise<
      CalendarListResult
    >;


  getEvent(
    calendarId:
      string,

    providerEventId:
      string
  ):
    Promise<
      NormalizedCalendarEvent
    >;


  createEvent(
    calendarId:
      string,

    event:
      CalendarEventDraft
  ):
    Promise<
      NormalizedCalendarEvent
    >;


  updateEvent(
    calendarId:
      string,

    providerEventId:
      string,

    patch:
      CalendarEventPatch
  ):
    Promise<
      NormalizedCalendarEvent
    >;


  deleteEvent(
    calendarId:
      string,

    providerEventId:
      string
  ):
    Promise<void>;


  getAvailability(
    input:
      CalendarAvailabilityInput
  ):
    Promise<
      CalendarAvailabilityResult
    >;
}


// ============================================================
// STANDARDIZED PROVIDER ERROR
// ============================================================

export class CalendarProviderError
  extends Error {
  provider:
    CalendarProviderName;

  code:
    string;

  status:
    number | null;

  retryable:
    boolean;


  constructor(
    options: {
      provider:
        CalendarProviderName;

      code:
        string;

      message:
        string;

      status?:
        number | null;

      retryable?:
        boolean;
    }
  ) {
    super(
      options.message
    );

    this.name =
      'CalendarProviderError';

    this.provider =
      options.provider;

    this.code =
      options.code;

    this.status =
      options.status ??
      null;

    this.retryable =
      options.retryable ??
      false;
  }
}