<script setup lang="ts">
import type { CalendarEvent } from "~/types/calendar";

import { useAlertToast } from "~/composables/useAlertToast";
import { useCalendarEvents } from "~/composables/useCalendarEvents";

definePageMeta({ layout: "upload" });

const { showError, showSuccess } = useAlertToast();
const { createEvent } = useCalendarEvents();
const uploadKey = ref(0);

async function handleCreate(event: CalendarEvent) {
  try {
    const created = await createEvent({
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      color: event.color,
      location: event.location,
      ical_event: event.ical_event,
      users: event.users,
    });
    showSuccess(
      "Event Created",
      `"${created.title}" was added to the calendar`,
    );
    uploadKey.value += 1;
  }
  catch (error) {
    showError(
      "Failed to create event",
      error instanceof Error ? error.message : "Please try again.",
    );
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-start px-4 py-6">
    <div class="mb-4 flex items-center gap-2">
      <UIcon name="i-lucide-calendar-plus" class="h-6 w-6 text-primary" />
      <h1 class="text-lg font-semibold">
        Add Event from Photo
      </h1>
    </div>
    <p class="mb-6 max-w-md text-center text-sm opacity-70">
      Take or choose a photo of an invitation, notice, or event details. The AI
      will turn it into a calendar event for the family calendar.
    </p>
    <div class="w-full max-w-lg rounded-lg border border-default bg-default shadow-lg">
      <AiEventDialog
        :key="uploadKey"
        inline
        is-open
        @create="handleCreate"
      />
    </div>
    <p class="mt-6 max-w-md text-center text-xs opacity-50">
      Events appear on the family calendar at family.couttsfamily.au.
    </p>
  </div>
</template>
