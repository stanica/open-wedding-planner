import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export interface CalendarEvent {
  summary: string;
  description?: string;
  start: Date;
  end?: Date;
  location?: string;
}

export class CalendarChannel {
  private auth: OAuth2Client;

  constructor(auth: OAuth2Client) {
    this.auth = auth;
  }

  async createEvent(event: CalendarEvent): Promise<string> {
    const calendar = google.calendar({ version: "v3", auth: this.auth });
    const end = event.end ?? new Date(event.start.getTime() + 60 * 60 * 1000);

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });

    return res.data.id ?? "";
  }

  async listUpcoming(maxResults = 10): Promise<Array<{ id: string; summary: string; start: string }>> {
    const calendar = google.calendar({ version: "v3", auth: this.auth });
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    return (res.data.items ?? []).map((e) => ({
      id: e.id ?? "",
      summary: e.summary ?? "",
      start: e.start?.dateTime ?? e.start?.date ?? "",
    }));
  }

  async deleteEvent(eventId: string): Promise<void> {
    const calendar = google.calendar({ version: "v3", auth: this.auth });
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  }
}
