<template>
  <div id="dashboard-page">
    <SharedHeader />

    <div class="workspace max-w-310 mx-auto" flex="~ col" p="x-4 y-8">
      <div class="px-2 gap-3" flex="~ col" md="flex-row items-center justify-between">
        <h1 font-bold text-3xl>{{ $t("dashboard.my_resumes") }}</h1>
        <div flex="~ wrap gap-2">
          <DashboardNewResume />
          <DashboardFile @update="refresh" />
        </div>
      </div>

      <UiScrollArea class="flex-1 mt-4 px-2">
        <div class="gap-x-4 gap-y-8 pt-4" flex="~ wrap">
          <DashboardResumeItem
            v-for="resume in resumes"
            :key="resume.id"
            :resume="resume"
            @update="refresh"
          />
        </div>
      </UiScrollArea>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { DbResume } from "~/utils/storage";

const { data: resumes, refresh } = useAsyncData<DbResume[]>(
  "resume-list",
  () => storageService.getResumes(),
  {
    server: false,
    default: () => []
  }
);
</script>
