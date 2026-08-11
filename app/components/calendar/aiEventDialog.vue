<script setup lang="ts">
import type { CalendarEvent } from "~/types/calendar";

import { useUsers } from "~/composables/useUsers";
import { DEFAULT_LOCAL_EVENT_COLOR } from "~/types/global";

type ExtractedEvent = {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
};

const props = defineProps<{
  isOpen?: boolean;
  inline?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "create", event: CalendarEvent): void;
}>();

const { users, fetchUsers } = useUsers();

const fileInput = ref<HTMLInputElement | null>(null);
const previewUrl = ref<string | null>(null);
const imageBlob = ref<Blob | null>(null);
const analysing = ref(false);
const errorMessage = ref<string | null>(null);
const extractedEvent = ref<ExtractedEvent | null>(null);

const title = ref("");
const description = ref("");
const location = ref("");
const allDay = ref(false);
const startDate = ref("");
const startTime = ref("");
const endDate = ref("");
const endTime = ref("");
const selectedUserIds = ref<string[]>([]);

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

onMounted(() => {
  fetchUsers();
});

watch(
  () => props.isOpen,
  (open) => {
    if (open && !props.inline) {
      reset();
    }
  },
);

function toggleUser(userId: string) {
  selectedUserIds.value = selectedUserIds.value.includes(userId)
    ? selectedUserIds.value.filter(id => id !== userId)
    : [...selectedUserIds.value, userId];
}

function reset() {
  previewUrl.value = null;
  imageBlob.value = null;
  analysing.value = false;
  errorMessage.value = null;
  extractedEvent.value = null;
  title.value = "";
  description.value = "";
  location.value = "";
  allDay.value = false;
  startDate.value = "";
  startTime.value = "";
  endDate.value = "";
  endTime.value = "";
  selectedUserIds.value = [];
  if (fileInput.value) {
    fileInput.value.value = "";
  }
}

function triggerFileInput() {
  fileInput.value?.click();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

async function compressImage(file: File) {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create image context");
  }
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) {
        resolve(b);
      }
      else {
        reject(new Error("Could not encode image"));
      }
    }, "image/jpeg", JPEG_QUALITY);
  });
  return { blob, dataUrl };
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    errorMessage.value = null;
    try {
      const { blob, dataUrl } = await compressImage(file);
      imageBlob.value = blob;
      previewUrl.value = dataUrl;
    }
    catch (error) {
      errorMessage.value
        = error instanceof Error ? error.message : "Could not read the photo.";
    }
  }
}

async function analyse() {
  if (!imageBlob.value) {
    errorMessage.value = "Choose a photo first";
    return;
  }
  analysing.value = true;
  errorMessage.value = null;
  try {
    const fd = new FormData();
    fd.append("image", imageBlob.value, "photo.jpg");
    const { event } = await $fetch<{ event: ExtractedEvent }>(
      "/api/ai/eventFromImage",
      {
        method: "POST",
        body: fd,
      },
    );
    extractedEvent.value = event;
    title.value = event.title;
    description.value = event.description;
    location.value = event.location;
    allDay.value = event.allDay;
    startDate.value = event.startDate;
    startTime.value = event.startTime ?? "";
    endDate.value = event.endDate;
    endTime.value = event.endTime ?? "";
  }
  catch (error) {
    errorMessage.value
      = error instanceof Error
        ? error.message
        : "Failed to analyse the photo. Please try again.";
  }
  finally {
    analysing.value = false;
  }
}

function back() {
  extractedEvent.value = null;
}

function buildEvent(): CalendarEvent {
  const eventTitle = title.value.trim() ? title.value.trim() : "(no title)";
  let start: Date;
  let end: Date;
  if (allDay.value) {
    const [startYear, startMonth, startDay] = startDate.value
      .split("-")
      .map(Number);
    const [endYear, endMonth, endDay] = endDate.value.split("-").map(Number);
    start = new Date(
      Date.UTC(startYear ?? 0, (startMonth ?? 1) - 1, startDay ?? 1, 0, 0, 0, 0),
    );
    end = new Date(
      Date.UTC(endYear ?? 0, (endMonth ?? 1) - 1, (endDay ?? 1) + 1, 0, 0, 0, 0),
    );
  }
  else {
    start = new Date(`${startDate.value}T${startTime.value || "09:00"}`);
    end
      = endDate.value && endTime.value
        ? new Date(`${endDate.value}T${endTime.value}`)
        : new Date(start.getTime() + 60 * 60 * 1000);
  }
  const eventUsers = users.value
    .filter(user => selectedUserIds.value.includes(user.id))
    .map(user => ({
      id: user.id,
      name: user.name,
      avatar: user.avatar ?? undefined,
      color: user.color ?? undefined,
    }));
  return {
    id: "",
    title: eventTitle,
    description: description.value.trim(),
    start,
    end,
    allDay: allDay.value,
    location: location.value.trim(),
    color: DEFAULT_LOCAL_EVENT_COLOR,
    users: eventUsers,
  };
}

