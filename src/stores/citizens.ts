import {
  ref, reactive, watch, computed, watchEffect,
} from 'vue';
import { defineStore } from 'pinia';
import useNumberMap, { type NumberMap } from '@/composables/useNumberMap';
import useResources, { type ResourceKey } from './resources';
import useHappinessStore from './happiness';

export const jobKeys = ['farmers', 'merchants', 'lumberjacks', 'miners', 'builders'] as const;

export const jobResourceMap: {
  [K in Job]: ResourceKey;
} = {
  farmers: 'food',
  merchants: 'gold',
  lumberjacks: 'wood',
  miners: 'iron',
  builders: 'labour',
} as const;

type JobList = typeof jobKeys;
export type Job = JobList[number];

const useTypedJobs = <T extends object = { [K in Job]: number }>
  (defaultStates: T) => reactive<T>(defaultStates);

const useCitizens = defineStore('citizens', () => {
  const resources = useResources();
  const happinessStore = useHappinessStore();

  const citizenCount = ref(5);

  const jobs = useTypedJobs({
    farmers: 0,
    merchants: 0,
    lumberjacks: 0,
    miners: 0,
    builders: 0,
  });

  const jobIncrements: { [key in Job]: NumberMap } = {
    farmers: useNumberMap({ base: 2 }),
    merchants: useNumberMap({ base: 1 }),
    lumberjacks: useNumberMap({ base: 0.4 }),
    miners: useNumberMap({ base: 0.1 }),
    builders: useNumberMap({ base: 1 }),
  } as const;

  const citizensWithJobs = computed(() => Object.values(jobs).reduce((acc, val) => acc + val, 0));

  const idleIncrements = useNumberMap({ base: 1 });
  const foodConsumption = useNumberMap({ base: -0.9 });
  const populationPenalty = useNumberMap({ base: -0.2 });

  const idle = computed(() => {
    const idleCount = citizenCount.value - citizensWithJobs.value;

    return idleCount > 0 ? idleCount : 0;
  });

  watchEffect(() => {
    if (idle.value === 0 && citizensWithJobs.value > citizenCount.value) {
      const temporaryJobsArray = Object.entries(jobs).filter(([key]) => key !== 'idle');

      for (let i = 0; i < citizensWithJobs.value - citizenCount.value; i += 1) {
        const jobWithMaxCount = temporaryJobsArray.reduce(
          (acc, [key, count]) => (count > acc.count ? { key, count } : acc),
          { key: '', count: 0 },
        );

        if (!jobWithMaxCount.key) break;

        jobs[jobWithMaxCount.key as Job] -= 1;
      }
    }
  });

  watch([citizenCount, populationPenalty.total], () => {
    happinessStore.setHappinessImpact('citizens.population', citizenCount.value * populationPenalty.total.value);
  }, { immediate: true });

  watch([citizenCount, foodConsumption.total], () => {
    resources.food.setRevenue('citizens', citizenCount.value * foodConsumption.total.value);
  }, { immediate: true });

  resources.addTickListener(() => {
    if (resources.food.value < 0) {
      citizenCount.value -= 1;
    }
  });

  watch([idle, idleIncrements.total], () => resources.food.setRevenue('citizens.idle', idle.value * idleIncrements.total.value), { immediate: true });

  watchEffect(() => {
    Object.entries(jobResourceMap).forEach(
      ([jobKey, resourceKey]) => {
        const jobKeyTyped = jobKey as Job;
        resources[resourceKey].setRevenue(`citizens.${jobKeyTyped}`, jobs[jobKeyTyped] * jobIncrements[jobKeyTyped].total.value);
      },
    );
  });

  const assignJob = (jobName: Job, count: number) => {
    if (count < 0) {
      assignJob(jobName, 0);
      return;
    }

    const currentCount = jobs[jobName] || 0;
    const maxCount = currentCount + idle.value;

    jobs[jobName] = Math.min(count, maxCount);
  };

  const incrementJob = (jobName: Job, by = 1) => assignJob(jobName, jobs[jobName] + by);

  return {
    idle,
    foodConsumption,
    populationPenalty,
    idleIncrements,
    count: citizenCount,
    jobs,
    jobIncrements,
    assignJob,
    incrementJob,
  };
});

export default useCitizens;
