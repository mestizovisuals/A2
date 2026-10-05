// ============================================================
// A2 CALENDAR
// PROVIDER-NEUTRAL TYPES
// ============================================================

export type CalendarProviderName =
  | 'google'
  | 'apple_device'
  | 'icloud_caldav'
  | string;


export type CalendarEventStatus =
  | 'confirmed'
  | 'tentative'
  | 'cancelled';


export type CalendarBusyStatus =
  | 'busy'
  | 'free'
  | 'unknown';


export type CalendarEventType =
  | 'work'
  | 'personal'
  | 'focus'
  | 'a2_block'
  | 'unknown';


export type CalendarEventSource =
  | 'provider'
  | 'a2';


export type CalendarAttendee = {
  email: string;

  name?: string | null;

  responseStatus?:
    | 'accepted'
    | 'declined'
    | 'tentative'
    | 'needsAction'
    | string;
};


export type NormalizedCalendarEvent = {
  providerEventId:
    string;

  title:
    string;

  description?:
    string | null;

  location?:
    string | null;

  startAt?:
    string | null;

  endAt?:
    string | null;

  startDate?:
    string | null;

  endDate?:
    string | null;

  timezone?:
    string | null;

  allDay:
    boolean;

  status:
    CalendarEventStatus;

  busyStatus:
    CalendarBusyStatus;

  eventType:
    CalendarEventType;

  organizerEmail?:
    string | null;

  attendees:
    CalendarAttendee[];

  recurrence:
    string[];

  conferenceUrl?:
    string | null;

  source:
    CalendarEventSource;

  providerCreatedAt?:
    string | null;

  providerUpdatedAt?:
    string | null;

  metadata?:
    Record<
      string,
      unknown
    >;
};


export type CalendarEventDraft = {
  title:
    string;

  description?:
    string | null;

  location?:
    string | null;

  startAt?:
    string | null;

  endAt?:
    string | null;

  startDate?:
    string | null;

  endDate?:
    string | null;

  timezone?:
    string | null;

  allDay?:
    boolean;

  attendees?:
    CalendarAttendee[];

  recurrence?:
    string[];

  conferenceRequested?:
    boolean;

  eventType?:
    CalendarEventType;
};


export type CalendarEventPatch =
  Partial<
    CalendarEventDraft
  >;


export type CalendarListInput = {
  calendarId:
    string;

  timeMin:
    string;

  timeMax:
    string;

  syncToken?:
    string | null;

  pageToken?:
    string | null;

  maxResults?:
    number;
};


export type CalendarListResult = {
  events:
    NormalizedCalendarEvent[];

  nextPageToken?:
    string | null;

  nextSyncToken?:
    string | null;
};


export type CalendarAvailabilityInput = {
  calendarId:
    string;

  timeMin:
    string;

  timeMax:
    string;

  timezone:
    string;
};


export type BusyWindow = {
  start:
    string;

  end:
    string;
};


export type CalendarAvailabilityResult = {
  busy:
    BusyWindow[];
};


export type ProviderCalendar = {
  id:
    string;

  name:
    string;

  primary:
    boolean;

  timezone?:
    string | null;
};