function create() {
  emit("create", buildEvent());
}
</script>

<template>
  <div v-if="inline">
    <div>
      <div class="flex items-center justify-between border-b border-default px-4 py-3">
        <h2 class="text-base font-semibold leading-6">
          Add Event from Photo
        </h2>
      </div>
      <div class="p-4 space-y-6">
        <slot name="content">
          <div
            v-if="errorMessage"
            class="bg-error/10 text-error rounded-md px-3 py-2 text-sm"
          >
            {{ errorMessage }}
          </div>

          <div v-if="extractedEvent" class="space-y-4">
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Title
              </label>
              <UInput
                v-model="title"
                placeholder="Event title"
                class="w-full"
              />
            </div>
            <div class="flex items-center gap-2">
              <UCheckbox v-model="allDay" label="All day" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  Start date
                </label>
                <UInput
                  v-model="startDate"
                  type="date"
                  class="w-full"
                />
              </div>
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  Start time
                </label>
                <UInput
                  v-model="startTime"
                  type="time"
                  class="w-full"
                  :disabled="allDay"
                />
              </div>
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  End date
                </label>
                <UInput
                  v-model="endDate"
                  type="date"
                  class="w-full"
                />
              </div>
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  End time
                </label>
                <UInput
                  v-model="endTime"
                  type="time"
                  class="w-full"
                  :disabled="allDay"
                />
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Location
              </label>
              <UInput
                v-model="location"
                placeholder="Event location"
                class="w-full"
              />
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                People
              </label>
              <div v-if="users.length" class="flex flex-wrap gap-2">
                <UButton
                  v-for="user in users"
                  :key="user.id"
                  variant="ghost"
                  size="sm"
                  class="p-1"
                  :class="
                    selectedUserIds.includes(user.id)
                      ? 'ring-2 ring-primary-500'
                      : ''
                  "
                  @click="toggleUser(user.id)"
                >
                  <UAvatar
                    :src="user.avatar || undefined"
                    :alt="user.name"
                    size="xl"
                  />
                </UButton>
              </div>
              <div v-else class="text-sm text-muted">
                No users found.
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Description
              </label>
              <UTextarea
                v-model="description"
                placeholder="Event description"
                :rows="3"
                class="w-full"
              />
            </div>
            <div class="flex items-center justify-between pt-2">
              <UButton
                variant="ghost"
                icon="i-lucide-arrow-left"
                label="Back"
                @click="back"
              />
              <UButton
                color="primary"
                icon="i-lucide-check"
                label="Create event"
                @click="create"
              />
            </div>
          </div>

          <div v-else>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileChange"
            >
            <div class="flex flex-col items-center gap-4 py-4">
              <div
                v-if="previewUrl"
                class="w-full overflow-hidden rounded-lg border border-default"
              >
                <img
                  :src="previewUrl"
                  alt="Photo preview"
                  class="max-h-72 w-full object-contain"
                >
              </div>
              <div
                v-else
                class="flex h-48 w-full items-center justify-center rounded-lg border-2 border-dashed border-default-300 text-default-400"
              >
                <div class="flex flex-col items-center gap-2 text-sm">
                  <UIcon name="i-lucide-image" class="h-10 w-10" />
                  <span>No photo selected</span>
                </div>
              </div>
              <div class="flex flex-wrap items-center justify-center gap-2">
                <UButton
                  icon="i-lucide-camera"
                  :label="
                    previewUrl ? 'Choose different photo' : 'Take or choose a photo'
                  "
                  @click="triggerFileInput"
                />
                <UButton
                  v-if="imageBlob"
                  icon="i-lucide-sparkles"
                  label="Analyse with AI"
                  color="primary"
                  :loading="analysing"
                  @click="analyse"
                />
              </div>
              <p class="max-w-sm text-center text-xs opacity-60">
                Snap a photo of an invitation, notice, or event details. The AI
                will extract the date, time, location, and description for you
                to review.
              </p>
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
  <div
    v-else-if="isOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
    @click="emit('close')"
  >
    <div
      class="w-[425px] max-h-[90vh] overflow-y-auto bg-default rounded-lg border border-default shadow-lg"
      @click.stop
    >
      <div class="flex items-center justify-between p-4 border-b border-default">
        <h2 class="text-base font-semibold leading-6">
          Add Event from Photo
        </h2>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          class="-my-1"
          aria-label="Close dialog"
          @click="emit('close')"
        />
      </div>
      <div class="p-4 space-y-6">
        <slot name="content">
          <div
            v-if="errorMessage"
            class="bg-error/10 text-error rounded-md px-3 py-2 text-sm"
          >
            {{ errorMessage }}
          </div>

          <div v-if="extractedEvent" class="space-y-4">
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Title
              </label>
              <UInput
                v-model="title"
                placeholder="Event title"
                class="w-full"
              />
            </div>
            <div class="flex items-center gap-2">
              <UCheckbox v-model="allDay" label="All day" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  Start date
                </label>
                <UInput
                  v-model="startDate"
                  type="date"
                  class="w-full"
                />
              </div>
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  Start time
                </label>
                <UInput
                  v-model="startTime"
                  type="time"
                  class="w-full"
                  :disabled="allDay"
                />
              </div>
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  End date
                </label>
                <UInput
                  v-model="endDate"
                  type="date"
                  class="w-full"
                />
              </div>
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">
                  End time
                </label>
                <UInput
                  v-model="endTime"
                  type="time"
                  class="w-full"
                  :disabled="allDay"
                />
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Location
              </label>
              <UInput
                v-model="location"
                placeholder="Event location"
                class="w-full"
              />
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                People
              </label>
              <div v-if="users.length" class="flex flex-wrap gap-2">
                <UButton
                  v-for="user in users"
                  :key="user.id"
                  variant="ghost"
                  size="sm"
                  class="p-1"
                  :class="
                    selectedUserIds.includes(user.id)
                      ? 'ring-2 ring-primary-500'
                      : ''
                  "
                  @click="toggleUser(user.id)"
                >
                  <UAvatar
                    :src="user.avatar || undefined"
                    :alt="user.name"
                    size="xl"
                  />
                </UButton>
              </div>
              <div v-else class="text-sm text-muted">
                No users found.
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Description
              </label>
              <UTextarea
                v-model="description"
                placeholder="Event description"
                :rows="3"
                class="w-full"
              />
            </div>
            <div class="flex items-center justify-between pt-2">
              <UButton
                variant="ghost"
                icon="i-lucide-arrow-left"
                label="Back"
                @click="back"
              />
              <UButton
                color="primary"
                icon="i-lucide-check"
                label="Create event"
                @click="create"
              />
            </div>
          </div>

          <div v-else>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileChange"
            >
            <div class="flex flex-col items-center gap-4 py-4">
              <div
                v-if="previewUrl"
                class="w-full overflow-hidden rounded-lg border border-default"
              >
                <img
                  :src="previewUrl"
                  alt="Photo preview"
                  class="max-h-72 w-full object-contain"
                >
              </div>
              <div
                v-else
                class="flex h-48 w-full items-center justify-center rounded-lg border-2 border-dashed border-default-300 text-default-400"
              >
                <div class="flex flex-col items-center gap-2 text-sm">
                  <UIcon name="i-lucide-image" class="h-10 w-10" />
                  <span>No photo selected</span>
                </div>
              </div>
              <div class="flex flex-wrap items-center justify-center gap-2">
                <UButton
                  icon="i-lucide-camera"
                  :label="
                    previewUrl ? 'Choose different photo' : 'Take or choose a photo'
                  "
                  @click="triggerFileInput"
                />
                <UButton
                  v-if="imageBlob"
                  icon="i-lucide-sparkles"
                  label="Analyse with AI"
                  color="primary"
                  :loading="analysing"
                  @click="analyse"
                />
              </div>
              <p class="max-w-sm text-center text-xs opacity-60">
                Snap a photo of an invitation, notice, or event details. The AI
                will extract the date, time, location, and description for you
                to review.
              </p>
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>
